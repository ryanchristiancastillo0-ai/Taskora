const asyncHandler = require("../../utils/asyncHandler.js");
const AppError = require("../../utils/AppError.js");
const {
  setAuthCookies,
  clearAuthCookies,
  setOAuthStateCookie,
  clearOAuthStateCookie,
  OAUTH_STATE_COOKIE,
  GITHUB_OAUTH_STATE_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
} = require("../../utils/cookie.js");
const { parseSchema } = require("../../utils/validate.js");
const {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
} = require("../../services/audit/auditService.js");
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyResetCodeSchema,
} = require("../../validators/auth/authValidators.js");

class AuthController {
  // `auditService` is optional so the controller can still be built in a test
  // that only cares about the auth flow. Every call site guards on it, and a
  // missing writer degrades to no trail rather than a crashed request.
  //
  // `googleAuthService` is optional for the same reason and because the eight
  // email/password handlers above must keep working with it absent. Only the two
  // Google handlers below consult it, and they answer 503 rather than throwing
  // when it was never wired in.
  //
  // `githubAuthService` is a fourth, optional, argument for exactly the same two
  // reasons: GitHub is a second redirect flow that only its own two handlers
  // need, and the other providers must keep working when it is not wired in.
  constructor(
    authService,
    auditService = null,
    googleAuthService = null,
    githubAuthService = null
  ) {
    this.authService = authService;
    this.auditService = auditService;
    this.googleAuthService = googleAuthService;
    this.githubAuthService = githubAuthService;
  }

  /**
   * Records an auth event without letting a logging problem break the flow.
   *
   * AuditService.record already swallows its own errors; the `?.` is for the
   * test case where no writer was wired in at all.
   */
  async audit(event) {
    await this.auditService?.record(event);
  }

  /**
   * The Google service, or a refusal.
   *
   * Only reachable if the router was built without one, which is a wiring
   * mistake rather than a user error — so it is reported as unavailable rather
   * than as a misconfiguration the person in front of the browser could act on.
   */
  requireGoogleAuth() {
    if (!this.googleAuthService) {
      throw new AppError("Google sign-in is not available", 503);
    }

    return this.googleAuthService;
  }

  /**
   * The GitHub service, or a refusal. Same shape as requireGoogleAuth.
   */
  requireGitHubAuth() {
    if (!this.githubAuthService) {
      throw new AppError("GitHub sign-in is not available", 503);
    }

    return this.githubAuthService;
  }

  /**
   * The redirect a GitHub failure takes, including the case where there is no
   * service to build one.
   *
   * The handlers below reach this on every path, so an unwired service would
   * otherwise turn "not available" into a TypeError and a 500 from an
   * asyncHandler — the opposite of the degraded behaviour the rest of the flow
   * is built around. `github_unavailable` is a reason the frontend already
   * renders as a plain message.
   */
  githubFailureRedirect(error) {
    return this.githubAuthService
      ? this.githubAuthService.failureRedirect(error)
      : "/login?authError=github_unavailable";
  }

  register = asyncHandler(async (req, res) => {
    const data = parseSchema(registerSchema, req.body);

    const { user, accessToken, refreshToken } =
      await this.authService.register(data);

    setAuthCookies(res, {
      accessToken,
      refreshToken,
      // Signup has no Remember me checkbox, so it keeps the default 7 day
      // window rather than becoming a session-only login.
      refreshMaxAge: REFRESH_TOKEN_MAX_AGE,
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: { user },
    });
  });

  login = asyncHandler(async (req, res) => {
    const data = parseSchema(loginSchema, req.body);

    let result;

    try {
      result = await this.authService.login(data);
    } catch (error) {
      // The service answers "Invalid email or password" for a wrong address and
      // a wrong password alike, and that is right for the person typing. The
      // audit log is read by admins, not by the person guessing, so it is the
      // one place the distinction is both safe and worth having: a burst of
      // failures against one address is the signal that matters.
      //
      // `reason` is only carried for an operational error. A raw message from
      // an unexpected failure can contain database or provider detail, which is
      // exactly what this log must not accumulate.
      await this.audit({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entity: AUDIT_ENTITIES.USER,
        details: {
          email: data.email,
          reason: error?.isOperational ? error.message : "Unexpected error",
        },
        req,
      });

      throw error;
    }

    setAuthCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      rememberMe: result.rememberMe,
    });

    await this.audit({
      actorId: result.user.id,
      action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
      entity: AUDIT_ENTITIES.USER,
      entityId: result.user.id,
      details: { email: result.user.email, rememberMe: result.rememberMe },
      req,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: { user: result.user },
    });
  });

  refresh = asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new AppError("Refresh token is required", 401);
    }

    const { accessToken, refreshToken: newRefreshToken, rememberMe } =
      await this.authService.refresh(refreshToken);

    setAuthCookies(res, {
      accessToken,
      refreshToken: newRefreshToken,
      // Carried in the token itself, so a remembered session keeps its
      // lifetime across refreshes.
      rememberMe,
    });

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
    });
  });

  logout = asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // The actor comes from authMiddleware, not from the refresh token, so this
    // records who was signed in even when the cookie had already been cleared
    // and the service had nothing left to revoke. A logout is recorded either
    // way — "the session ended" is the fact, and which token it ended is not.
    await this.audit({
      actorId: req.user?.userId ?? null,
      action: AUDIT_ACTIONS.LOGOUT,
      entity: AUDIT_ENTITIES.USER,
      entityId: req.user?.userId ?? null,
      req,
    });

    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  });

  forgotPassword = asyncHandler(async (req, res) => {
    const data = parseSchema(forgotPasswordSchema, req.body);

    const result = await this.authService.forgotPassword(data.email);

    // `matched` and `userId` are read here and never echoed. The response is
    // the same sentence for every address, which is what stops this endpoint
    // being a way to test whether an email has an account.
    await this.audit({
      actorId: result.userId ?? null,
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      entity: AUDIT_ENTITIES.USER,
      entityId: result.userId ?? null,
      details: { email: data.email, matched: result.matched },
      req,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  });

  verifyResetCode = asyncHandler(async (req, res) => {
    const data = parseSchema(verifyResetCodeSchema, req.body);

    const result = await this.authService.verifyResetCode(data);

    return res.status(200).json({
      success: true,
      data: result,
    });
  });

  resetPassword = asyncHandler(async (req, res) => {
    const data = parseSchema(resetPasswordSchema, req.body);

    const result = await this.authService.resetPassword(data);

    // Recorded against the account whose password moved, not against whoever
    // holds the request — a reset is performed by someone who could not sign in,
    // so there is no session to attribute it to. Every refresh token for the
    // account was revoked by the service by the time this runs.
    await this.audit({
      actorId: result.userId ?? null,
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      entity: AUDIT_ENTITIES.USER,
      entityId: result.userId ?? null,
      details: { email: data.email },
      req,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  });

  getCurrentUser = asyncHandler(async (req, res) => {
    const result = await this.authService.getCurrentUser(req.user.userId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  });

  // ==========================================================================
  // Google Sign-In
  //
  // Two handlers, both of which answer with a redirect rather than JSON, because
  // both ends of this exchange are browser navigations: this one leaves for
  // accounts.google.com, and the callback arrives back from it. There is no
  // request body and no fetch on the frontend, so there is nothing here for the
  // axios client to intercept, unwrap or retry.
  //
  // What is deliberately NOT reimplemented: token minting, refresh-token
  // bookkeeping, cookie attributes, audit vocabulary and the account shape. Below,
  // a Google sign-in calls the same AuthService.createTokens and the same
  // setAuthCookies an email/password sign-in calls, so there is one session system
  // and one refresh-token implementation — this file only decides *who* is signing
  // in and hands the answer to that existing path.
  // ==========================================================================

  /**
   * Step one. Mints a CSRF state, stores it in a short-lived cookie, and sends
   * the browser to Google.
   */
  googleStart = asyncHandler(async (req, res) => {
    try {
      const { state, authorizationUrl } =
        this.requireGoogleAuth().beginAuthorization();

      setOAuthStateCookie(res, state);

      return res.redirect(302, authorizationUrl);
    } catch (error) {
      // A redirect even here. A browser following this URL cannot render a JSON
      // error envelope usefully, and an unconfigured server should land the
      // person back on the login page with an explanation rather than on a wall
      // of raw JSON.
      return res.redirect(302, this.googleAuthService.failureRedirect(error));
    }
  });

  /**
   * Step two. Verifies the callback, resolves the account, and signs them in
   * through the existing session path.
   */
  googleCallback = asyncHandler(async (req, res) => {
    // Spent either way. Leaving it in place would let one callback be replayed
    // within its ten-minute window.
    clearOAuthStateCookie(res);

    try {
      const service = this.requireGoogleAuth();

      const result = await service.completeAuthorization({
        code: req.query.code,
        state: req.query.state,
        error: req.query.error,
        expectedState: req.cookies?.[OAUTH_STATE_COOKIE],
      });

      // The same factory login() and register() use. No Google tokens are stored,
      // so this is Taskora's own access/refresh pair, hashed and rotated exactly
      // as it is for every other sign-in.
      const { accessToken, refreshToken } = await this.authService.createTokens(
        result.user.id,
        {},
        // No "Remember me" checkbox exists on this path, so this takes the same
        // default register() uses rather than the session-cookie default an
        // unticked login form gets.
        { rememberMe: false }
      );

      setAuthCookies(res, {
        accessToken,
        refreshToken,
        refreshMaxAge: REFRESH_TOKEN_MAX_AGE,
      });

      // Recorded under the same action an email/password sign-in uses, with the
      // provider as a detail rather than as a new entry in the action vocabulary
      // — so the admin console's existing login filter covers both without a
      // schema or enum change.
      await this.audit({
        actorId: result.user.id,
        action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
        entity: AUDIT_ENTITIES.USER,
        entityId: result.user.id,
        details: {
          email: result.user.email,
          provider: "google",
          accountCreated: result.created,
          accountLinked: result.linkedNow,
        },
        req,
      });

      // Lands on the frontend root, where RedirectIfSignedIn routes an
      // administrator to /admin and RequireOnboardingComplete routes a brand new
      // account to /onboarding. Those rules live in one place and are not
      // restated here.
      return res.redirect(302, service.successRedirect());
    } catch (error) {
      // Mirrors login()'s treatment of a failure: `reason` is only carried when
      // the error is operational, because a raw message from an unexpected
      // failure can quote a database or provider response and this log must not
      // accumulate that. Nothing here is echoed to the browser beyond the closed
      // vocabulary service.failureRedirect() chooses from.
      await this.audit({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entity: AUDIT_ENTITIES.USER,
        details: {
          provider: "google",
          reason: error?.isOperational ? error.message : "Unexpected error",
        },
        req,
      });

      return res.redirect(302, this.googleAuthService.failureRedirect(error));
    }
  });

  // ==========================================================================
  // GitHub Sign-In
  //
  // The same two handlers, the same reasoning, and deliberately no third session
  // system. What differs is not the shape of the flow but the two things this
  // file has to get right because the providers differ:
  //
  //   - the state cookie is a separate name on a separate path, so a GitHub
  //     callback cannot redeem state minted by a Google one (and vice versa);
  //   - nothing else. Tokens, cookies, audit details and the redirect all go
  //     through the same calls as above, with "github" as the detail.
  // ==========================================================================

  /**
   * Step one: mint a state of our own and send the browser to github.com.
   */
  githubStart = asyncHandler(async (req, res) => {
    try {
      const { state, authorizationUrl } =
        this.requireGitHubAuth().beginAuthorization();

      setOAuthStateCookie(res, state, "github");

      return res.redirect(302, authorizationUrl);
    } catch (error) {
      // Same reason as googleStart: a browser cannot render a JSON error
      // envelope, and an unconfigured server should land the person back on the
      // login page with a sentence.
      return res.redirect(302, this.githubFailureRedirect(error));
    }
  });

  /**
   * Step two: verify the callback, resolve the account, sign them in.
   */
  githubCallback = asyncHandler(async (req, res) => {
    // Spent either way, before anything else runs, so a replayed callback finds
    // an empty cookie rather than a still-valid one.
    clearOAuthStateCookie(res, "github");

    try {
      const service = this.requireGitHubAuth();

      const result = await service.completeAuthorization({
        code: req.query.code,
        state: req.query.state,
        error: req.query.error,
        expectedState: req.cookies?.[GITHUB_OAUTH_STATE_COOKIE],
      });

      // The same factory login(), register() and googleCallback() use: Taskora's
      // own access/refresh pair, hashed and rotated, with no GitHub token stored.
      const { accessToken, refreshToken } = await this.authService.createTokens(
        result.user.id,
        {},
        { rememberMe: false }
      );

      setAuthCookies(res, {
        accessToken,
        refreshToken,
        refreshMaxAge: REFRESH_TOKEN_MAX_AGE,
      });

      // LOGIN_SUCCEEDED with `provider: "github"` — the provider is a detail,
      // not a new action, so the admin console's existing login filter covers
      // every sign-in method with no schema or enum change.
      await this.audit({
        actorId: result.user.id,
        action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
        entity: AUDIT_ENTITIES.USER,
        entityId: result.user.id,
        details: {
          email: result.user.email,
          provider: "github",
          accountCreated: result.created,
          accountLinked: result.linkedNow,
        },
        req,
      });

      return res.redirect(302, service.successRedirect());
    } catch (error) {
      // Mirrors login() and googleCallback(): only an operational reason reaches
      // the log, and the browser gets nothing beyond the closed vocabulary the
      // service chose the code from.
      await this.audit({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entity: AUDIT_ENTITIES.USER,
        details: {
          provider: "github",
          reason: error?.isOperational ? error.message : "Unexpected error",
        },
        req,
      });

      return res.redirect(302, this.githubFailureRedirect(error));
    }
  });
}

module.exports = AuthController;