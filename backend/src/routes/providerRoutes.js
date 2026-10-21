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

// Feature A: Listing Pricing Rules & Charge Items
router.get("/listings/:listingId/pricing", providerController.getListingPricing);
router.get("/:providerId/listings/:listingId/pricing", providerController.getListingPricing);
router.put("/:providerId/listings/:listingId/pricing", providerController.upsertListingPricing);
router.post("/:providerId/listings/:listingId/pricing", providerController.upsertListingPricing);
router.put("/listings/:listingId/pricing", providerController.upsertListingPricing);
router.post("/listings/:listingId/pricing", providerController.upsertListingPricing);

// Feature B: Listing Schedule Policy, Milestone Templates & Rollover Decisions
router.get("/listings/:listingId/schedule", providerController.getListingSchedule);
router.get("/:providerId/listings/:listingId/schedule", providerController.getListingSchedule);
router.put("/:providerId/listings/:listingId/schedule", providerController.upsertListingSchedule);
router.post("/:providerId/listings/:listingId/schedule", providerController.upsertListingSchedule);
router.put("/listings/:listingId/schedule", providerController.upsertListingSchedule);
router.post("/listings/:listingId/schedule", providerController.upsertListingSchedule);

router.post("/bookings/:bookingId/rollover", providerController.recordBookingRolloverDecision);
router.post("/:providerId/bookings/:bookingId/rollover", providerController.recordBookingRolloverDecision);

module.exports = router;
