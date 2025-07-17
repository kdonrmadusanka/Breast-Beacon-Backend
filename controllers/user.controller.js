const User = require("../models/User.model");

const getRoleRequirements = async (req, res) => {
  try {
    res.json({
      roles: {
        patient: ["basic profile completion"],
        clinician: ["basic profile completion", "clinician verification"],
        admin: ["admin key verification"],
      },
    });
  } catch (error) {
    console.error("Error in getRoleRequirements:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const verifyAdminKey = async (req, res) => {
  try {
    const { adminKey } = req.body;
    if (!adminKey) {
      return res.status(400).json({ message: "Admin key is required" });
    }
    if (adminKey === process.env.ADMIN_KEY) {
      res.json({ valid: true });
    } else {
      res.status(403).json({ message: "Invalid admin key" });
    }
  } catch (error) {
    console.error("Error in verifyAdminKey:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const completeProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.profile = { ...user.profile, ...req.body.profile };
    user.status = "active";
    await user.save();

    res.json({ message: "Profile completed", user });
  } catch (error) {
    console.error("Error in completeProfile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const checkProfileCompletion = async (req, res) => {
  try {
    res.json({ completed: req.user.status === "active" });
  } catch (error) {
    console.error("Error in checkProfileCompletion:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error("Error in getCurrentUser:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getRoleRequirements,
  verifyAdminKey,
  completeProfile,
  checkProfileCompletion,
  getCurrentUser,
};
