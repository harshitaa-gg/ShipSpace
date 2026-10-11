const express = require("express");
const adminController = require("../controllers/adminController");
const referenceController = require("../controllers/referenceController");

const router = express.Router();

// Executive KPI summary (v_admin_platform_summary)
router.get("/summary", adminController.getPlatformSummary);

// Route-level capacity & utilization overview (v_admin_capacity_overview)
router.get("/capacity-overview", adminController.getCapacityOverview);

// Provider listing utilization report (v_provider_listing_utilization)
router.get("/provider-utilization", adminController.getProviderUtilization);

// User directory (providers, traders, admins)
router.get("/users", adminController.getUsers);

// Platform-wide bookings & status audit history
router.get("/bookings", adminController.getAllBookings);
router.get("/bookings/history", adminController.getBookingAuditHistory);
router.get("/bookings/:bookingId/history", adminController.getBookingAuditHistory);

// Reference data management (ports, routes, cargo types)
router.get("/ports", referenceController.getPorts);
router.post("/ports", referenceController.createPort);
router.get("/routes", referenceController.getRoutes);
router.post("/routes", referenceController.createRoute);
router.get("/cargo-types", referenceController.getCargoTypes);
router.post("/cargo-types", referenceController.createCargoType);

module.exports = router;
