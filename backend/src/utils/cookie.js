const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const REMEMBERED_REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

// Defaults to "none" in production because the SPA and the API live on
// different sites (e.g. Vite on localhost against a Render backend, or a
// frontend domain against a *.onrender.com API). "strict" would silently stop
// the browser from attaching the cookies to any cross-site request, making
// every authenticated call 401 → "Session expired". Override per deployment
// with COOKIE_SAMESITE=strict|lax|none when both sides share a site.
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE;
const sameSite = COOKIE_SAMESITE || (process.env.NODE_ENV === "production" ? "none" : "strict");

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite,
};

// Without maxAge these become session cookies, so they are dropped when the
// browser closes - that is what makes "Remember me" mean something.
//
// rememberMe: true   -> refresh cookie persists for 30 days
// rememberMe: false  -> session cookies
// refreshMaxAge      -> explicit lifetime, used by register to keep its
//                       existing 7 day behaviour
const setAuthCookies = (
  res,
  { accessToken, refreshToken, rememberMe = false, refreshMaxAge }
) => {
  const lifetime = refreshMaxAge ?? (rememberMe ? REMEMBERED_REFRESH_MAX_AGE : undefined);

  if (lifetime === undefined) {
    res.cookie("accessToken", accessToken, cookieOptions);
    res.cookie("refreshToken", refreshToken, cookieOptions);
    return;
  }

  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: lifetime,
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
};

// ---------------------------------------------------------------------------
// OAuth round-trip cookie
// ---------------------------------------------------------------------------

// The CSRF value for the Google Sign-In round trip. Deliberately its own cookie
// rather than a field in the auth pair above: it is written before anybody is
// authenticated, it is read once, and it must be dropped the moment it has been
// spent.
const OAUTH_STATE_COOKIE = "googleOAuthState";

// Scoped to the two Google routes instead of "/", so a ten-minute,
// single-purpose value is not attached to every request this backend serves.
const OAUTH_STATE_PATH = "/api/auth/google";

// Long enough to survive a consent screen and a slow network, short enough that
// an abandoned attempt stops being replayable the same evening.
const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;

// SameSite is "lax" here, and the auth cookies above are "strict", and the
// difference is the whole reason this cookie exists separately.
//
// The OAuth callback arrives as a top-level navigation the user started on
// accounts.google.com. The browser therefore classifies it as cross-site, and a
// Strict cookie is not carried through it — which would mean the state this
// server issued never comes back, and the flow fails closed on every single
// attempt.
//
// Lax is the value that survives a top-level GET and nothing else: it is still
// withheld from cross-site POSTs, from a third-party iframe, and from every
// other request, so it cannot be read by another origin or attached by an
// attacker to a state-changing call.
const oauthStateOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: OAUTH_STATE_PATH,
};

const setOAuthStateCookie = (res, state) => {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...oauthStateOptions,
    maxAge: OAUTH_STATE_MAX_AGE,
  });
};

const clearOAuthStateCookie = (res) => {
  // `path` has to be repeated or it does not match the cookie it is clearing,
  // and the browser quietly keeps the original.
  res.clearCookie(OAUTH_STATE_COOKIE, oauthStateOptions);
};

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  setOAuthStateCookie,
  clearOAuthStateCookie,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE,
  REMEMBERED_REFRESH_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
};
