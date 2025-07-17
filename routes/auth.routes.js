const { Router } = require("express");
const {
  register,
  login,
  refreshToken,
  validateToken,
} = require("../controllers/auth.controller");

const router = Router();

// POST /api/auth/register - User registration
router.post("/register", register);

// POST /api/auth/login - User login
router.post("/login", login);

// POST /api/auth/refresh-token - Refresh JWT token
router.post("/refresh-token", refreshToken);

// GET /api/auth/validate - Validate token
router.get("/validate", validateToken);

module.exports = router;
