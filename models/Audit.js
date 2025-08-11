import mongoose from "mongoose";
import { EVENT_TYPES, STATUS_TYPES } from "../constants/auditConstants.js";

const ChangeSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      required: true,
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { _id: false }
);

const AuditSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: Object.values(EVENT_TYPES),
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    userRole: {
      type: String,
      index: true,
    },
    entityType: {
      type: String,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    endpoint: {
      type: String,
    },
    method: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: Object.values(STATUS_TYPES),
      default: "success",
      index: true,
    },
    changes: {
      type: [ChangeSchema],
      default: [],
    },
  },
  {
    timestamps: false, // We're using our own timestamp field
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret._id;
        return ret;
      },
    },
  }
);

// Compound indexes for common query patterns
AuditSchema.index({ entityType: 1, entityId: 1 });
AuditSchema.index({ userId: 1, timestamp: -1 });
AuditSchema.index({ eventType: 1, timestamp: -1 });
AuditSchema.index({ timestamp: -1, status: 1 });

const Audit = mongoose.model("Audit", AuditSchema);

export default Audit;
