"use strict";
console.log("GoogleAuthService LOADED from:", __filename);

/**
 * Google Sign-In, and nothing else.
 *
 * This class owns three things and delegates everything else:
 *
 *   1. The conversation with Google — building the authorization URL, redeeming
 *      the code, reading the verified profile.
 *   2. Deciding which Taskora account a verified Google profile belongs to.
 *   3. Turning a failure into a short, non-sensitive code the frontend can put
 *      on screen.
 *
 * It deliberately does NOT mint tokens, set cookies, or write an audit row. Those
 * belong to AuthService.createTokens, utils/cookie.js and the auth controller,
 * which a Google sign-in reaches through exactly the same calls an email/password
 * sign-in does. That is the whole reason this feature is additive: there is one
 * session system, one refresh-token implementation and one set of cookies, and
 * Google is only the thing that answers "who is this".
 *
 * WHY NO LIBRARY
 * Taskora talks to Brevo, ZeroBounce, Gemini and OpenRouter by hand, over global
 * fetch, with an explicit timeout and a mask that keeps keys out of log lines
 * (see emailValidationService.js for the same shape). Google is handled the same
 * way rather than by adding a dependency, which keeps package.json untouched and
 * puts the CSRF, timeout and secret-handling decisions where they can be read.
 *
 * WHY THE PROFILE IS TRUSTED
 * The claims used here are read from Google's userinfo endpoint using an access
 * token that this server obtained by redeeming an authorization code against
 * Google's token endpoint with its own client secret. Nothing in the profile is
 * accepted from the browser: the callback carries a `code`, never a profile, so a
 * caller cannot assert an identity, an email or a `sub` of their choosing. The
 * Google access token is used once and never stored, because Taskora calls no
 * Google API on the user's behalf afterwards.
 */

const crypto = require("crypto");
const AppError = require("../../utils/AppError.js");

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

// openid + email + profile is the smallest set that answers "who is this" and
// "may I have their address". Nothing Taskora does afterwards needs drive,
// calendar or contacts, and asking for scopes it will not use is how an app
// earns a consent screen nobody reads.
const SCOPES = ["openid", "email", "profile"];

// ZeroBounce accepts up to 60s before answering "unknown", so we give up first:
// a slow provider should degrade into a failed sign-in, not into a request this
// server is still holding open long after the user gave up on it.
const REQUEST_TIMEOUT_SECONDS = 15;
const REQUEST_TIMEOUT_MS = (REQUEST_TIMEOUT_SECONDS + 5) * 1000;

// Column widths in the existing schema. A profile longer than its column is a
// failed insert, and a failed insert on a name is not worth a 500.
const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 191;

// Deliberately loose. The address has already been vouched for by Google; this
// only rejects a missing or obviously malformed one before it is used as a
// lookup key, so the shape check stays simpler than the registration validator
// and cannot drift from it.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A committed placeholder must read as "not configured", not as a credential.
 *
 * .env.example ships safe placeholder strings and the documented callback URL
 * still contains the literal BACKEND_PORT, and a developer is expected to copy
 * that file to .env. If those were treated as real values, a fresh clone would
 * send a genuine authorization request carrying "your_client_id_here", fail at
 * Google, and report a provider error for what is really an unfinished setup
 * step. Reading them as unset instead turns the same situation into the button
 * quietly reporting that Google is not available yet.
 */
const PLACEHOLDER_VALUE =
  /^(?:your[_-]|your\b|placeholder|<|\{\{|changeme|replace[_-]?me|todo|xxx)/i;

function isUsableSecret(value) {
  const text = String(value ?? "").trim();

  if (!text) return false;
  if (PLACEHOLDER_VALUE.test(text)) return false;
  // The documented callback template still carries the literal BACKEND_PORT.
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
 * A provider error can quote the request that produced it, and the token request
 * carries the client secret in its body. Nothing from upstream reaches the
 * browser through this flow, so there is exactly one string to get wrong and it
 * contains no detail.
 */
const GENERIC_MESSAGE =
  "Google sign-in is temporarily unavailable. Please try again.";

/**
 * An AppError that also carries a closed-vocabulary code for the frontend.
 *
 * The browser is a redirect target here, not an API caller, so it cannot receive
 * a status code and has to be told what happened through a query parameter. That
 * parameter is the only thing crossing back, and its vocabulary lives entirely in
 * this file — so a provider message, a Google error string or a database error
 * has no path into a URL, whatever else goes wrong upstream.
 */
class GoogleAuthError extends AppError {
  constructor(reason, message = GENERIC_MESSAGE, statusCode = 400) {
    super(message, statusCode);
    this.name = "GoogleAuthError";
    this.reason = reason;
  }
}

class GoogleAuthService {
  /**
   * `env` defaults to process.env and is held by reference, so a value read from
   * it is current at call time rather than frozen at construction. That is what
   * lets a test exercise the unconfigured path without rebuilding the app.
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
    return text(this.env.GOOGLE_CLIENT_ID, 500);
  }

  get clientSecret() {
    return text(this.env.GOOGLE_CLIENT_SECRET, 500);
  }

  get callbackUrl() {
    return text(this.env.GOOGLE_CALLBACK_URL, 500);
  }

  /**
   * Where the callback sends the browser once cookies are set, and where it
   * sends it when something went wrong.
   *
   * CORS_ORIGIN is reused rather than introducing FRONTEND_URL. It is already
   * required to be the one frontend origin this backend serves, it is already
   * set on every environment that works, and a second variable holding the same
   * fact is a second thing that can be wrong in exactly one environment.
   * GOOGLE_REDIRECT_URL overrides it for a deployment whose landing page differs
   * from its origin.
   */
  get frontendUrl() {
    return text(this.env.GOOGLE_REDIRECT_URL || this.env.CORS_ORIGIN, 500).replace(
      /\/+$/,
      ""
    );
  }

  /**
   * Whether the three values this flow needs are all real.
   *
   * Checked on both routes rather than once at boot, so a deployment that adds
   * Google credentials later starts working without a restart, and one that never
   * adds them degrades to a clear message instead of a provider error.
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
    // with no completed interview to /onboarding. Deciding either of those here
    // would duplicate a rule that already exists in one place.
    return this.frontendUrl || "/";
  }

  /**
   * Turns any thrown value into a redirect the browser can follow.
   *
   * A GoogleAuthError carries its own code; everything else collapses to
   * "failed". That default is the security property: an unexpected error — a
   * dropped database connection, a bug, a rejected promise — cannot describe
   * itself in the URL, because it has no vocabulary to do it with.
   */
  failureRedirect(error) {
      console.error("[GoogleAuth] failure:", error);
    const reason = error instanceof GoogleAuthError ? error.reason : "failed";

    // No frontend origin configured is itself a misconfiguration, and it is
    // already covered by `not_configured` on the way in. Falling back to a
    // relative path here keeps a redirect possible on a server that somehow has
    // neither, instead of letting URL parsing throw out of the error handler.
    if (!this.frontendUrl) {
      return `/login?authError=${encodeURIComponent(reason)}`;
    }

    const url = new URL(`${this.frontendUrl}/login`);
    url.searchParams.set("authError", reason);

    return url.toString();
  }

  // -------------------------------------------------------------- authorization

  /**
   * Step one: a fresh state value and the URL to send the browser to.
   *
   * Called on every attempt rather than reusing a value, so two tabs opened at the
   * same time cannot redeem each other's callbacks.
   */
  beginAuthorization() {
    if (!this.isConfigured()) {
      throw new GoogleAuthError(
        "not_configured",
        "Google sign-in is not configured on this server",
        503
      );
    }

    // 256 bits. This is the CSRF token for the whole flow, and a guessable one
    // would be the same as having none.
    const state = crypto.randomBytes(32).toString("hex");

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    // Taskora never calls a Google API afterwards, so the user is never asked to
    // consent to offline access and no refresh token is ever issued.
    url.searchParams.set("access_type", "online");
    // The account chooser, so a "Continue with Google" button cannot silently
    // sign somebody in as whichever account the browser happened to hold.
    url.searchParams.set("prompt", "select_account");

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
    // Google reports a refusal by redirecting back with `error` and no code.
    // `access_denied` is the person pressing Cancel; anything else from the
    // provider looks the same from out here, because the difference is not
    // something they can act on.
    if (error) {
      throw new GoogleAuthError("cancelled");
    }

    // Checked before the code is spent, and that ordering is the point. A
    // callback whose state does not match the cookie was not started by this
    // server for this browser; redeeming the code anyway would let somebody who
    // can reach this endpoint feed their own Google authorization into another
    // person's Taskora session.
    this.assertState(expectedState, state);

    if (typeof code !== "string" || !code.trim()) {
      throw new GoogleAuthError("invalid_callback");
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
   * common causes are a bookmarked or refreshed callback URL, and a browser whose
   * state cookie has expired or been cleared — all of which should fail closed
   * with the same message rather than being distinguishable by an attacker.
   */
  assertState(expected, received) {
    const expectedText = String(expected ?? "");
    const receivedText = String(received ?? "");

    if (!expectedText || !receivedText) {
      throw new GoogleAuthError("invalid_state");
    }

    const expectedBytes = Buffer.from(expectedText, "utf8");
    const receivedBytes = Buffer.from(receivedText, "utf8");

    // Length first, because timingSafeEqual throws on a mismatch and a
    // constant-time compare across two different lengths is not a thing.
    if (
      expectedBytes.length !== receivedBytes.length ||
      !crypto.timingSafeEqual(expectedBytes, receivedBytes)
    ) {
      throw new GoogleAuthError("invalid_state");
    }
  }

  /**
   * Trades the authorization code for an access token.
   *
   * application/x-www-form-urlencoded in the body rather than Basic auth in the
   * header, because that is the form Google's own documentation uses and the one
   * both of Google's accepted client types handle identically.
   */
  async exchangeCode(code) {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.callbackUrl,
      grant_type: "authorization_code",
    });

    const payload = await this.requestJson(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
    });

    if (typeof payload?.access_token !== "string" || !payload.access_token) {
      console.error(
        "[GoogleAuthService] token response carried no access_token"
      );
      throw new GoogleAuthError("failed");
    }

    // Returned to the caller, used once and dropped. Not written to the database,
    // not logged, not put in a cookie: Taskora makes no Google API calls on the
    // user's behalf, so keeping it would be storing a credential for nothing.
    return payload.access_token;
  }

  /**
   * Reads the identity Google asserts for this access token.
   *
   * The access token is the proof. It was minted by Google for this client_id,
   * so what comes back is Google's statement rather than anything the browser
   * chose, which is what makes `sub` usable as an identity here.
   */
  async fetchVerifiedProfile(accessToken) {
    const payload = await this.requestJson(USERINFO_URL, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });

    return this.normalizeProfile(payload);
  }

  /**
   * Reduces Google's claims to the fields Taskora stores, rejecting anything
   * incomplete rather than filling it in.
   */
  normalizeProfile(raw) {
    const subject = text(raw?.sub, 191);
    const email = text(raw?.email, 320).toLowerCase();

    // `sub` is Google's stable identifier for the account: it never changes and
    // is never reused, which is exactly why it is the lookup key below. It is
    // absent on some consumer profiles, and `email` is not a substitute — a
    // Workspace administrator can rename the address behind it.
    if (!subject || !EMAIL_SHAPE.test(email)) {
      throw new GoogleAuthError("incomplete_profile");
    }

    const givenName = text(raw?.given_name, MAX_NAME_LENGTH);
    const familyName = text(raw?.family_name, MAX_NAME_LENGTH);
    const nameParts = text(raw?.name, 200).split(/\s+/).filter(Boolean);

    return {
      googleId: subject,
      email,
      // Google only asserts this about a mailbox it has itself verified. It is
      // the entire basis on which an existing password account may be linked
      // below, so an absent flag is read as "not verified" rather than as a
      // maybe — and only the literal boolean/string forms count, so a truthy
      // value that happens to arrive cannot vouch for anything.
      emailVerified: raw?.email_verified === true || raw?.email_verified === "true",
      // `firstName` is NOT NULL in the schema and a Google profile may carry no
      // name at all, so there is a chain of progressively weaker fallbacks. None
      // of them is invented: each is a value Google or the address itself
      // supplied, and "User" is only reached when the profile has no name and an
      // unusable address, which the email check above has already excluded.
      firstName:
        givenName ||
        nameParts[0] ||
        text(email.split("@")[0], MAX_NAME_LENGTH) ||
        "User",
      lastName:
        familyName ||
        (nameParts.length > 1 ? text(nameParts.slice(1).join(" "), MAX_NAME_LENGTH) : null),
      // Google's picture is a public lh3 URL, so resolveAssetUrl passes it
      // through unchanged. Applied at creation, and filled in later by
      // backfillAvatar for accounts that predate this or arrive via linkExisting.
      avatarUrl: text(raw?.picture, MAX_URL_LENGTH) || null,
    };
  }

  // ------------------------------------------------------------------ resolution

  /**
   * Finds the Taskora account a verified Google profile belongs to.
   *
   * Three cases, in this order, and the order is the safety property:
   *
   *   1. Already linked by googleId — sign that account in. This is the ordinary
   *      return visit, and it is keyed on the identifier that cannot change, so it
   *      keeps working after the person changes their Taskora email.
   *   2. An account exists with the same email — link, but only under the
   *      conditions linkExisting enforces.
   *   3. Nothing matches — create.
   */
  async resolveUser(profile) {
    const linked = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
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

    return this.createGoogleUser(profile);
  }

  /**
   * Attaches Google to an account that already exists, without touching anything
   * else about it.
   */
  async linkExisting(existing, profile) {
    // An account already tied to a *different* Google identity is not a duplicate
    // to tidy up, it belongs to somebody else. It reaches this branch when its
    // owner changed their Taskora email to one that a different Google account
    // now answers for, and quietly re-pointing googleId would hand that Taskora
    // account — and everything in it — to whoever controls the new address.
    if (existing.googleId) {
      throw new GoogleAuthError(
        "account_conflict",
        "An account with this email already exists",
        409
      );
    }

    // Everything from here rests on this one flag. Without it, matching on email
    // alone would mean any Google account could claim an address that somebody
    // registered here with a password, which is account takeover dressed up as a
    // convenience feature.
    if (!profile.emailVerified) {
      throw new GoogleAuthError(
        "account_conflict",
        "Google has not verified this email address",
        403
      );
    }

    // Only the link is written. `passwordHash` is not read, not compared and not
    // overwritten, so a password this account already had keeps working exactly
    // as it did, and the account can now be reached both ways.
    const user = await this.prisma.user.update({
      where: { id: existing.id },
      data: { googleId: profile.googleId },
    });

    return { user, created: false, linkedNow: true };
  }

  /**
   * Creates a Taskora account for a Google identity Taskora has not seen.
   */
  async createGoogleUser(profile) {
    // `User.passwordHash` is NOT NULL and a Google account has no password, so
    // one is invented rather than the column being relaxed. 256 bits from the
    // CSPRNG, hashed at the application's own cost: nobody holds this value, so
    // password sign-in is impossible for the account, and a leaked hash is no more
    // useful than any other. The alternative — making the column nullable — would
    // have put a null check in front of every compare() call in the codebase.
    const passwordHash = await this.passwordService.hash(
      crypto.randomBytes(32).toString("hex")
    );

    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        passwordHash,
        firstName: profile.firstName,
        lastName: profile.lastName,
        googleId: profile.googleId,
        // Applied once, here, and never on a later sign-in: an avatar the person
        // chose inside Taskora is not something a Google profile may replace.
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

    // A Google signup is still a signup, so the admins are told, through the same
    // notifier and with the same swallow-own-failures behaviour as register().
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
   * prints for the same reason EmailValidationService.mask exists.
   */
  mask(value) {
    let masked = String(value ?? "");

    for (const secret of [this.clientSecret, this.clientId]) {
      if (secret) masked = masked.split(secret).join("***");
    }

    return masked;
  }

  /**
   * One JSON request, with the timeout, the status check and the log discipline
   * every Taskora provider call already follows.
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
        `[GoogleAuthService] request to ${host} failed: ${this.mask(
          error && error.message
        )}`
      );
      throw new GoogleAuthError("failed");
    }

    if (!response.ok) {
      const detail = await response
        .text()
        .catch(() => `${response.status} ${response.statusText}`);

      console.error(
        `[GoogleAuthService] ${host} answered ${response.status}: ${this.mask(
          detail
        ).slice(0, 300)}`
      );
      throw new GoogleAuthError("failed");
    }

    let payload;

    try {
      payload = await response.json();
    } catch {
      console.error(`[GoogleAuthService] ${host} returned a non-JSON body`);
      throw new GoogleAuthError("failed");
    }

    if (!payload || typeof payload !== "object") {
      console.error(`[GoogleAuthService] ${host} returned a non-object body`);
      throw new GoogleAuthError("failed");
    }

    return payload;
  }
}

module.exports = GoogleAuthService;
module.exports.GoogleAuthError = GoogleAuthError;
