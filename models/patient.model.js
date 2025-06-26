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
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Pre-save hook to generate patientId
patientSchema.pre("save", async function (next) {
  if (!this.isNew) return next();

  try {
    const counter = await Counter.findByIdAndUpdate(
      { _id: "patientId" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    this.patientId = `P-${counter.seq.toString().padStart(4, "0")}`;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("Patient", patientSchema);
