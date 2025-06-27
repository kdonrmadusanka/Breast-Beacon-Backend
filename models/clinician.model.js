const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcrypt");
const saltRounds = 10;

const clinicianSchema = new Schema(
  {
    clinicianId: {
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
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
    },
    role: {
      type: String,
      required: true,
      enum: ["nurse", "technician", "therapist", "assistant"],
      default: "technician",
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    licenseNumber: {
      type: String,
      unique: true,
      sparse: true, // Allows null values while maintaining unique constraint
    },
    password: {
      type: String,
      required: true,
      minlength: [8, "Password must be at least 8 characters"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.__v;
      },
    },
  }
);

// Pre-save hooks
clinicianSchema.pre("save", async function (next) {
  if (!this.isModified("password") && this.clinicianId) return next();

  try {
    // Generate clinicianId if new
    if (this.isNew) {
      const counter = await mongoose
        .model("Counter")
        .findByIdAndUpdate(
          { _id: "clinicianId" },
          { $inc: { seq: 1 } },
          { new: true, upsert: true }
        );
      this.clinicianId = `CL-${counter.seq.toString().padStart(4, "0")}`;
    }

    // Hash password if modified
    if (this.isModified("password")) {
      this.password = await bcrypt.hash(this.password, saltRounds);
    }

    next();
  } catch (err) {
    next(err);
  }
});

// Password comparison method
clinicianSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("Clinician", clinicianSchema);
