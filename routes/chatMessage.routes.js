const express = require("express");
const router = express.Router();
const chatMessageController = require("../controllers/chatMessage.controller");

router.post("/", chatMessageController.createChatMessage);
router.get("/:id", chatMessageController.getChatMessageById);
router.get(
  "/patient/:patientId",
  chatMessageController.getChatMessagesByPatientId
);
router.delete("/:id", chatMessageController.deleteChatMessage);

module.exports = router;
