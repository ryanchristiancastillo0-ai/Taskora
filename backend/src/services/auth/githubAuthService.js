"use strict";

/**
 * GitHub Sign-In, and nothing else.
 *
 * The same three responsibilities GoogleAuthService has, against a different
 * provider:
 *
 *   1. The conversation with GitHub — building the authorization URL, redeeming
 *      the code, reading the verified profile.
 *   2. Deciding which Taskora account a verified GitHub profile belongs to.
 *   3. Turning a failure into a short, non-sensitive code the frontend can put
 *      on screen.
 *
 * It deliberately does NOT mint tokens, set cookies, or write an audit row. A
 * GitHub sign-in reaches AuthService.createTokens, utils/cookie.js and the auth
 * controller through exactly the same calls an email/password sign-in does, so
 * there is still one session system and one refresh-token implementation. The
 * differences from Google are all in this file, and they are the differences
 * between the two providers, not between two products.
 *
 * WHY NO LIBRARY
 * Taskora talks to Brevo, ZeroBounce, Gemini and OpenRouter by hand, over
 * global fetch, with an explicit timeout and a mask that keeps keys out of log
 * lines. Google is handled that way already; GitHub is the same shape again,
 * which keeps package.json untouched and puts the CSRF, timeout and
 * secret-handling decisions where they can be read.
 *
 * WHAT GITHUB DOES NOT ASSERT THE WAY GOOGLE DOES
 * GitHub's `id` is stable, but a public profile carries no verified address:
 * `/user` answers with `email: null` for anyone who has not published one, and
 * a published one is not necessarily verified. So the address is read from
 * `/user/emails`, which reports `verified` per address, and only a verified one
 * is accepted. That flag is the whole basis on which an existing password
 * account may be linked below — without it, matching on email alone would let
 * any GitHub account claim an address somebody else registered here with.
 */

const crypto = require("crypto");
const AppError = require("../../utils/AppError.js");

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const EMAILS_URL = "https://api.github.com/user/emails";

// `user:email` is what unlocks /user/emails; `read:user` is the profile. Those
// two answer "who is this" and "may I have their address" and nothing else —
// no repo, no org, no follow scopes, because asking for access the sign-in
// does not use is how an app earns a consent screen nobody reads.
const SCOPES = ["read:user", "user:email"];

// Same rationale as the Google flow: give up before the provider does, so a
// slow GitHub degrades into a failed sign-in rather than into a request this
// server is still holding open long after the user gave up on it.
const REQUEST_TIMEOUT_SECONDS = 15;
const REQUEST_TIMEOUT_MS = (REQUEST_TIMEOUT_SECONDS + 5) * 1000;

// GitHub's API refuses a request with no User-Agent, and an unset one is the
// difference between a working exchange and a 403 that reads like a provider
// outage. Node's fetch does not reliably set one.
const USER_AGENT = "Taskora";

// Column widths in the existing schema.
const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 191;

// Deliberately loose. The address has already been vouched for by GitHub; this
// only rejects a missing or obviously malformed one before it is used as a
// lookup key.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A committed placeholder must read as "not configured", not as a credential.
 *
 * .env.example ships safe placeholder strings and the documented callback URL
 * still contains the literal BACKEND_PORT. Reading those as unset turns a fresh
 * clone into "GitHub is not available yet" instead of a provider error for what
 * is really an unfinished setup step.
 */
const PLACEHOLDER_VALUE =
  /^(?:your[_-]|your\b|placeholder|<|\{\{|changeme|replace[_-]?me|todo|xxx)/i;

function isUsableSecret(value) {
  const text = String(value ?? "").trim();

  if (!text) return false;
  if (PLACEHOLDER_VALUE.test(text)) return false;
  if (text.includes("BACKEND_PORT")) return false;

  return true;
}

const text = (value, max) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

/**
 * The one sentence any unexpected failure is reported as.
 *
 * The token request carries the client secret in its body, and a provider
 * error can quote the request that produced it. Nothing from upstream reaches
 * the browser through this flow, so there is exactly one string to get wrong
 * and it contains no detail.
 */
const GENERIC_MESSAGE =
  "GitHub sign-in is temporarily unavailable. Please try again.";

/**
 * An AppError that also carries a closed-vocabulary code for the frontend.
 *
 * The browser is a redirect target here, not an API caller, so it cannot
 * receive a status code and has to be told what happened through a query
 * parameter. Codes are prefixed `github_` on the way out so the login page can
 * tell the two providers apart without the backend ever naming a provider
 * response.
 */
class GitHubAuthError extends AppError {
  constructor(reason, message = GENERIC_MESSAGE, statusCode = 400) {
    super(message, statusCode);
    this.name = "GitHubAuthError";
    this.reason = reason;
  }
}

class GitHubAuthService {
  /**
   * `env` defaults to process.env and is held by reference, so a value read
   * from it is current at call time rather than frozen at construction — which
   * is what lets a test exercise the unconfigured path without rebuilding the
   * app.
   */
  constructor(prisma, passwordService, supportService = null, env = process.env) {
    this.prisma = prisma;
    this.passwordService = passwordService;

    // Same optional-dependency contract as AuthService: the only reason it is
    // here is the "a new account exists" admin bell, and a missing writer must
    // degrade to no bell rather than to a failed sign-in.
    this.supportService = supportService;

    this.env = env;
  }

  get clientId() {
    return text(this.env.GITHUB_CLIENT_ID, 500);
  }

  get clientSecret() {
    return text(this.env.GITHUB_CLIENT_SECRET, 500);
  }

  get callbackUrl() {
    return text(this.env.GITHUB_CALLBACK_URL, 500);
  }

  /**
   * Where the callback sends the browser once cookies are set, and where it
   * sends it when something went wrong.
   *
   * CORS_ORIGIN is reused rather than introducing FRONTEND_URL: it is already
   * required to be the one frontend origin this backend serves, and a second
   * variable holding the same fact is a second thing that can be wrong in
   * exactly one environment. GITHUB_REDIRECT_URL overrides it for a deployment
   * whose landing page differs from its origin.
   */
  get frontendUrl() {
    return text(this.env.GITHUB_REDIRECT_URL || this.env.CORS_ORIGIN, 500).replace(
      /\/+$/,
      ""
    );
  }

  /**
   * Whether the three values this flow needs are all real.
   *
   * Checked on both routes rather than once at boot, so a deployment that adds
   * GitHub credentials later starts working without a restart, and one that
   * never adds them degrades to a clear message instead of a provider error.
   */
  isConfigured() {
    return (
      isUsableSecret(this.clientId) &&
      isUsableSecret(this.clientSecret) &&
      isUsableSecret(this.callbackUrl) &&
      Boolean(this.frontendUrl)
    );
  }

  // ------------------------------------------------------------------ redirects

  successRedirect() {
    // The frontend root, which is where the login form sends people too. From
    // there the app's own guards take over: RedirectIfSignedIn sends an
    // administrator to /admin, and RequireOnboardingComplete sends an account
    // with no completed interview to /onboarding. Neither rule is restated here.
    return this.frontendUrl || "/";
  }

  /**
   * Turns any thrown value into a redirect the browser can follow.
   *
   * A GitHubAuthError carries its own code; everything else collapses to
   * "failed". That default is the security property: an unexpected error cannot
   * describe itself in the URL, because it has no vocabulary to do it with.
   */
  failureRedirect(error) {
    console.error("[GitHubAuth] failure:", error);

    const reason = error instanceof GitHubAuthError ? error.reason : "failed";

    // Prefixed here and nowhere else: the frontend reads one `authError`
    // parameter for both providers, and `github_failed` is how it knows whose
    // message to show.
    const code = `github_${reason}`;

    if (!this.frontendUrl) {
      return `/login?authError=${encodeURIComponent(code)}`;
    }

    const url = new URL(`${this.frontendUrl}/login`);
    url.searchParams.set("authError", code);

    return url.toString();
  }

  // -------------------------------------------------------------- authorization

  /**
   * Step one: a fresh state value and the URL to send the browser to.
   *
   * Called on every attempt rather than reusing a value, so two tabs opened at
   * the same time cannot redeem each other's callbacks.
   */
  beginAuthorization() {
    if (!this.isConfigured()) {
      throw new GitHubAuthError(
        "not_configured",
        "GitHub sign-in is not configured on this server",
        503
      );
    }

    // 256 bits. This is the CSRF token for the whole flow, and a guessable one
    // would be the same as having none.
    const state = crypto.randomBytes(32).toString("hex");

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.callbackUrl);
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    // GitHub's own equivalent of Google's account chooser: without it the flow
    // signs in as whichever account the browser's github.com session happens to
    // hold, with no chance to pick another.
    url.searchParams.set("allow_signup", "true");

    return { state, authorizationUrl: url.toString() };
  }

  /**
   * Step two: verify the callback, then turn it into a Taskora account.
   *
   * `expectedState` is the httpOnly cookie this server wrote in step one, and
   * `state` is what came back on the URL. They are only ever equal when this
   * server started this attempt.
   */
  async completeAuthorization({ code, state, error, expectedState }) {
    // A refusal comes back as `error=access_denied` and no code.
    if (error) {
      throw new GitHubAuthError("cancelled");
    }

    // Checked before the code is spent, and that ordering is the point: a
    // callback whose state does not match the cookie was not started by this
    // server for this browser.
    this.assertState(expectedState, state);

    if (typeof code !== "string" || !code.trim()) {
      throw new GitHubAuthError("invalid_callback");
    }

    const accessToken = await this.exchangeCode(code.trim());
    const profile = await this.fetchVerifiedProfile(accessToken);

    return this.resolveUser(profile);
  }

  /**
   * Constant-time comparison of the state this server issued against the state
   * that came back.
   *
   * A missing value on either side is the same failure as a mismatched one. The
   * common causes are a bookmarked or refreshed callback URL, and a browser
   * whose state cookie has expired or been cleared — all of which fail closed
   * with the same message rather than being distinguishable by an attacker.
   */
  assertState(expected, received) {
    const expectedText = String(expected ?? "");
    const receivedText = String(received ?? "");

    if (!expectedText || !receivedText) {
      throw new GitHubAuthError("invalid_state");
    }

    const expectedBytes = Buffer.from(expectedText, "utf8");
    const receivedBytes = Buffer.from(receivedText, "utf8");

    // Length first, because timingSafeEqual throws on a mismatch and a
    // constant-time compare across two different lengths is not a thing.
    if (
      expectedBytes.length !== receivedBytes.length ||
      !crypto.timingSafeEqual(expectedBytes, receivedBytes)
    ) {
      throw new GitHubAuthError("invalid_state");
    }
  }

  /**
   * Trades the authorization code for an access token.
   *
   * `Accept: application/json` matters here in a way it does not for Google:
   * GitHub answers a token request with `application/x-www-form-urlencoded` by
   * default, and parsing that by hand would be a second format to get wrong for
   * no benefit.
   */
  async exchangeCode(code) {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.callbackUrl,
    });

    const payload = await this.requestJson(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
      body: body.toString(),
    });

    // GitHub reports a bad client, a bad code or a mismatched redirect_uri as
    // an `error` field in a 200 response rather than as a status code, so the
    // status check above is not enough on its own.
    if (payload?.error) {
      console.error(
        `[GitHubAuthService] token endpoint answered error=${this.mask(
          payload.error
        )}`
      );
      throw new GitHubAuthError("invalid_callback");
    }

    if (typeof payload?.access_token !== "string" || !payload.access_token) {
      console.error(
        "[GitHubAuthService] token response carried no access_token"
      );
      throw new GitHubAuthError("failed");
    }

    // Returned to the caller, used once and dropped: Taskora makes no further
    // GitHub API calls, so keeping it would be storing a credential for nothing.
    return payload.access_token;
  }

  /**
   * Reads the identity GitHub asserts for this access token.
   *
   * The access token is the proof: it was minted by GitHub for this client_id,
   * so what comes back is GitHub's statement rather than anything the browser
   * chose, which is what makes `id` usable as an identity here.
   */
  async fetchVerifiedProfile(accessToken) {
    const user = await this.requestJson(USER_URL, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/vnd.github+json",
        "user-agent": USER_AGENT,
      },
    });

    const emails = await this.requestJson(EMAILS_URL, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/vnd.github+json",
        "user-agent": USER_AGENT,
      },
    }).catch(() => []);

    return this.normalizeProfile(user, emails);
  }

  /**
   * Reduces GitHub's claims to the fields Taskora stores, rejecting anything
   * incomplete rather than filling it in.
   */
  normalizeProfile(raw, emails) {
    const subject = raw?.id == null ? "" : String(raw.id);

    // Preferred order: the address GitHub marks primary and verified, then any
    // verified one. An address nobody has verified is not used at all — see the
    // note at the top of this file about what that flag is protecting.
    const list = Array.isArray(emails) ? emails : [];
    const chosen =
      list.find((entry) => entry?.verified && entry?.primary) ||
      list.find((entry) => entry?.verified) ||
      null;

    const email = text(chosen?.email ?? raw?.email, 320).toLowerCase();

    if (!subject || !chosen || !EMAIL_SHAPE.test(email)) {
      throw new GitHubAuthError("incomplete_profile");
    }

    // `login` is GitHub's unique handle and is always present, so it is a
    // stronger fallback than the address prefix and never needs inventing.
    const login = text(raw?.login, MAX_NAME_LENGTH);
    const fullName = text(raw?.name, 200).split(/\s+/).filter(Boolean);

    return {
      githubId: subject,
      email,
      // From the verified list, so it is true by construction here. Kept as an
      // explicit field rather than inlined below because linkExisting() reads
      // it as the single condition for attaching GitHub to a password account.
      emailVerified: true,
      // `firstName` is NOT NULL in the schema and a GitHub profile may carry no
      // display name at all, so there is a chain of progressively weaker
      // fallbacks. Each is a value GitHub supplied — handle first, because it
      // is the one that is guaranteed unique and human-readable.
      firstName: fullName[0] || login || text(email.split("@")[0], MAX_NAME_LENGTH) || "User",
      lastName: fullName.length > 1 ? text(fullName.slice(1).join(" "), MAX_NAME_LENGTH) : null,
      // Public avatar URL, so resolveAssetUrl passes it through unchanged.
      // Applied once at creation: an avatar the person chose inside Taskora is
      // not something a GitHub profile may replace later.
      avatarUrl: text(raw?.avatar_url, MAX_URL_LENGTH) || null,
    };
  }

  // ------------------------------------------------------------------ resolution

  /**
   * Finds the Taskora account a verified GitHub profile belongs to.
   *
   * Three cases, in this order, and the order is the safety property:
   *
   *   1. Already linked by githubId — sign that account in. Keyed on the
   *      identifier that cannot change, so it keeps working after the person
   *      changes their Taskora email.
   *   2. An account exists with the same email — link, but only under the
   *      conditions linkExisting enforces.
   *   3. Nothing matches — create.
   */
  async resolveUser(profile) {
    const linked = await this.prisma.user.findUnique({
      where: { githubId: profile.githubId },
    });

    if (linked) {
      return { user: linked, created: false, linkedNow: false };
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (existing) {
      return this.linkExisting(existing, profile);
    }

    return this.createGitHubUser(profile);
  }

  /**
   * Attaches GitHub to an account that already exists, without touching
   * anything else about it.
   */
  async linkExisting(existing, profile) {
    // An account already tied to a *different* GitHub identity is not a
    // duplicate to tidy up, it belongs to somebody else. Re-pointing githubId
    // would hand that Taskora account — and everything in it — to whoever
    // controls the new handle.
    if (existing.githubId) {
      throw new GitHubAuthError(
        "account_conflict",
        "An account with this email already exists",
        409
      );
    }

    // Everything from here rests on the verified flag. Without it, matching on
    // email alone would mean any GitHub account could claim an address that
    // somebody registered here with a password, which is account takeover
    // dressed up as a convenience feature.
    if (!profile.emailVerified) {
      throw new GitHubAuthError(
        "account_conflict",
        "GitHub has not verified this email address",
        403
      );
    }

    // Only the link is written. `passwordHash` is not read, not compared and
    // not overwritten, so a password this account already had keeps working
    // exactly as it did, and the account can now be reached both ways.
    const user = await this.prisma.user.update({
      where: { id: existing.id },
      data: { githubId: profile.githubId },
    });

    return { user, created: false, linkedNow: true };
  }

  /**
   * Creates a Taskora account for a GitHub identity Taskora has not seen.
   */
  async createGitHubUser(profile) {
    // `User.passwordHash` is NOT NULL and a GitHub account has no password, so
    // one is invented rather than the column being relaxed. 256 bits from the
    // CSPRNG, hashed at the application's own cost: nobody holds this value, so
    // password sign-in is impossible for the account, and a leaked hash is no
    // more useful than any other.
    const passwordHash = await this.passwordService.hash(
      crypto.randomBytes(32).toString("hex")
    );

    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        passwordHash,
        firstName: profile.firstName,
        lastName: profile.lastName,
        githubId: profile.githubId,
        avatarUrl: profile.avatarUrl,
      },
    });

    // The same row AuthService.register writes. Without it /auth/me reports
    // `isNew` from a profile that does not exist, and the frontend's onboarding
    // guard would send a brand new account to an interview whose answers have
    // nowhere to go.
    await this.prisma.personalizationProfile.create({
      data: { userId: user.id },
    });

    // A GitHub signup is still a signup, so the admins are told, through the
    // same notifier and with the same swallow-own-failures behaviour as
    // register().
    if (this.supportService) {
      await this.supportService.notifyAdminsNewUser(user);
    }

    return { user, created: true, linkedNow: false };
  }

  // --------------------------------------------------------------------- plumbing

  /**
   * Keeps the client id and secret out of log lines.
   *
   * The token request carries the secret in its body, and some fetch failures
   * quote the request back in their message. Applied to everything this service
   * prints, for the same reason EmailValidationService.mask exists.
   */
  mask(value) {
    let masked = String(value ?? "");

    for (const secret of [this.clientSecret, this.clientId]) {
      if (secret) masked = masked.split(secret).join("***");
    }

    return masked;
  }

  /**
   * One JSON request, with the timeout, the status check and the log
   * discipline every Taskora provider call already follows.
   *
   * A network failure, a non-2xx and an unparseable body are all the same thing
   * to the browser — a failed sign-in — and all three are reported as one code.
   */
  async requestJson(url, init) {
    const host = new URL(url).host;

    let response;

    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      console.error(
        `[GitHubAuthService] request to ${host} failed: ${this.mask(
          error && error.message
        )}`
      );
      throw new GitHubAuthError("failed");
    }

    if (!response.ok) {
      const detail = await response
        .text()
        .catch(() => `${response.status} ${response.statusText}`);

      console.error(
        `[GitHubAuthService] ${host} answered ${response.status}: ${this.mask(
          detail
        ).slice(0, 300)}`
      );
      throw new GitHubAuthError("failed");
    }

    let payload;

    try {
      payload = await response.json();
    } catch {
      console.error(`[GitHubAuthService] ${host} returned a non-JSON body`);
      throw new GitHubAuthError("failed");
    }

    if (!payload || typeof payload !== "object") {
      console.error(`[GitHubAuthService] ${host} returned a non-object body`);
      throw new GitHubAuthError("failed");
    }

    return payload;
  }
}

module.exports = GitHubAuthService;
module.exports.GitHubAuthError = GitHubAuthError;
