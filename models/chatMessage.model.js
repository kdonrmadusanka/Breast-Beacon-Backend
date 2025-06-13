const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const chatMessageSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "Clinician",
      required: false, // Optional if sender is patient
    },
    mammogramId: {
      type: Schema.Types.ObjectId,
      ref: "Mammogram",
      required: false,
    },
    sender: {
      type: String,
      enum: ["Patient", "Doctor"],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    imageAction: {
      type: {
        type: String,
        enum: ["highlight", "none"],
        required: false,
      },
      coordinates: [
        {
          x: { type: Number },
          y: { type: Number },
          width: { type: Number },
          height: { type: Number },
        },
      ],
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

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
