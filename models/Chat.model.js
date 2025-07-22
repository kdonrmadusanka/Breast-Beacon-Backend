import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  content: { type: String, required: true, trim: true },
  timestamp: { type: Date, default: Date.now, index: true },
});

export default mongoose.model("Chat", chatSchema);
