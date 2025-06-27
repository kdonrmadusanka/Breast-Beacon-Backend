const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcrypt");
const saltRounds = 10;

const doctorSchema = new Schema(
  {
    doctorId: {
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
    specialty: {
      type: String,
      required: true,
      trim: true,
      minlength: [3, "Specialty must be at least 3 characters"],
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

// Pre-save hook to hash password and generate doctorId
doctorSchema.pre("save", async function (next) {
  if (!this.isModified("password") && this.doctorId) return next();

  try {
    // Generate doctorId if new doctor
    if (this.isNew) {
      const counter = await mongoose
        .model("Counter")
        .findByIdAndUpdate(
          { _id: "doctorId" },
          { $inc: { seq: 1 } },
          { new: true, upsert: true }
        );
      this.doctorId = `D-${counter.seq.toString().padStart(4, "0")}`;
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

// Method to compare passwords
doctorSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("Doctor", doctorSchema);
