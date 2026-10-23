const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const express = require("express");
const cors = require("cors");
const pool = require("./config/db");

const referenceRoutes = require("./routes/referenceRoutes");
const providerRoutes = require("./routes/providerRoutes");
const traderRoutes = require("./routes/traderRoutes");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");
const providerController = require("./controllers/providerController");
const traderController = require("./controllers/traderController");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { optionalAuthenticateToken } = require("./middleware/auth");

const app = express();

// Configure CORS to restrict allowed origins in production while supporting localhost in development
const rawAllowedOrigins = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS;
const configuredOrigins = rawAllowedOrigins
    ? rawAllowedOrigins.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

const defaultDevOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, unit tests)
        if (!origin) return callback(null, true);

        // If explicitly configured origins exist, check against them
        if (configuredOrigins.length > 0) {
            if (configuredOrigins.includes("*") || configuredOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error(`CORS policy: origin ${origin} is not allowed`));
        }

        // In non-production, allow localhost dev servers
        if (process.env.NODE_ENV !== "production") {
            if (
                defaultDevOrigins.includes(origin) ||
                /^http:\/\/localhost(:\d+)?$/.test(origin) ||
                /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
            ) {
                return callback(null, true);
            }
        }

        // In production without configured origins, fail closed
        return callback(new Error(`CORS policy: origin ${origin} is not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-id", "x-provider-id", "x-trader-id"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "15mb" }));
app.use(optionalAuthenticateToken);

// ----------------------------------------------------------------------------
// 1. Health & Connectivity Endpoints
// ----------------------------------------------------------------------------
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "ShipSpace backend is running",
    });
});

app.get("/api/health/db", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT NOW() AS server_time, current_database() AS database_name, current_schema() AS active_schema"
        );

        res.json({
            success: true,
            message: "PostgreSQL connection successful",
            database: result.rows[0].database_name,
            schema: result.rows[0].active_schema,
            serverTime: result.rows[0].server_time,
        });
    } catch (error) {
        console.error("Database health check failed:", error.message);

        res.status(500).json({
            success: false,
            message: "Database connection failed",
            error: {
                code: "DB_CONNECTION_FAILED",
                message: error.message,
            },
        });
    }
});

// ----------------------------------------------------------------------------
// 2. Role-Based & Resource REST Routes
// ----------------------------------------------------------------------------
app.use("/api/reference", referenceRoutes);
app.use("/api", referenceRoutes);

app.use("/api/provider", providerRoutes);
app.use("/api/providers", providerRoutes);

app.use("/api/trader", traderRoutes);
app.use("/api/traders", traderRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/auth", authRoutes);
app.use("/api", authRoutes);

// Top-level REST resource aliases for listings and bookings
app.get("/api/listings", traderController.getAvailableListings);
app.get("/api/listings/search", traderController.searchCapacity);
app.post("/api/listings/search", traderController.searchCapacity);
app.get("/api/listings/:listingId", providerController.getListingById);
app.post("/api/listings", providerController.createListing);
app.patch("/api/listings/:listingId/status", providerController.updateListingStatus);

// Feature A: Top-level REST resource aliases for listing pricing and trader quotes
app.get("/api/listings/:listingId/pricing", providerController.getListingPricing);
app.put("/api/listings/:listingId/pricing", providerController.upsertListingPricing);
app.post("/api/listings/:listingId/pricing", providerController.upsertListingPricing);
app.get("/api/listings/:listingId/quote", traderController.getListingQuote);
app.post("/api/listings/:listingId/quote", traderController.getListingQuote);
app.get("/api/quotes", traderController.getListingQuote);
app.post("/api/quotes", traderController.getListingQuote);

// Feature B: Top-level REST resource aliases for listing schedules, booking timelines, documents, rollover, reminders & notifications
app.get("/api/listings/:listingId/schedule", providerController.getListingSchedule);
app.put("/api/listings/:listingId/schedule", providerController.upsertListingSchedule);
app.post("/api/listings/:listingId/schedule", providerController.upsertListingSchedule);

app.get("/api/bookings", traderController.getTraderBookings);

app.post("/api/bookings", traderController.createBooking);
app.get("/api/bookings/:bookingId", traderController.getBookingDetails);
app.post("/api/bookings/:bookingId/cancel", traderController.cancelBookingByTrader);
app.patch("/api/bookings/:bookingId/cancel", traderController.cancelBookingByTrader);

app.get("/api/bookings/:bookingId/timeline", traderController.getBookingTimeline);
app.patch("/api/bookings/:bookingId/milestones/:milestoneId", traderController.updateBookingMilestone);
app.post("/api/bookings/:bookingId/documents/init", traderController.initBookingDocuments);
app.post("/api/bookings/:bookingId/documents/:checklistItemId/upload", traderController.uploadBookingDocument);
app.patch("/api/bookings/:bookingId/documents/:checklistItemId", traderController.updateBookingDocumentChecklistItem);
app.patch("/api/bookings/:bookingId/documents/:checklistItemId/review", traderController.updateBookingDocumentChecklistItem);
app.get("/api/bookings/:bookingId/documents/uploads/:uploadId/download", traderController.downloadBookingDocument);
app.post("/api/bookings/:bookingId/rollover", providerController.recordBookingRolloverDecision);

app.post("/api/reminders/process", traderController.processReminders);
app.get("/api/notifications", traderController.getNotifications);
app.patch("/api/notifications/:notificationId/read", traderController.markNotificationRead);
app.post("/api/notifications/read-all", traderController.markAllNotificationsRead);

// ----------------------------------------------------------------------------
// 3. 404 & Centralized Error Handling
// ----------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;