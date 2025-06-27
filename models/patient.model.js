const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Counter = require("../utils/counter.js");

const patientSchema = new Schema(
  {
    patientId: {
      type: String,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
    },
    dateOfBirth: {
      type: Date,
      required: true,
      validate: {
        validator: function (v) {
          return v <= new Date();
        },
        message: "Date of birth cannot be in the future",
      },
    },
    password: {
      type: String,
      required: true,
      minlength: [8, "Password must be at least 8 characters"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Pre-save hook to generate auto-incremented patientId
patientSchema.pre("save", async function (next) {
  if (this.isNew) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: "patientId" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.patientId = `P-${String(counter.seq).padStart(4, "0")}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model("Patient", patientSchema);
