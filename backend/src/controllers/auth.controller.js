const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const tokenBlacklistModel = require("../models/blacklist.model");
const crypto = require("crypto");
const { isNonEmptyString } = require("../utils/validation");
const { isValidTimeZone, resolveTimeZone } = require("../utils/date");
const { notify } = require("../services/notifications/notification.service");
const { appUrl } = require("../services/email/emailTemplates");
const logger = require("../utils/logger");
const { authCookieOptions } = require("../config/runtime");

// Sessions last at most this long; the cookie itself stays a browser-session cookie.
const TOKEN_TTL = "7d";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_CREDENTIALS = "Invalid email or password.";
const MIN_PASSWORD_LENGTH = 6;
const RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const RESET_REQUESTED = "If an account exists for that email, we've sent a link to reset your password.";
const INVALID_RESET = "This reset link is invalid or has expired. Please request a new one.";

const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

function resetTtlMinutes() {
    const minutes = Number.parseInt(process.env.PASSWORD_RESET_TTL_MINUTES, 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
}

/** Shared by register and reset so both enforce the same rule. */
function passwordError(password) {
    if (!isNonEmptyString(password)) return "Please provide a password.";
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    return null;
}

function signToken(user) {
    return jwt.sign(
        { id: user._id, username: user.username, pv: user.passwordVersion ?? 0 },
        process.env.JWT_SECRET,
        { expiresIn: TOKEN_TTL },
    );
}

const cookieOptions = authCookieOptions();

// Compared against when the email is unknown, so a failed login takes the same time either way
// (otherwise response timing reveals which emails have accounts).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10);


/**
 * @name registerUserController
 * @description resgister a new user , expects username , email and password in the request body
 * @access Public
*/

async function registerUserController(req, res){
    const {username, email, password, timezone} = req.body;

    if(timezone !== undefined && !isValidTimeZone(timezone)){
        return res.status(400).json({ message: "Unknown time zone." })
    }

    if(!isNonEmptyString(username) || !isNonEmptyString(email) || !isNonEmptyString(password)){
        return res.status(400).json({
            message: "Please provide a username, email and password."
        })
    }

    if(username.trim().length < 3){
        return res.status(400).json({ message: "Username must be at least 3 characters." })
    }

    if(!EMAIL_PATTERN.test(email)){
        return res.status(400).json({ message: "Please provide a valid email address." })
    }

    if(passwordError(password)){
        return res.status(400).json({ message: passwordError(password) })
    }


    const isUserAlreadyExists = await userModel.findOne({
        $or : [{ username }, { email }]
    });

    if(isUserAlreadyExists){
        return res.status(400).json({
            message: "Account already exists with this username or email"
        })
    }

    const hash = await bcrypt.hash(password, 10);

    let user;
    try {
        user = await userModel.create({
            username,
            email,
            password : hash,
            ...(timezone ? { timezone } : {}),
        });
    } catch (err) {
        // Two simultaneous registrations can both pass the check above; the unique index catches the second.
        if (err.code === 11000) {
            return res.status(400).json({
                message: "Account already exists with this username or email"
            })
        }
        throw err;
    }

    const token = signToken(user);

    res.cookie("token", token, cookieOptions);

    res.status(201).json({
        message : "User registration successful",
        user :{
            id : user._id,
            username: user.username,
            email: user.email,
            timezone: resolveTimeZone(user.timezone),
        }
    })
}

/**
 * @name loginUserController
 * @description login a user, expects email and password in the request boody
 * @access Public
 */

async function loginUserController(req,res){
    const {email , password} = req.body;

    // Only plain strings reach the query, so operators such as {"$ne": null} cannot be injected.
    if(!isNonEmptyString(email) || !isNonEmptyString(password)){
        return res.status(400).json({
            message : "Please provide email and password."
        })
    }

    const user = await userModel.findOne({email});

    if(!user){
        await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
        return res.status(400).json({
            message : INVALID_CREDENTIALS
        })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    // Accounts created before the user model stored usernames have none; derive one from the email.
    if(isPasswordValid && !user.username){
        const base = user.email.split("@")[0];
        const taken = await userModel.exists({ username: base });
        user.username = taken ? `${base}-${user._id.toString().slice(-4)}` : base;
        await user.save();
    }


    if(!isPasswordValid){
        return res.status(400).json({
            message : INVALID_CREDENTIALS
        })
    }

    // The browser reports its zone on login; an invalid or missing value leaves the stored one.
    if(isValidTimeZone(req.body.timezone) && req.body.timezone !== user.timezone){
        user.timezone = req.body.timezone;
        await userModel.updateOne({ _id: user._id }, { $set: { timezone: user.timezone } });
    }

    const token = signToken(user);

    res.cookie("token", token, cookieOptions);

    res.status(200).json({
        message : "User logged in successfully.",
        user : {
            id : user._id,
            username : user.username,
            email : user.email,
            timezone : resolveTimeZone(user.timezone),
        }
    })

}

/**
 * @name getMeController
 * @description return the logged-in user, identified by the token cookie
 * @access Private
 */

async function getMeController(req, res){
    const user = await userModel.findById(req.user.id);

    if(!user){
        return res.status(401).json({
            message : "User not found."
        })
    }

    res.status(200).json({
        user : {
            id : user._id,
            username : user.username,
            email : user.email,
            timezone : resolveTimeZone(user.timezone),
        }
    })
}

/**
 * @name updateTimezoneController
 * @description Save the logged-in user's IANA time zone (sent by the browser)
 * @access Private
 */
async function updateTimezoneController(req, res){
    const { timezone } = req.body;
    if(!isValidTimeZone(timezone)){
        return res.status(400).json({ message: "Unknown time zone." })
    }
    await userModel.updateOne({ _id: req.user.id }, { $set: { timezone } });
    res.status(200).json({ timezone });
}

/**
 * @name logoutUserController
 * @description blacklist the current token and clear the cookie
 * @access Public
 */

async function logoutUserController(req, res){
    const token = req.cookies.token;

    if(token){
        let decoded = null;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            // Invalid or expired tokens are already rejected by authUser; nothing to revoke.
        }
        if (decoded?.exp) {
            await tokenBlacklistModel.updateOne(
                { token },
                { $setOnInsert: { token, expiresAt: new Date(decoded.exp * 1000) } },
                { upsert: true },
            );
        }
    }

    res.clearCookie("token", cookieOptions);

    res.status(200).json({
        message : "User logged out successfully."
    })
}

/** Runs after the response is sent, so the reply looks the same whether or not the account exists. */
async function issuePasswordReset(email) {
    const user = await userModel.findOne({ email }).select("_id");
    if (!user) {
        logger.info("password_reset.requested", { accountFound: false });
        return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresInMinutes = resetTtlMinutes();
    // A new request replaces any earlier token, so only the latest link works.
    await userModel.updateOne(
        { _id: user._id },
        { $set: { passwordResetTokenHash: hashResetToken(token), passwordResetExpiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000) } }
    );

    // The token rides in the URL fragment, which browsers never send to servers (logs, Referer).
    await notify({
        userId: user._id,
        type: "PASSWORD_RESET",
        data: { expiresInMinutes },
        delivery: { resetUrl: `${appUrl()}/reset-password#token=${token}` },
    });
    logger.info("password_reset.requested", { accountFound: true, userId: String(user._id) });
}

/**
 * @name forgotPasswordController
 * @description Email a password-reset link. Always answers the same way to avoid revealing accounts.
 * @access Public
 */
async function forgotPasswordController(req, res){
    const { email } = req.body;

    if(!isNonEmptyString(email) || !EMAIL_PATTERN.test(email)){
        return res.status(400).json({ message: "Please provide a valid email address." })
    }

    res.status(200).json({ message: RESET_REQUESTED });

    setImmediate(() => {
        issuePasswordReset(email).catch((err) => {
            logger.error("password_reset.issue_failed", { error: err.message });
        });
    });
}

/**
 * @name resetPasswordController
 * @description Set a new password using a valid, unexpired, unused reset token.
 * @access Public
 */
async function resetPasswordController(req, res){
    const { token, password } = req.body;

    if(typeof token !== "string" || !RESET_TOKEN_PATTERN.test(token)){
        return res.status(400).json({ message: INVALID_RESET })
    }
    const invalidPassword = passwordError(password);
    if(invalidPassword){
        return res.status(400).json({ message: invalidPassword })
    }

    const hash = await bcrypt.hash(password, 10);
    const now = new Date();

    // One atomic update: matching the hash, checking expiry and clearing the token together
    // makes the link single-use even if two requests race.
    const user = await userModel.findOneAndUpdate(
        { passwordResetTokenHash: hashResetToken(token), passwordResetExpiresAt: { $gt: now } },
        {
            $set: { password: hash, passwordChangedAt: now },
            $inc: { passwordVersion: 1 },
            $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
        },
        { new: true }
    );

    if(!user){
        return res.status(400).json({ message: INVALID_RESET })
    }

    res.clearCookie("token", cookieOptions);
    logger.info("password_reset.completed", { userId: String(user._id) });

    res.status(200).json({
        message: "Your password has been reset. Please log in with your new password."
    })
}

module.exports = {
    registerUserController,
    loginUserController,
    getMeController,
    updateTimezoneController,
    logoutUserController,
    forgotPasswordController,
    resetPasswordController,
}
