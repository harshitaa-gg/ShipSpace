const providerService = require("../services/providerService");
const { AppError, asyncHandler } = require("../middleware/errorHandler");
const {
    parsePositiveInt,
    parseOptionalPositiveInt,
    parsePositiveNumber,
    parseNonNegativeNumber,
    parseDateString,
    parseNonEmptyString,
} = require("../middleware/validate");

const createListing = asyncHandler(async (req, res) => {
    let provider_id;
    if (req.user) {
        provider_id = resolveVerifiedProviderId(req);
    } else {
        provider_id = parsePositiveInt(
            req.body.provider_id ?? req.params.providerId,
            "provider_id"
        );
    }
    const route_id = parsePositiveInt(req.body.route_id, "route_id");
    const departure_date = parseDateString(req.body.departure_date, "departure_date");
    const arrival_date = parseDateString(req.body.arrival_date, "arrival_date");
    const cutoff_date = parseDateString(req.body.cutoff_date, "cutoff_date");
    const total_cbm = parsePositiveNumber(req.body.total_cbm, "total_cbm");
    const total_weight = parsePositiveNumber(req.body.total_weight, "total_weight");
    const price_per_cbm = parseNonNegativeNumber(req.body.price_per_cbm, "price_per_cbm");
    const price_per_tonne = parseNonNegativeNumber(req.body.price_per_tonne, "price_per_tonne");
    const minimum_charge = parseNonNegativeNumber(req.body.minimum_charge ?? 0, "minimum_charge");

    const rawCargoIds = req.body.cargo_type_ids ?? req.body.allowed_cargo_types;
    if (!Array.isArray(rawCargoIds) || rawCargoIds.length === 0) {
        throw new AppError(
            "cargo_type_ids must be a non-empty array of cargo type IDs",
            400,
            "VALIDATION_ERROR"
        );
    }
    const cargo_type_ids = rawCargoIds.map((id, idx) =>
        parsePositiveInt(id, `cargo_type_ids[${idx}]`)
    );

    const listing = await providerService.createListing({
        provider_id,
        route_id,
        departure_date,
        arrival_date,
        cutoff_date,
        total_cbm,
        total_weight,
        price_per_cbm,
        price_per_tonne,
        minimum_charge,
        cargo_type_ids,
    });

    res.status(201).json({
        success: true,
        message: "Capacity listing published successfully",
        data: listing,
    });
});

const getProviderListings = asyncHandler(async (req, res) => {
    let providerId;
    if (req.user) {
        providerId = resolveVerifiedProviderId(req);
    } else {
        providerId = parsePositiveInt(
            req.params.providerId ?? req.query.provider_id,
            "provider_id"
        );
    }
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;

    const listings = await providerService.getProviderListings(providerId, { status });
    res.json({
        success: true,
        count: listings.length,
        data: listings,
    });
});

const getListingById = asyncHandler(async (req, res) => {
    const listingId = parsePositiveInt(req.params.listingId, "listingId");
    const listing = await providerService.getListingById(listingId);

    res.json({
        success: true,
        data: listing,
    });
});

const getProviderBookings = asyncHandler(async (req, res) => {
    let providerId;
    if (req.user) {
        providerId = resolveVerifiedProviderId(req);
    } else {
        providerId = parsePositiveInt(
            req.params.providerId ?? req.query.provider_id,
            "provider_id"
        );
    }
    const listing_id = parseOptionalPositiveInt(
        req.params.listingId ?? req.query.listing_id,
        "listing_id"
    );
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;

    const bookings = await providerService.getProviderBookings(providerId, {
        listing_id,
        status,
    });

    res.json({
        success: true,
        count: bookings.length,
        data: bookings,
    });
});

const updateListingStatus = asyncHandler(async (req, res) => {
    const listingId = parsePositiveInt(req.params.listingId, "listingId");
    let providerId;
    if (req.user) {
        providerId = resolveVerifiedProviderId(req);
    } else {
        providerId = parsePositiveInt(
            req.body.provider_id ?? req.query.provider_id ?? req.params.providerId,
            "provider_id"
        );
    }
    const status = parseNonEmptyString(req.body.status, "status", 20).toLowerCase();

    const updated = await providerService.updateListingStatus({
        listingId,
        providerId,
        status,
    });

    res.json({
        success: true,
        message: `Listing status updated to "${status}"`,
        data: updated,
    });
});

const cancelBookingByProvider = asyncHandler(async (req, res) => {
    const bookingId = parsePositiveInt(req.params.bookingId, "bookingId");
    let providerId;
    if (req.user) {
        providerId = resolveVerifiedProviderId(req);
    } else {
        providerId = parsePositiveInt(
            req.body.provider_id ?? req.params.providerId ?? req.query.provider_id,
            "provider_id"
        );
    }
    const reason =
        req.body && req.body.reason
            ? String(req.body.reason).trim()
            : "Cancelled by logistics provider";

    const result = await providerService.cancelBookingByProvider({
        bookingId,
        providerId,
        reason,
    });

    res.json({
        success: true,
        message: "Booking cancelled by provider and listing capacity restored",
        data: result,
    });
});

function resolveVerifiedProviderId(req) {
    if (req.user) {
        if (req.user.role !== "provider" && req.user.role !== "admin") {
            throw new AppError(
                "Forbidden: This action requires a logistics provider or platform admin role",
                403,
                "FORBIDDEN_ROLE"
            );
        }
        const authProviderId = Number(req.user.id);
        const routeProviderId = req.params.providerId
            ? parsePositiveInt(req.params.providerId, "providerId")
            : (req.query?.provider_id ? parsePositiveInt(req.query.provider_id, "provider_id") : null);
        if (routeProviderId !== null && req.user.role !== "admin" && routeProviderId !== authProviderId) {
            throw new AppError(
                "Forbidden: Authenticated provider identity does not match requested route provider ID",
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }
        if (req.body && req.body.provider_id !== undefined && req.body.provider_id !== null && req.body.provider_id !== "") {
            const bodyProviderId = parsePositiveInt(req.body.provider_id, "body.provider_id");
            if (req.user.role !== "admin" && bodyProviderId !== authProviderId) {
                throw new AppError(
                    "Forbidden: request body provider_id conflicts with authenticated provider identity",
                    403,
                    "FORBIDDEN_OWNERSHIP"
                );
            }
        }
        if (req.user.role === "admin" && routeProviderId !== null) {
            return routeProviderId;
        }
        return authProviderId;
    }

    const rawAuthProviderId =
        req.params.providerId ??
        req.headers["x-provider-id"] ??
        req.headers["x-user-id"] ??
        req.query.provider_id;

    if (rawAuthProviderId === undefined || rawAuthProviderId === null || rawAuthProviderId === "") {
        if (req.body && req.body.provider_id !== undefined && req.body.provider_id !== null) {
            throw new AppError(
                "Forbidden: provider_id in request body is not accepted as proof of ownership. Supply provider identity via route parameter (:providerId) or x-provider-id header.",
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }
        throw new AppError(
            "provider_id is required via route parameter (:providerId) or x-provider-id header",
            400,
            "VALIDATION_ERROR"
        );
    }

    const authProviderId = parsePositiveInt(rawAuthProviderId, "provider_id");

    if (
        req.body &&
        req.body.provider_id !== undefined &&
        req.body.provider_id !== null &&
        req.body.provider_id !== ""
    ) {
        const bodyProviderId = parsePositiveInt(req.body.provider_id, "body.provider_id");
        if (bodyProviderId !== authProviderId) {
            throw new AppError(
                "Forbidden: request body provider_id conflicts with authenticated provider identity",
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }
    }

    return authProviderId;
}

const getListingPricing = asyncHandler(async (req, res) => {
    const listingId = parsePositiveInt(req.params.listingId, "listingId");
    const providerId = parseOptionalPositiveInt(
        req.params.providerId ?? req.headers["x-provider-id"] ?? req.query.provider_id,
        "provider_id"
    );

    const data = await providerService.getListingPricing(listingId, { providerId });

    res.json({
        success: true,
        data,
    });
});

const upsertListingPricing = asyncHandler(async (req, res) => {
    const listingId = parsePositiveInt(req.params.listingId, "listingId");
    const providerId = resolveVerifiedProviderId(req);

    const body = req.body || {};
    const pricingRule = body.pricing_rule ?? body.pricingRule;
    const chargeItems =
        body.charge_items ??
        body.chargeItems ??
        (Array.isArray(body.charges) ? body.charges : undefined);

    const data = await providerService.upsertListingPricing({
        listingId,
        providerId,
        pricingRule,
        chargeItems,
    });

    res.json({
        success: true,
        message: "Listing pricing rules and charge items saved successfully",
        data,
    });
});

const getListingSchedule = asyncHandler(async (req, res) => {
    const listingId = parsePositiveInt(req.params.listingId, "listingId");
    const providerId = parseOptionalPositiveInt(
        req.params.providerId ?? req.headers["x-provider-id"] ?? req.query.provider_id,
        "provider_id"
    );

    const data = await providerService.getListingSchedule(listingId, { providerId });

    res.json({
        success: true,
        data,
    });
});

const upsertListingSchedule = asyncHandler(async (req, res) => {
    const listingId = parsePositiveInt(req.params.listingId, "listingId");
    const providerId = resolveVerifiedProviderId(req);

    const body = req.body || {};
    const schedulePolicy =
        body.schedule_policy ??
        body.schedulePolicy ??
        (body.doc_cutoff_at || body.etd_at ? body : undefined);
    const milestoneTemplates =
        body.milestone_templates ??
        body.milestoneTemplates ??
        body.milestones ??
        undefined;
    const reason = body.reason ?? body.date_change_reason ?? schedulePolicy?.reason ?? null;

    const data = await providerService.upsertListingSchedule({
        listingId,
        providerId,
        schedulePolicy,
        milestoneTemplates,
        reason,
    });

    res.json({
        success: true,
        message: "Listing schedule policy and milestone templates saved successfully",
        data,
    });
});

const recordBookingRolloverDecision = asyncHandler(async (req, res) => {
    const bookingId = parsePositiveInt(req.params.bookingId, "bookingId");
    let providerId;
    if (req.user) {
        providerId = resolveVerifiedProviderId(req);
    } else {
        providerId = parsePositiveInt(
            req.params.providerId ??
                req.headers["x-provider-id"] ??
                req.headers["x-user-id"] ??
                req.body?.provider_id ??
                req.query?.provider_id,
            "provider_id"
        );
    }
    const body = req.body || {};
    const missedMilestoneId = parseOptionalPositiveInt(
        body.missed_milestone_id ?? body.missedMilestoneId,
        "missed_milestone_id"
    );
    const rolloverTargetListingId = parseOptionalPositiveInt(
        body.rollover_target_listing_id ?? body.rolloverTargetListingId,
        "rollover_target_listing_id"
    );

    const data = await providerService.recordBookingRolloverDecision({
        bookingId,
        providerId,
        missedMilestoneId,
        operatorDecision: body.operator_decision ?? body.operatorDecision ?? body.decision,
        rolloverFeeAmount: body.rollover_fee_amount ?? body.rolloverFeeAmount ?? 0,
        currency: body.currency ?? "USD",
        newDocCutoffAt: body.new_doc_cutoff_at ?? body.newDocCutoffAt ?? null,
        newCfsGateInAt: body.new_cfs_gate_in_at ?? body.newCfsGateInAt ?? null,
        newEtdAt: body.new_etd_at ?? body.newEtdAt ?? null,
        newEtaAt: body.new_eta_at ?? body.newEtaAt ?? null,
        rolloverTargetListingId,
        decisionReason: body.decision_reason ?? body.decisionReason ?? body.reason,
        outcomeNotes: body.outcome_notes ?? body.outcomeNotes ?? null,
    });

    res.status(201).json({
        success: true,
        message: "Booking rollover / missed cut-off decision recorded",
        data,
    });
});

module.exports = {
    createListing,
    getProviderListings,
    getListingById,
    getProviderBookings,
    updateListingStatus,
    cancelBookingByProvider,
    getListingPricing,
    upsertListingPricing,
    getListingSchedule,
    upsertListingSchedule,
    recordBookingRolloverDecision,
};
