const traderService = require("../services/traderService");
const { AppError, asyncHandler } = require("../middleware/errorHandler");
const {
    parsePositiveInt,
    parseOptionalPositiveInt,
    parsePositiveNumber,
    parseNonNegativeNumber,
    parseDateString,
    parseUnLocode,
} = require("../middleware/validate");


const getAvailableListings = asyncHandler(async (req, res) => {
    const origin = req.query.origin ? parseUnLocode(req.query.origin, "origin") : null;
    const destination = req.query.destination
        ? parseUnLocode(req.query.destination, "destination")
        : null;
    const cargo_type = req.query.cargo_type ? String(req.query.cargo_type).trim() : null;
    const sort_by = req.query.sort_by === "price" ? "price" : "departure";

    const listings = await traderService.getAvailableCapacity({
        origin,
        destination,
        cargo_type,
        sort_by,
    });

    res.json({
        success: true,
        count: listings.length,
        data: listings,
    });
});

const searchCapacity = asyncHandler(async (req, res) => {
    const source = { ...req.query, ...(req.body || {}) };

    const rawOrigin = source.origin_un_locode ?? source.origin;
    const rawDest = source.destination_un_locode ?? source.destination;
    const origin_port_id = parseOptionalPositiveInt(source.origin_port_id, "origin_port_id");
    const destination_port_id = parseOptionalPositiveInt(
        source.destination_port_id,
        "destination_port_id"
    );

    const origin_un_locode = rawOrigin ? parseUnLocode(rawOrigin, "origin") : null;
    const destination_un_locode = rawDest ? parseUnLocode(rawDest, "destination") : null;

    if (!origin_un_locode && !origin_port_id) {
        throw new AppError(
            "origin (UN/LOCODE) or origin_port_id is required for capacity search",
            400,
            "VALIDATION_ERROR"
        );
    }
    if (!destination_un_locode && !destination_port_id) {
        throw new AppError(
            "destination (UN/LOCODE) or destination_port_id is required for capacity search",
            400,
            "VALIDATION_ERROR"
        );
    }

    const required_cbm = parsePositiveNumber(
        source.required_cbm ?? source.cbm,
        "required_cbm"
    );
    const required_weight = parsePositiveNumber(
        source.required_weight ?? source.weight,
        "required_weight"
    );

    const cargo_type_id = parseOptionalPositiveInt(source.cargo_type_id, "cargo_type_id");
    const rawCargoName = source.cargo_type_name ?? source.cargo_type;
    const cargo_type_name =
        !cargo_type_id && rawCargoName ? String(rawCargoName).trim() : null;

    if (!cargo_type_id && !cargo_type_name) {
        throw new AppError(
            "cargo_type_id or cargo_type (name) is required for capacity search",
            400,
            "VALIDATION_ERROR"
        );
    }

    const rawReadyDate = source.cargo_ready_date ?? source.ready_date;
    const cargo_ready_date = rawReadyDate
        ? parseDateString(rawReadyDate, "cargo_ready_date")
        : null;

    const sort_by =
        String(source.sort_by || "price").toLowerCase() === "departure"
            ? "departure"
            : "price";

    const matches = await traderService.searchMatchingCapacity({
        origin_un_locode,
        destination_un_locode,
        origin_port_id,
        destination_port_id,
        required_cbm,
        required_weight,
        cargo_type_id,
        cargo_type_name,
        cargo_ready_date,
        sort_by,
    });

    res.json({
        success: true,
        count: matches.length,
        searchCriteria: {
            origin: origin_un_locode || origin_port_id,
            destination: destination_un_locode || destination_port_id,
            required_cbm,
            required_weight,
            cargo_type: cargo_type_id || cargo_type_name,
            cargo_ready_date: cargo_ready_date || "CURRENT_DATE",
            sort_by,
        },
        data: matches,
    });
});

const createBooking = asyncHandler(async (req, res) => {
    const trader_id = parsePositiveInt(
        req.body.trader_id ?? req.params.traderId,
        "trader_id"
    );
    const listing_id = parsePositiveInt(req.body.listing_id, "listing_id");
    const cargo_type_id = parsePositiveInt(req.body.cargo_type_id, "cargo_type_id");
    const booked_cbm = parsePositiveNumber(req.body.booked_cbm, "booked_cbm");
    const booked_weight = parsePositiveNumber(req.body.booked_weight, "booked_weight");

    const result = await traderService.createBooking({
        trader_id,
        listing_id,
        cargo_type_id,
        booked_cbm,
        booked_weight,
    });

    res.status(201).json({
        success: true,
        message: "Booking confirmed under transaction lock",
        data: result,
    });
});

const getTraderBookings = asyncHandler(async (req, res) => {
    const traderId = parsePositiveInt(
        req.params.traderId ?? req.query.trader_id,
        "trader_id"
    );
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;

    const bookings = await traderService.getTraderBookings(traderId, { status });
    res.json({
        success: true,
        count: bookings.length,
        data: bookings,
    });
});

const getBookingDetails = asyncHandler(async (req, res) => {
    const bookingId = parsePositiveInt(req.params.bookingId, "bookingId");
    const trader_id = parseOptionalPositiveInt(
        req.params.traderId ?? req.query.trader_id,
        "trader_id"
    );
    const provider_id = parseOptionalPositiveInt(req.query.provider_id, "provider_id");

    const booking = await traderService.getBookingDetails(bookingId, {
        trader_id,
        provider_id,
    });

    res.json({
        success: true,
        data: booking,
    });
});

const cancelBookingByTrader = asyncHandler(async (req, res) => {
    const bookingId = parsePositiveInt(req.params.bookingId, "bookingId");
    const traderId = parsePositiveInt(
        req.body?.trader_id ?? req.params.traderId ?? req.query.trader_id,
        "trader_id"
    );
    const reason =
        req.body && req.body.reason
            ? String(req.body.reason).trim()
            : "Cancelled by trader";

    const result = await traderService.cancelBookingByTrader({
        bookingId,
        traderId,
        reason,
    });

    res.json({
        success: true,
        message: "Booking cancelled and reserved capacity restored to listing",
        data: result,
    });
});

const getListingQuote = asyncHandler(async (req, res) => {
    const source = { ...req.query, ...(req.body || {}) };
    const listingId = parsePositiveInt(
        req.params.listingId ?? source.listing_id ?? source.listingId,
        "listing_id"
    );
    const cbm = parseNonNegativeNumber(
        source.cbm ?? source.booked_cbm ?? source.required_cbm,
        "cbm"
    );
    const weight = parseNonNegativeNumber(
        source.weight ?? source.booked_weight ?? source.required_weight,
        "weight"
    );
    const excessStorageDays =
        source.excess_storage_days !== undefined &&
        source.excess_storage_days !== null &&
        source.excess_storage_days !== ""
            ? parseNonNegativeNumber(source.excess_storage_days, "excess_storage_days")
            : 0;
    const asOfDate =
        source.as_of_date !== undefined &&
        source.as_of_date !== null &&
        String(source.as_of_date).trim() !== ""
            ? parseDateString(source.as_of_date, "as_of_date")
            : null;

    const quote = await traderService.getTraderQuote({
        listingId,
        cbm,
        weight,
        excessStorageDays,
        asOfDate,
    });

    res.json({
        success: true,
        data: quote,
    });
});

module.exports = {
    getAvailableListings,
    searchCapacity,
    createBooking,
    getTraderBookings,
    getBookingDetails,
    cancelBookingByTrader,
    getListingQuote,
};
