const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const { rateLimit } = require("../utils/rateLimit");

const authRouter = Router();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const envLimit = (name, fallback) => Number(process.env[name]) || fallback;
const emailKey = (prefix) => (req) =>
    typeof req.body.email === "string" ? `${prefix}:${req.ip}:${req.body.email.trim().toLowerCase()}` : null;

// Password guessing: failed logins per account+IP, and all logins per IP.
const loginFailuresPerAccount = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: envLimit("AUTH_LOGIN_FAILURES_PER_15_MIN", 10),
    key: emailKey("login"),
    failuresOnly: true,
    message: "Too many sign-in attempts. Please wait a few minutes and try again.",
});
const loginsPerIp = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: envLimit("AUTH_LOGINS_PER_IP_PER_15_MIN", 100),
    message: "Too many sign-in attempts. Please wait a few minutes and try again.",
});
// Account creation spam / account probing from one IP.
const registrationsPerIp = rateLimit({
    windowMs: ONE_HOUR,
    max: envLimit("AUTH_REGISTRATIONS_PER_IP_PER_HOUR", 30),
    message: "Too many sign-up attempts. Please try again later.",
});


/**
 * @router POST /api/auth/register
 * @description Register a new user
 * @access Public
 */

authRouter.post("/register", registrationsPerIp, authController.registerUserController );


/**
 * @router POST /api/auth/login
 * @description  Login user
 * @access Public
 */

authRouter.post("/login", loginsPerIp, loginFailuresPerAccount, authController.loginUserController );


/**
 * @router GET /api/auth/get-me
 * @description Return the user that owns the token cookie
 * @access Private
 */

authRouter.get("/get-me", authMiddleware.authUser, authController.getMeController );


/**
 * @router PATCH /api/auth/me/timezone
 * @description Update the logged-in user's IANA time zone
 * @access Private
 */

authRouter.patch("/me/timezone", authMiddleware.authUser, authController.updateTimezoneController );


/**
 * @router POST /api/auth/logout
 * @description Blacklist the current token and clear the cookie
 * @access Public
 */

authRouter.post("/logout", authController.logoutUserController );


const TOO_MANY_RESETS = "Too many password reset attempts. Please try again later.";

const resetRequestsPerIp = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, message: TOO_MANY_RESETS });
// Stops one inbox being flooded with reset emails from many IPs.
const resetRequestsPerEmail = rateLimit({
    windowMs: ONE_HOUR,
    max: 3,
    key: (req) => (typeof req.body.email === "string" ? `email:${req.body.email.trim().toLowerCase()}` : null),
    message: TOO_MANY_RESETS,
});
const resetAttemptsPerIp = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, message: TOO_MANY_RESETS });


/**
 * @router POST /api/auth/forgot-password
 * @description Email a password-reset link (generic response either way)
 * @access Public
 */

authRouter.post("/forgot-password", resetRequestsPerIp, resetRequestsPerEmail, authController.forgotPasswordController );


/**
 * @router POST /api/auth/reset-password
 * @description Set a new password with a reset token
 * @access Public
 */

authRouter.post("/reset-password", resetAttemptsPerIp, authController.resetPasswordController );


module.exports = authRouter;
