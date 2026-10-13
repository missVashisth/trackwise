const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique : [true, "username already taken"],
    required: true,
  },
  email:{
    type:String,
    unique : [true, "account already exist with this email"],
    required:true,
  },
  password:{
    type:String,
    required: true,
  },
  // Forgot-password: only a SHA-256 hash of the emailed token is stored, never the token itself.
  passwordResetTokenHash: {
    type: String,
    select: false,
  },
  passwordResetExpiresAt: {
    type: Date,
    select: false,
  },
  // IANA zone ("America/New_York"). Decides the user's "today" for daily tasks, progress and
  // reminders. Missing/invalid values fall back to DEFAULT_TIME_ZONE (see utils/date.js).
  timezone: {
    type: String,
    default: "Asia/Kolkata",
  },
  // Bumped on every password reset; a session token carrying an older version is rejected.
  passwordVersion: {
    type: Number,
    default: 0,
  },
  passwordChangedAt: {
    type: Date,
    default: null,
  },
},
{
    timestamps: true,
});

userSchema.index(
  { passwordResetTokenHash: 1 },
  { partialFilterExpression: { passwordResetTokenHash: { $type: "string" } } }
);

const userModel = mongoose.model("users",userSchema);

module.exports= userModel
