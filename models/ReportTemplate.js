// models/ReportTemplate.js
import mongoose from 'mongoose';

const reportTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
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
    category: {
      type: String,
      enum: [
        'normal',
        'benign',
        'suspicious',
        'malignant',
        'followup',
        'custom',
      ],
      default: 'custom',
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
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
reportTemplateSchema.index({ category: 1, isPublic: 1 });
reportTemplateSchema.index({ createdBy: 1 });
reportTemplateSchema.index({ name: 'text', description: 'text' });

// Export the model
export const ReportTemplate = mongoose.model(
  'ReportTemplate',
  reportTemplateSchema,
);
export default ReportTemplate;
