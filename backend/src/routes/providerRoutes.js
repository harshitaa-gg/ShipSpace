const express = require("express");
const providerController = require("../controllers/providerController");

const router = express.Router();

// Publish a new capacity listing (with allowed cargo types)
router.post("/listings", providerController.createListing);
router.post("/:providerId/listings", providerController.createListing);

// View provider's own listings & utilization metrics
router.get("/listings", providerController.getProviderListings);
router.get("/:providerId/listings", providerController.getProviderListings);
router.get("/listings/:listingId", providerController.getListingById);

// Update listing status (open / closed / cancelled)
router.patch("/listings/:listingId/status", providerController.updateListingStatus);

// View bookings made against provider's listings
router.get("/bookings", providerController.getProviderBookings);
router.get("/:providerId/bookings", providerController.getProviderBookings);
router.get("/listings/:listingId/bookings", providerController.getProviderBookings);

// Cancel a booking on a provider's listing (invokes sp_cancel_booking)
router.post("/bookings/:bookingId/cancel", providerController.cancelBookingByProvider);
router.patch("/bookings/:bookingId/cancel", providerController.cancelBookingByProvider);

module.exports = router;
