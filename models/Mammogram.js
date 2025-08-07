import mongoose from "mongoose";

const mammogramSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    originalFilename: {
      type: String,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    storageType: {
      type: String,
      enum: ["local", "s3", "azure"],
      default: "local",
    },
    fileSize: {
      type: Number,
      required: true,
    },
    fileType: {
      type: String,
      required: true,
    },
    checksum: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
      default: "",
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploadDate: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      patientName: String,
      patientId: String,
      studyDate: String,
      modality: String,
      laterality: {
        type: String,
        enum: ["L", "R", "B", null],
        default: null,
      },
      viewPosition: {
        type: String,
        enum: ["CC", "MLO", "ML", "LM", "AT", null],
        default: null,
      },
      bodyPartExamined: String,
      acquisitionDate: String,
      manufacturer: String,
      institutionName: String,
    },
    analysisResults: {
      densityCategory: {
        type: String,
        enum: ["A", "B", "C", "D"], // BI-RADS categories
        default: null,
      },
      findings: [
        {
          type: {
            type: String,
            enum: [
              "mass",
              "calcification",
              "asymmetry",
              "distortion",
              "lymph-node",
            ],
            required: true,
          },
          location: {
            laterality: {
              type: String,
              enum: ["L", "R"],
              required: true,
            },
            quadrant: {
              type: String,
              enum: ["UOQ", "UIQ", "LOQ", "LIQ", "central"],
              required: true,
            },
            clockPosition: {
              type: Number,
              min: 1,
              max: 12,
            },
            depth: {
              type: String,
              enum: ["anterior", "middle", "posterior", "unknown"],
            },
          },
          size: {
            // in mm
            width: Number,
            height: Number,
            depth: Number,
          },
          characteristics: {
            shape: {
              type: String,
              enum: ["round", "oval", "irregular", "lobulated", "unknown"],
            },
            margin: {
              type: String,
              enum: [
                "circumscribed",
                "microlobulated",
                "obscured",
                "indistinct",
                "spiculated",
              ],
            },
            density: {
              type: String,
              enum: ["high", "equal", "low", "fat-containing"],
            },
          },
          confidence: {
            type: Number,
            min: 0,
            max: 100,
            default: 80,
          },
          birads: {
            type: String,
            enum: ["0", "1", "2", "3", "4A", "4B", "4C", "5", "6"],
            default: "0",
          },
          notes: String,
          aiAnalysis: {
            modelVersion: String,
            confidenceScores: {
              benign: Number,
              malignant: Number,
            },
            features: [String],
          },
        },
      ],
      riskScore: {
        type: Number,
        min: 0,
        max: 100,
      },
      technicalQuality: {
        type: String,
        enum: ["excellent", "good", "adequate", "poor"],
        default: "good",
      },
      comparison: {
        previousStudy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Mammogram",
        },
        change: {
          type: String,
          enum: ["new", "increased", "decreased", "stable", "resolved"],
        },
      },
      recommendations: [
        {
          type: {
            type: String,
            enum: ["followup", "biopsy", "ultrasound", "mri", "consultation"],
            required: true,
          },
          urgency: {
            type: String,
            enum: ["routine", "short-term", "immediate"],
            default: "routine",
          },
          description: String,
        },
      ],
      processedDate: {
        type: Date,
        default: null,
      },
      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      aiModelsUsed: [
        {
          name: String,
          version: String,
          timestamp: Date,
        },
      ],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for file URL
mammogramSchema.virtual("url").get(function () {
  if (this.storageType === "s3") {
    return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${this.storagePath}`;
  }
  return `${process.env.APP_URL}/api/mammograms/${this._id}/file`;
});

// Virtual for thumbnail URL
mammogramSchema.virtual("thumbnailUrl").get(function () {
  if (this.storageType === "s3") {
    return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/thumbnails/${this.storagePath}`;
  }
  return `${process.env.APP_URL}/api/mammograms/${this._id}/thumbnail`;
});

// Indexes for faster queries
mammogramSchema.index({ patientId: 1, uploadDate: -1 });
mammogramSchema.index({ "metadata.laterality": 1 });
mammogramSchema.index({ "metadata.viewPosition": 1 });
mammogramSchema.index({ "analysisResults.densityCategory": 1 });
mammogramSchema.index({ "analysisResults.findings.birads": 1 });
mammogramSchema.index({ "analysisResults.riskScore": 1 });

// Pre-save hook to update processed date
mammogramSchema.pre("save", function (next) {
  if (
    this.isModified("analysisResults") &&
    this.analysisResults.densityCategory
  ) {
    this.analysisResults.processedDate = new Date();
  }
  next();
});

const Mammogram = mongoose.model("Mammogram", mammogramSchema);

export default Mammogram;
