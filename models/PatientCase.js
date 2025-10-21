// models/PatientCase.js
import mongoose from 'mongoose';

const medicalImageSchema = new mongoose.Schema({
  seriesId: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  thumbnailUrl: {
    type: String,
    required: true,
  },
  metadata: {
    patientName: String,
    studyDate: Date,
    modality: {
      type: String,
      enum: ['Mammogram', 'Ultrasound', 'MRI', 'CT'],
      required: true,
    },
    bodyPart: {
      type: String,
      default: 'Breast',
    },
    studyInstanceUID: String,
    seriesInstanceUID: String,
    sopInstanceUID: String,
  },
  annotations: [
    {
      type: {
        type: String,
        enum: ['circle', 'rectangle', 'arrow', 'text', 'line'],
        required: true,
      },
      points: [Number], // [x, y, radius] or [x1, y1, x2, y2]
      label: String,
      color: {
        type: String,
        default: '#ff0000',
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

const patientCaseSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      required: true,
      index: true,
    },
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    age: {
      type: Number,
      required: true,
      min: 0,
      max: 120,
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed', 'referred'],
      default: 'pending',
      index: true,
    },
    studyType: {
      type: String,
      enum: ['mammogram', 'ultrasound', 'mri', 'ct'],
      required: true,
      index: true,
    },
    studyDate: {
      type: Date,
      required: true,
      index: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    assignedRadiologist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    images: [medicalImageSchema],
    previousStudies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PatientCase',
      },
    ],
    clinicalHistory: String,
    referringPhysician: {
      name: String,
      contact: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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

// Indexes for performance
patientCaseSchema.index({ status: 1, priority: -1, dueDate: 1 });
patientCaseSchema.index({ patientName: 'text', patientId: 'text' });

// Export model
export const PatientCase = mongoose.model('PatientCase', patientCaseSchema);
export default PatientCase;
