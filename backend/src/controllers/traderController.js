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

function resolveActorIdFromReq(req) {
    const raw =
        req.headers["x-user-id"] ??
        req.headers["x-provider-id"] ??
        req.headers["x-trader-id"] ??
        req.body?.actor_user_id ??
        req.body?.provider_id ??
        req.body?.trader_id ??
        req.body?.uploaded_by_user_id ??
        req.body?.reviewed_by_user_id ??
        req.params?.traderId ??
        req.params?.providerId ??
        req.query?.user_id ??
        req.query?.provider_id ??
        req.query?.trader_id;

    return parsePositiveInt(raw, "actor_user_id");
}

const getBookingTimeline = asyncHandler(async (req, res) => {
    const bookingId = parsePositiveInt(req.params.bookingId, "bookingId");
    const traderId = parseOptionalPositiveInt(
        req.params.traderId ?? req.headers["x-trader-id"] ?? req.query.trader_id,
        "trader_id"
    );
    const providerId = parseOptionalPositiveInt(
        req.params.providerId ?? req.headers["x-provider-id"] ?? req.query.provider_id,
        "provider_id"
    );

    const timeline = await traderService.getBookingTimeline(bookingId, {
        traderId,
        providerId,
    });

    res.json({
        success: true,
        data: timeline,
    });
});

const updateBookingMilestone = asyncHandler(async (req, res) => {
    const bookingId = parsePositiveInt(req.params.bookingId, "bookingId");
    const milestoneId = parsePositiveInt(req.params.milestoneId, "milestoneId");
    const actorUserId = resolveActorIdFromReq(req);
    const body = req.body || {};

    const data = await traderService.updateBookingMilestone({
        bookingId,
        milestoneId,
        actorUserId,
        currentDueAt: body.current_due_at ?? body.currentDueAt,
        status: body.status,
        completionNote: body.completion_note ?? body.completionNote,
        reason: body.reason ?? body.date_change_reason,
    });

    res.json({
        success: true,
        message: "Booking milestone updated successfully",
        data,
    });
});

const initBookingDocuments = asyncHandler(async (req, res) => {
    const bookingId = parsePositiveInt(req.params.bookingId, "bookingId");
    await traderService.ensureBookingDocumentChecklist(bookingId);
    const timeline = await traderService.getBookingTimeline(bookingId);

    res.status(201).json({
        success: true,
        message: "Booking document checklist initialized",
        data: timeline,
    });
});

const uploadBookingDocument = asyncHandler(async (req, res) => {
    const bookingId = parsePositiveInt(req.params.bookingId, "bookingId");
    const checklistItemId = parsePositiveInt(req.params.checklistItemId, "checklistItemId");
    const uploadedByUserId = resolveActorIdFromReq(req);
    const body = req.body || {};

    const data = await traderService.uploadBookingDocument({
        bookingId,
        checklistItemId,
        uploadedByUserId,
        originalFilename: body.original_filename ?? body.originalFilename ?? body.filename,
        mimeType: body.mime_type ?? body.mimeType,
        fileBase64: body.file_base64 ?? body.fileBase64 ?? body.content_base64,
        referenceValue: body.reference_value ?? body.referenceValue,
    });

    res.status(201).json({
        success: true,
        message: "Document uploaded and stored securely outside web root",
        data,
    });
});

const updateBookingDocumentChecklistItem = asyncHandler(async (req, res) => {
    const bookingId = parsePositiveInt(req.params.bookingId, "bookingId");
    const checklistItemId = parsePositiveInt(req.params.checklistItemId, "checklistItemId");
    const actorUserId = resolveActorIdFromReq(req);
    const body = req.body || {};

    const data = await traderService.updateBookingDocumentChecklistItem({
        bookingId,
        checklistItemId,
        actorUserId,
        status: body.status,
        referenceValue: body.reference_value ?? body.referenceValue,
        correctionReason: body.correction_reason ?? body.correctionReason ?? body.reason,
    });

    res.json({
        success: true,
        message: "Document checklist item updated successfully",
        data,
    });
});

const downloadBookingDocument = asyncHandler(async (req, res) => {
    const bookingId = parsePositiveInt(req.params.bookingId, "bookingId");
    const uploadId = parsePositiveInt(req.params.uploadId, "uploadId");
    const actorUserId = resolveActorIdFromReq(req);

    const fileMeta = await traderService.getBookingDocumentDownload({
        bookingId,
        uploadId,
        actorUserId,
    });

    res.setHeader("Content-Type", fileMeta.mimeType);
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileMeta.originalFilename)}"`
    );
    res.sendFile(fileMeta.filePath);
});

const processReminders = asyncHandler(async (req, res) => {
    const source = { ...req.query, ...(req.body || {}) };
    const asOf = source.as_of ?? source.asOf ?? null;

    const result = await traderService.processDueReminders({ asOf });
    res.json({
        success: true,
        message: "Due reminders processed",
        data: result,
    });
});

const getNotifications = asyncHandler(async (req, res) => {
    const userId = parsePositiveInt(
        req.params.userId ??
            req.params.traderId ??
            req.params.providerId ??
            req.headers["x-user-id"] ??
            req.headers["x-trader-id"] ??
            req.headers["x-provider-id"] ??
            req.query.user_id ??
            req.query.trader_id ??
            req.query.provider_id,
        "user_id"
    );
    const unreadOnly =
        String(req.query.unread_only || "").toLowerCase() === "true" ||
        req.query.unread_only === "1";
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const data = await traderService.getUserNotifications(userId, {
        unreadOnly,
        limit,
    });

    res.json({
        success: true,
        data,
    });
});

const markNotificationRead = asyncHandler(async (req, res) => {
    const notificationId = parsePositiveInt(req.params.notificationId, "notificationId");
    const userId = resolveActorIdFromReq(req);

    const data = await traderService.markNotificationRead({
        notificationId,
        userId,
    });

    res.json({
        success: true,
        message: "Notification marked as read",
        data,
    });
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
    const userId = resolveActorIdFromReq(req);
    const data = await traderService.markAllNotificationsRead(userId);

    res.json({
        success: true,
        message: "All unread notifications marked as read",
        data,
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
    getBookingTimeline,
    updateBookingMilestone,
    initBookingDocuments,
    uploadBookingDocument,
    updateBookingDocumentChecklistItem,
    downloadBookingDocument,
    processReminders,
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
};
