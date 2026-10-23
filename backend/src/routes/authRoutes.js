const express = require("express");
const authController = require("../controllers/authController");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Register a new Trader or Provider account in PostgreSQL
router.post("/register", authController.register);

// Authenticate user with email and password, issuing a signed JWT
router.post("/login", authController.login);

// Retrieve current authenticated user profile
router.get("/me", authenticateToken, authController.getMe);

module.exports = router;
