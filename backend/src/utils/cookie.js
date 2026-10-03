const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const REMEMBERED_REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
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

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  REMEMBERED_REFRESH_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
};
