import mongoose from 'mongoose';

const mammogramSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  originalFilename: {
    type: String,
    required: true
  },
  storagePath: {
    type: String,
    required: true
  },
  storageType: {
    type: String,
    enum: ['local', 's3', 'azure'],
    default: 'local'
  },
  fileSize: {
    type: Number,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  checksum: {
    type: String,
    required: true
  },
  notes: {
    type: String,
    default: ''
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  metadata: {
    patientName: String,
    patientId: String,
    studyDate: String,
    modality: String,
    laterality: {
      type: String,
      enum: ['L', 'R', 'B', null],
      default: null
    },
    viewPosition: {
      type: String,
      enum: ['CC', 'MLO', 'ML', 'LM', 'AT', null],
      default: null
    },
    bodyPartExamined: String,
    acquisitionDate: String,
    manufacturer: String,
    institutionName: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for file URL
mammogramSchema.virtual('url').get(function() {
  if (this.storageType === 's3') {
    return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${this.storagePath}`;
  }
  return `${process.env.APP_URL}/api/mammograms/${this._id}/file`;
});

// Indexes for faster queries
mammogramSchema.index({ patientId: 1, uploadDate: -1 });
mammogramSchema.index({ 'metadata.laterality': 1 });
mammogramSchema.index({ 'metadata.viewPosition': 1 });

const Mammogram = mongoose.model('Mammogram', mammogramSchema);

export default Mammogram;