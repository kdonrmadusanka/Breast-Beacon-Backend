import mongoose from "mongoose";

const mammogramSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  filePath: { type: String, required: true },
  originalFilename: { type: String, required: true },
  fileType: { type: String, enum: ["DICOM", "PNG"], required: true },
  fileSize: { type: Number, required: true },
  uploadDate: { type: Date, default: Date.now },
});

export default mongoose.model("Mammogram", mammogramSchema);
