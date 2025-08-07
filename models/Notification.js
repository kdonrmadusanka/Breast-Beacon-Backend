import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
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
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
    channel: {
      type: String,
      enum: ["email", "portal", "letter"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "failed"],
      default: "pending",
    },
    content: {
      subject: String,
      body: String,
      attachments: [String],
    },
    auditLog: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        event: String,
        details: String,
      },
    ],
    // For tracking purposes
    notificationType: {
      type: String,
      enum: ["results", "reminder", "followup", "recall", "general"],
      required: true,
    },
    // For compliance - when the notification should be considered "read"
    expirationDate: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for faster querying
notificationSchema.index({ patientId: 1 });
notificationSchema.index({ status: 1 });
notificationSchema.index({ createdAt: 1 });
notificationSchema.index({ expirationDate: 1 });

// Virtual population for patient details
notificationSchema.virtual("patient", {
  ref: "Patient",
  localField: "patientId",
  foreignField: "_id",
  justOne: true,
});

// Virtual population for mammogram details
notificationSchema.virtual("mammogram", {
  ref: "Mammogram",
  localField: "mammogramId",
  foreignField: "_id",
  justOne: true,
});

// Virtual population for appointment details
notificationSchema.virtual("appointment", {
  ref: "Appointment",
  localField: "appointmentId",
  foreignField: "_id",
  justOne: true,
});

// Pre-save hook to set notification type if not provided
notificationSchema.pre("save", function (next) {
  if (!this.notificationType) {
    if (this.mammogramId) {
      this.notificationType = "results";
    } else if (this.appointmentId) {
      this.notificationType = "reminder";
    }
  }
  next();
});

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
