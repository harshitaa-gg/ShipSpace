const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

// Register a new Trader or Provider account in PostgreSQL
router.post("/register", authController.register);

module.exports = router;
