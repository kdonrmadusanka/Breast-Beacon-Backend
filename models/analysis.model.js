const { Schema, model } = require("mongoose");

const analysisSchema = new Schema({
  studyId: { type: Schema.Types.ObjectId, ref: "Study", required: true },
  status: {
    type: String,
    enum: ["queued", "processing", "completed", "failed"],
    default: "queued",
  },
  results: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
});

module.exports = model("Analysis", analysisSchema);
