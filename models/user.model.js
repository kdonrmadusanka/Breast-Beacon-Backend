// models/User.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
  clerkUserId: {
    type: String,
    required: true,
    unique: true,
  },
  role: {
    type: String,
    enum: ["patient", "doctor", "clinician", "admin"],
    required: true,
    default: "patient",
  },
  profile: {
    // Clerk handles name/email in their system
    licenseNumber: {
      type: String,
      required: function () {
        return this.role === "doctor" || this.role === "clinician";
      },
    },
    specialty: {
      type: String,
      required: function () {
        return this.role === "doctor" || this.role === "clinician";
      },
    },
    bio: String,
    location: String,
    // Other app-specific profile data
  },
  preferences: {
    notifications: { type: Boolean, default: true },
    theme: { type: String, default: "light" },
    // Other preferences
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

userSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("User", userSchema);
