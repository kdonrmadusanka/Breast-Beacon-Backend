import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    mammogramId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mammogram",
    },
    type: {
      type: String,
      enum: ["screening", "diagnostic", "followup", "biopsy", "consultation"],
      required: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled", "no-show", "rescheduled"],
      default: "scheduled",
    },
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    duration: {
      type: Number, // in minutes
      default: 30,
    },
    location: {
      type: String,
      required: true,
    },
    technicianNotes: String,
    radiologistNotes: String,
    // For follow-up appointments
    isFollowUp: {
      type: Boolean,
      default: false,
    },
    originalFindingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Finding",
    },
    // Notification tracking
    remindersSent: {
      type: Number,
      default: 0,
    },
    lastReminderSent: Date,
    // For cancellations/rescheduling
    cancellationReason: String,
    rescheduledFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for faster querying
appointmentSchema.index({ patientId: 1 });
appointmentSchema.index({ date: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ type: 1 });

// Virtual population for patient details
appointmentSchema.virtual("patient", {
  ref: "Patient",
  localField: "patientId",
  foreignField: "_id",
  justOne: true,
});

// Virtual population for mammogram details
appointmentSchema.virtual("mammogram", {
  ref: "Mammogram",
  localField: "mammogramId",
  foreignField: "_id",
  justOne: true,
});

// Virtual field for datetime combination
appointmentSchema.virtual("datetime").get(function () {
  const timeParts = this.time.split(":");
  const date = new Date(this.date);
  date.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]));
  return date;
});

// Pre-save hook to validate appointment time
appointmentSchema.pre("save", function (next) {
  if (this.isModified("time")) {
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(this.time)) {
      throw new Error("Invalid time format. Use HH:MM");
    }
  }
  next();
});

const Appointment = mongoose.model("Appointment", appointmentSchema);

export default Appointment;
