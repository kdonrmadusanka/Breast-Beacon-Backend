const express = require("express");
const router = express.Router();
const { checkUserStatus } = require("../middleware/authMiddleware");
const {
  completeProfile,
  checkProfileCompletion,
  getCurrentUser,
} = require("../controllers/user.controller");

router.post("/complete-profile", checkUserStatus, completeProfile);
router.get("/check-completion", checkUserStatus, checkProfileCompletion);
router.get("/me", checkUserStatus, getCurrentUser);

module.exports = router;
