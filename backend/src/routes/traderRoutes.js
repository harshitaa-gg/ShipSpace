const express = require("express");
const traderController = require("../controllers/traderController");

const router = express.Router();

// Browse all open available capacity listings (v_trader_available_capacity)
router.get("/listings", traderController.getAvailableListings);

// Multi-constraint capacity matching search (Strategy A: price, Strategy B: departure)
router.get("/listings/search", traderController.searchCapacity);
router.post("/listings/search", traderController.searchCapacity);

// Create a booking transactionally (invokes sp_create_booking under row lock)
router.post("/bookings", traderController.createBooking);
router.post("/:traderId/bookings", traderController.createBooking);

// View trader's own bookings (v_trader_bookings)
router.get("/bookings", traderController.getTraderBookings);
router.get("/:traderId/bookings", traderController.getTraderBookings);

// Get single booking details with status history audit trail
router.get("/bookings/:bookingId", traderController.getBookingDetails);

// Cancel trader's booking (invokes sp_cancel_booking and restores capacity)
router.post("/bookings/:bookingId/cancel", traderController.cancelBookingByTrader);
router.patch("/bookings/:bookingId/cancel", traderController.cancelBookingByTrader);

// Feature A: Itemised All-In Freight Quote (does not create booking or reserve capacity)
router.get("/listings/:listingId/quote", traderController.getListingQuote);
router.post("/listings/:listingId/quote", traderController.getListingQuote);
router.get("/quote", traderController.getListingQuote);
router.post("/quote", traderController.getListingQuote);

module.exports = router;
