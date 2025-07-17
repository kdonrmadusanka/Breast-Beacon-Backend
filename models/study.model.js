const { Schema, model } = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const studySchema = new Schema(
  {
    studyId: {
      type: String,
      required: true,
      unique: true,
      default: uuidv4,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
    status: {
      type: String,
      enum: ["uploaded", "processing", "completed", "failed"],
      default: "uploaded",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = model("Study", studySchema);
