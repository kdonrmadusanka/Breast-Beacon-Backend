const jwt = require("jsonwebtoken");

const checkUserStatus = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  console.log(
    "Token in checkUserStatus:",
    token ? token.substring(0, 20) + "..." : "No token"
  );

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_jwt_secret"
    );
    console.log("Decoded token:", decoded);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const checkRole = (roles) => (req, res, next) => {
  console.log("Checking role, user:", req.user, "Allowed roles:", roles);
  if (!req.user || !roles.includes(req.user.role)) {
    return res
      .status(403)
      .json({ message: "Access denied: Insufficient role" });
  }
  next();
};

module.exports = { checkUserStatus, checkRole };
