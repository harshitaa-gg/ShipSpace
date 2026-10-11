const express = require("express");
const referenceController = require("../controllers/referenceController");

const router = express.Router();

// Ports
router.get("/ports", referenceController.getPorts);
router.post("/ports", referenceController.createPort);

// Routes
router.get("/routes", referenceController.getRoutes);
router.post("/routes", referenceController.createRoute);

// Cargo Types
router.get("/cargo-types", referenceController.getCargoTypes);
router.post("/cargo-types", referenceController.createCargoType);

module.exports = router;
