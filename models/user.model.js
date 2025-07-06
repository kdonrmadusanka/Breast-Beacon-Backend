// models/User.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
  clerkUserId: { type: String, required: true, unique: true }, // Clerk's user ID
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Optional since Clerk handles auth
  role: {
    type: String,
    enum: ["patient", "doctor", "clinician", "admin"],
    required: true,
    default: "patient",
  },
  profile: {
    name: { type: String, required: true },
    dob: {
      type: Date,
      required: function () {
        return this.role === "patient";
      },
    },
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
  },
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
