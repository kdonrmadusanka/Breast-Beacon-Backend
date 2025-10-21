// models/DiagnosticReport.js
import mongoose from 'mongoose';

const diagnosticReportSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PatientCase',
      required: true,
      unique: true,
    },
    findings: {
      type: String,
      required: true,
      trim: true,
    },
    impression: {
      type: String,
      required: true,
      trim: true,
    },
    recommendations: {
      type: String,
      required: true,
      trim: true,
    },
    biradsScore: {
      type: String,
      enum: ['0', '1', '2', '3', '4', '5', '6'],
      required: true,
    },
    isFinal: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    signedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    signedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
diagnosticReportSchema.index({ caseId: 1 });
diagnosticReportSchema.index({ createdBy: 1 });
diagnosticReportSchema.index({ isFinal: 1 });

// Export as ES module
export const DiagnosticReport = mongoose.model(
  'DiagnosticReport',
  diagnosticReportSchema,
);
export default DiagnosticReport;
