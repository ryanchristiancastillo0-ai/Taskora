const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";
// "Remember me" sessions outlive the default by a long way.
const REMEMBERED_REFRESH_EXPIRES_IN = "30d";

function signAccessToken(userId) {
  return jwt.sign({ userId, type: "access" }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
  });
}

function signRefreshToken(userId, { rememberMe = false } = {}) {
  // The flag is carried in the payload so a refresh can re-issue a token with
  // the same lifetime instead of quietly downgrading a remembered session.
  return jwt.sign(
    { userId, type: "refresh", ...(rememberMe ? { rememberMe: true } : {}) },
    REFRESH_SECRET,
    {
      expiresIn: rememberMe ? REMEMBERED_REFRESH_EXPIRES_IN : REFRESH_EXPIRES_IN,
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashRefreshToken,
  ACCESS_EXPIRES_IN,
  REFRESH_EXPIRES_IN,
  REMEMBERED_REFRESH_EXPIRES_IN,
};