const mongoose = require("mongoose");

const LifeAreaSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    emoji: {
      type: String,
      default: "",
    },
    colorHex: {
      type: String,
      default: "#4f46e5",
    },
  },
  {
    timestamps: true,
  }
);

// One area per name per user, so concurrent default seeding cannot create duplicates.
LifeAreaSchema.index({ user: 1, name: 1 }, { unique: true });

const LifeArea = mongoose.model("LifeArea", LifeAreaSchema);

module.exports = LifeArea;
