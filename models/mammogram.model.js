const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const mammogramSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    analysisResult: {
      prediction: {
        type: String,
        enum: ["Benign", "Malignant"],
        required: true,
      },
      confidence: {
        type: Number,
        min: 0,
        max: 1,
        required: true,
      },
      suspiciousRegions: [
        {
          x: { type: Number, required: true },
          y: { type: Number, required: true },
          width: { type: Number, required: true },
          height: { type: Number, required: true },
        },
      ],
      segmentationMaskUrl: {
        type: String,
        required: false,
      },
    },
    treatmentRecommendation: {
      type: {
        type: String,
        enum: ["Benign", "Malignant"],
        required: true,
      },
      suggestions: [
        {
          type: String,
          required: true,
        },
      ],
    },
    differences: {
      previousImageId: {
        type: Schema.Types.ObjectId,
        ref: "Mammogram",
        required: false,
      },
      changeInRegions: [
        {
          regionId: { type: Number, required: true },
          areaChange: { type: Number, required: true },
          positionShift: {
            x: { type: Number, required: true },
            y: { type: Number, required: true },
          },
        },
      ],
      overallProgression: {
        type: String,
        enum: ["Stable", "Worsening", "Improving"],
        required: false,
      },
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Mammogram", mammogramSchema);
