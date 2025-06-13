const ChatMessage = require("../models/chatMessage.model");

// Create a chat message
exports.createChatMessage = async (req, res) => {
  try {
    const { patientId, doctorId, mammogramId, sender, message, imageAction } =
      req.body;
    const chatMessage = new ChatMessage({
      patientId,
      doctorId,
      mammogramId,
      sender,
      message,
      imageAction,
    });
    await chatMessage.save();
    res.status(201).json(chatMessage);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Get chat messages by patientId
exports.getChatMessagesByPatientId = async (req, res) => {
  try {
    const chatMessages = await ChatMessage.find({
      patientId: req.params.patientId,
    })
      .populate("patientId doctorId mammogramId")
      .sort({ timestamp: 1 });
    res.status(200).json(chatMessages);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Get chat message by ID
exports.getChatMessageById = async (req, res) => {
  try {
    const chatMessage = await ChatMessage.findById(req.params.id).populate(
      "patientId doctorId mammogramId"
    );
    if (!chatMessage) {
      return res.status(404).json({ error: "Chat message not found" });
    }
    res.status(200).json(chatMessage);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Delete chat message
exports.deleteChatMessage = async (req, res) => {
  try {
    const chatMessage = await ChatMessage.findByIdAndDelete(req.params.id);
    if (!chatMessage) {
      return res.status(404).json({ error: "Chat message not found" });
    }
    res.status(200).json({ message: "Chat message deleted" });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};
