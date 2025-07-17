const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["patient", "clinician", "admin"],
      default: "patient",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    profileCompleted: {
      type: Boolean,
      default: true, // Changed to true since profile completion is not required
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
    },
    lastLogin: {
      type: Date,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
    },
    passwordResetToken: {
      type: String,
    },
    passwordResetExpires: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to update lastLogin
userSchema.pre("save", function (next) {
  if (this.isModified("password") || this.isNew) {
    this.lastLogin = new Date();
  }
  next();
});

// Instance method to check if profile is complete
userSchema.methods.isProfileComplete = function () {
  return (
    this.firstName && this.lastName && this.phoneNumber && this.dateOfBirth
  );
};

// Static method to find active users
userSchema.statics.findActiveUsers = function () {
  return this.find({ status: "active" });
};

const UserModel = mongoose.model("User", userSchema);

module.exports = UserModel;
