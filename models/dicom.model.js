const { Schema, model } = require("mongoose");

const dicomSchema = new Schema(
  {
    originalName: { type: String, required: true },
    fileName: { type: String, required: true, unique: true },
    filePath: { type: String, required: true },
    size: { type: Number, required: true },
    patientId: { type: String, required: true },
    studyId: { type: String, required: true },
    metadata: { type: Object, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    previewUrl: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = model("Dicom", dicomSchema);
