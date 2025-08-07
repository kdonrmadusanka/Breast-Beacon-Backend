import mongoose from "mongoose";

const notificationTemplateSchema = new mongoose.Schema({
  // Template metadata
  name: {
    type: String,
    required: true,
    index: true,
  },
  description: String,

  // Template classification
  type: {
    type: String,
    required: true,
    enum: ["results", "reminder", "followup", "appointment", "system-alert"],
  },
  category: {
    type: String,
    required: true,
    enum: [
      "normal", // BI-RADS 1-2
      "benign", // BI-RADS 3
      "suspicious", // BI-RADS 4
      "malignant", // BI-RADS 5-6
      "technical", // Quality issues
      "general", // Other notifications
      "annual",
      "followup",
    ],
  },

  // Content configuration
  language: {
    type: String,
    required: true,
    default: "en",
  },
  channels: {
    type: [String],
    required: true,
    enum: ["email", "portal", "letter"],
    default: ["email"],
  },

  // Content templates
  subject: {
    type: String,
    required: true,
  },
  body: {
    type: String,
    required: true,
  },
  variables: [String], // Supported template variables

  // Metadata
  active: {
    type: Boolean,
    default: true,
  },
  version: {
    type: Number,
    default: 1,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for efficient querying
notificationTemplateSchema.index({
  type: 1,
  category: 1,
  language: 1,
  active: 1,
});

// Pre-save hook to update timestamps
notificationTemplateSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model(
  "NotificationTemplate",
  notificationTemplateSchema
);
