const adminService = require("../services/adminService");
const { asyncHandler } = require("../middleware/errorHandler");
const {
    parseOptionalPositiveInt,
    parseUnLocode,
} = require("../middleware/validate");

const getPlatformSummary = asyncHandler(async (req, res) => {
    const summary = await adminService.getPlatformSummary();
    res.json({
        success: true,
        data: summary,
    });
});

const getCapacityOverview = asyncHandler(async (req, res) => {
    const origin_un_locode = req.query.origin
        ? parseUnLocode(req.query.origin, "origin")
        : null;
    const destination_un_locode = req.query.destination
        ? parseUnLocode(req.query.destination, "destination")
        : null;

    const overview = await adminService.getCapacityOverview({
        origin_un_locode,
        destination_un_locode,
    });

    res.json({
        success: true,
        count: overview.length,
        data: overview,
    });
});

const getProviderUtilization = asyncHandler(async (req, res) => {
    const provider_id = parseOptionalPositiveInt(req.query.provider_id, "provider_id");
    const rows = await adminService.getProviderUtilization({ provider_id });

    res.json({
        success: true,
        count: rows.length,
        data: rows,
    });
});

const getUsers = asyncHandler(async (req, res) => {
    const role = req.query.role ? String(req.query.role).trim().toLowerCase() : null;
    const users = await adminService.getUsers({ role });

    res.json({
        success: true,
        count: users.length,
        data: users,
    });
});

const getAllBookings = asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
    const provider_id = parseOptionalPositiveInt(req.query.provider_id, "provider_id");
    const trader_id = parseOptionalPositiveInt(req.query.trader_id, "trader_id");
    const route_id = parseOptionalPositiveInt(req.query.route_id, "route_id");

    const bookings = await adminService.getAllBookings({
        status,
        provider_id,
        trader_id,
        route_id,
    });

    res.json({
        success: true,
        count: bookings.length,
        data: bookings,
    });
});

const getBookingAuditHistory = asyncHandler(async (req, res) => {
    const booking_id = parseOptionalPositiveInt(
        req.params.bookingId ?? req.query.booking_id,
        "booking_id"
    );
    const history = await adminService.getBookingAuditHistory({ booking_id });

    res.json({
        success: true,
        count: history.length,
        data: history,
    });
});

module.exports = {
    getPlatformSummary,
    getCapacityOverview,
    getProviderUtilization,
    getUsers,
    getAllBookings,
    getBookingAuditHistory,
};
