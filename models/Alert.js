// models/Alert.js
import mongoose from "mongoose";

const alertSchema = new mongoose.Schema({
  alertId: {
    type: String,
    unique: true,
    default: () => mongoose.Types.ObjectId().toString(),
  },
  eventId: {
    type: String,
    required: false,
  },
  alertType: {
    type: String,
    required: true,
    enum: ["security", "data", "system", "quality", "compliance"],
  },
  severity: {
    type: String,
    required: true,
    enum: ["critical", "high", "medium", "low"],
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    required: true,
    enum: ["open", "acknowledged", "resolved", "suppressed"],
    default: "open",
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
});

// Indexes for better query performance
alertSchema.index({ alertType: 1, status: 1 });
alertSchema.index({ severity: 1, createdAt: -1 });
alertSchema.index({ status: 1, createdAt: -1 });
alertSchema.index({ eventId: 1 });

// Middleware to update the updatedAt field before saving
alertSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Static methods
alertSchema.statics.findOpenAlerts = function () {
  return this.find({ status: "open" }).sort({ createdAt: -1 });
};

alertSchema.statics.findBySeverity = function (severity) {
  return this.find({ severity }).sort({ createdAt: -1 });
};

alertSchema.statics.findByType = function (alertType) {
  return this.find({ alertType }).sort({ createdAt: -1 });
};

// Instance methods
alertSchema.methods.acknowledge = function (userId) {
  this.status = "acknowledged";
  this.acknowledgedBy = userId;
  return this.save();
};

alertSchema.methods.resolve = function (userId, notes = "") {
  this.status = "resolved";
  this.resolvedBy = userId;
  if (notes) {
    this.metadata.notes = this.metadata.notes || [];
    this.metadata.notes.push({
      text: notes,
      addedBy: userId,
      timestamp: new Date(),
    });
  }
  return this.save();
};

const Alert = mongoose.model("Alert", alertSchema);

export default Alert;
