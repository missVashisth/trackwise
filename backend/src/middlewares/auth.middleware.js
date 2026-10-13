const jwt = require("jsonwebtoken");
const tokenBlacklistModel = require("../models/blacklist.model");
const userModel = require("../models/user.model");
const { resolveTimeZone } = require("../utils/date");

async function authUser(req, res, next) {
  const token = req.cookies.token;

  if (!token || typeof token !== "string") {
    return res.status(401).json({
      message: "Token not provided",
    });
  }

  const isTokenBlackListed = await tokenBlacklistModel.findOne({ token });

  if (isTokenBlackListed) {
    return res.status(401).json({
      message: "Token is invalid",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      message: err.name === "TokenExpiredError" ? "Session expired, please log in again" : "Invalid token",
    });
  }

  // Tokens issued before expiry was introduced never expire; make those users log in again.
  if (typeof decoded.exp !== "number") {
    return res.status(401).json({
      message: "Session expired, please log in again",
    });
  }

  // Deleted accounts, and sessions issued before a password reset, are no longer valid.
  const user = await userModel.findById(decoded.id).select("passwordVersion timezone").lean();
  if (!user) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
  if ((decoded.pv ?? 0) !== (user.passwordVersion ?? 0)) {
    return res.status(401).json({
      message: "Session expired, please log in again",
    });
  }

  // The user's zone decides "today" everywhere (task lists, completions, progress).
  req.user = { ...decoded, timeZone: resolveTimeZone(user.timezone) };
  next();
}

module.exports = { authUser };
