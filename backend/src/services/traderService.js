const pool = require("../config/db");
const { AppError } = require("../middleware/errorHandler");

async function getAvailableCapacity({ origin, destination, cargo_type, sort_by = "departure" } = {}) {
    const params = [];
    const clauses = [];

    if (origin) {
        params.push(String(origin).trim().toUpperCase());
        clauses.push(`origin_un_locode = $${params.length}`);
    }
    if (destination) {
        params.push(String(destination).trim().toUpperCase());
        clauses.push(`destination_un_locode = $${params.length}`);
    }
    if (cargo_type) {
        params.push(String(cargo_type).trim());
        clauses.push(`$${params.length} = ANY(permitted_cargo_types_array)`);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const orderBySql =
        sort_by === "price"
            ? "ORDER BY price_per_cbm ASC, departure_date ASC, listing_id ASC"
            : "ORDER BY departure_date ASC, price_per_cbm ASC, listing_id ASC";

    const { rows } = await pool.query(
        `SELECT *
         FROM v_trader_available_capacity
         ${whereSql}
         ${orderBySql}`,
        params
    );
    return rows;
}

/**
 * Executes the Phase 6A Multi-Constraint Matching Capacity Search:
 *  - Filters open listings where cutoff_date >= CURRENT_DATE
 *  - Enforces cutoff_date >= cargo_ready_date AND departure_date > cargo_ready_date
 *  - Enforces available_cbm >= required_cbm AND available_weight >= required_weight
 *  - Enforces permitted cargo type via listing_cargo
 *  - Computes estimated_total_price = GREATEST(ROUND(cbm * price_per_cbm, 2), ROUND(weight * price_per_tonne, 2), minimum_charge)
 *  - Supports Strategy A (sort_by = 'price') and Strategy B (sort_by = 'departure')
 */
async function searchMatchingCapacity({
    origin_un_locode = null,
    destination_un_locode = null,
    origin_port_id = null,
    destination_port_id = null,
    required_cbm,
    required_weight,
    cargo_type_id = null,
    cargo_type_name = null,
    cargo_ready_date = null,
    sort_by = "price",
}) {
    const params = [required_cbm, required_weight];
    const clauses = [
        `l.status = 'open'`,
        `l.cutoff_date >= CURRENT_DATE`,
        `l.available_cbm >= $1::numeric`,
        `l.available_weight >= $2::numeric`,
    ];

    if (origin_un_locode) {
        params.push(origin_un_locode);
        clauses.push(`orig.un_locode = $${params.length}`);
    } else if (origin_port_id) {
        params.push(origin_port_id);
        clauses.push(`orig.id = $${params.length}`);
    }

    if (destination_un_locode) {
        params.push(destination_un_locode);
        clauses.push(`dest.un_locode = $${params.length}`);
    } else if (destination_port_id) {
        params.push(destination_port_id);
        clauses.push(`dest.id = $${params.length}`);
    }

    if (cargo_type_id) {
        params.push(cargo_type_id);
        clauses.push(`ct.id = $${params.length}`);
    } else if (cargo_type_name) {
        params.push(cargo_type_name);
        clauses.push(`LOWER(ct.name) = LOWER($${params.length})`);
    }

    if (cargo_ready_date) {
        params.push(cargo_ready_date);
        const idx = params.length;
        clauses.push(`l.cutoff_date >= $${idx}::date`);
        clauses.push(`l.departure_date > $${idx}::date`);
    } else {
        clauses.push(`l.departure_date > CURRENT_DATE`);
    }

    const orderBySql =
        sort_by === "departure"
            ? "ORDER BY l.departure_date ASC, estimated_total_price ASC, l.id ASC"
            : "ORDER BY estimated_total_price ASC, l.departure_date ASC, l.id ASC";

    const { rows } = await pool.query(
        `SELECT
            l.id AS listing_id,
            l.provider_id,
            p.company_name AS provider_name,
            p.contact_phone AS provider_contact_phone,
            r.id AS route_id,
            orig.id AS origin_port_id,
            orig.name AS origin_port,
            orig.country AS origin_country,
            orig.un_locode AS origin_un_locode,
            dest.id AS destination_port_id,
            dest.name AS destination_port,
            dest.country AS destination_country,
            dest.un_locode AS destination_un_locode,
            orig.un_locode || ' -> ' || dest.un_locode AS route_code,
            r.typical_transit_days,
            l.cutoff_date,
            l.departure_date,
            l.arrival_date,
            l.available_cbm,
            l.available_weight,
            l.total_cbm,
            l.total_weight,
            l.price_per_cbm,
            l.price_per_tonne,
            l.minimum_charge,
            ct.id AS matched_cargo_type_id,
            ct.name AS matched_cargo_type_name,
            $1::numeric(10, 2) AS requested_cbm,
            $2::numeric(10, 2) AS requested_weight,
            GREATEST(
                ROUND($1::numeric * l.price_per_cbm, 2),
                ROUND($2::numeric * l.price_per_tonne, 2),
                l.minimum_charge
            ) AS estimated_total_price
         FROM capacity_listing l
         JOIN provider p ON l.provider_id = p.id
         JOIN route r ON l.route_id = r.id
         JOIN port orig ON r.origin_port_id = orig.id
         JOIN port dest ON r.destination_port_id = dest.id
         JOIN listing_cargo lc ON lc.listing_id = l.id
         JOIN cargo_type ct ON lc.cargo_type_id = ct.id
         WHERE ${clauses.join(" AND ")}
         ${orderBySql}`,
        params
    );

    return rows;
}

const pricingEngine = require("./pricingEngine");
const timelineService = require("./timelineService");

/**
 * Creates a booking transactionally using PostgreSQL stored procedure sp_create_booking,
 * preserving SELECT ... FOR UPDATE row locking, capacity checks, price snapshot calculation,
 * and booking_status_history audit logging inside the database engine, then freezes
 * itemised charge snapshots into booking_charge_snapshot and Feature B timeline/checklist/reminder
 * snapshots within the same transaction.
 */
async function createBooking({
    trader_id,
    listing_id,
    cargo_type_id,
    booked_cbm,
    booked_weight,
    transformSnapshots = null,
    asOfTimestamp = null,
}) {
    return pool.withTransaction(async (client) => {
        // Verify trader account exists (Rule R8)
        const traderCheck = await client.query(
            `SELECT id, company_name FROM trader WHERE id = $1`,
            [trader_id]
        );
        if (traderCheck.rowCount === 0) {
            throw new AppError(`Trader ID ${trader_id} does not exist`, 404, "TRADER_NOT_FOUND");
        }

        // 1. Delegate booking validation, row locking, base price calculation, capacity deduction & audit log to sp_create_booking
        const callRes = await client.query(
            `CALL sp_create_booking($1::bigint, $2::bigint, $3::bigint, $4::numeric, $5::numeric, NULL)`,
            [trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight]
        );
        const bookingId = callRes.rows[0]?.p_booking_id;

        // 2. Calculate quote and insert immutable booking_charge_snapshot rows within the same transaction
        await pricingEngine.createBookingChargeSnapshots(client, {
            bookingId,
            listingId: listing_id,
            bookedCbm: booked_cbm,
            bookedWeight: booked_weight,
            transformSnapshots,
        });

        // 3. Initialize Feature B booking milestone snapshots, reminders & export document checklist
        const timelineSnapshot = await timelineService.initializeBookingFeatureBSnapshots(
            client,
            {
                bookingId,
                listingId: listing_id,
                traderId: trader_id,
                asOfTimestamp,
            }
        );

        // 4. Read back the created booking, updated listing capacity, and frozen financial snapshot
        const bookingRes = await client.query(
            `SELECT * FROM v_trader_bookings WHERE booking_id = $1`,
            [bookingId]
        );
        const listingRes = await client.query(
            `SELECT id AS listing_id, status AS listing_status, available_cbm, total_cbm, available_weight, total_weight, updated_at
             FROM capacity_listing
             WHERE id = $1`,
            [listing_id]
        );
        const financialSnapshot = await pricingEngine.getBookingFinancialSnapshot(
            bookingId,
            client
        );

        const enrichedBooking = {
            ...bookingRes.rows[0],
            is_legacy_booking: financialSnapshot.is_legacy_booking,
            itemised_cost_summary: financialSnapshot.summary,
            charge_snapshots: financialSnapshot.snapshots,
            has_timeline_snapshot: timelineSnapshot.has_timeline_snapshot,
            milestones: timelineSnapshot.milestones,
            document_checklist: timelineSnapshot.document_checklist,
            reminders: timelineSnapshot.reminders,
        };

        return {
            booking: enrichedBooking,
            listing_capacity: listingRes.rows[0],
            is_legacy_booking: financialSnapshot.is_legacy_booking,
            itemised_cost_summary: financialSnapshot.summary,
            charge_snapshots: financialSnapshot.snapshots,
            has_timeline_snapshot: timelineSnapshot.has_timeline_snapshot,
            milestones: timelineSnapshot.milestones,
            document_checklist: timelineSnapshot.document_checklist,
            reminders: timelineSnapshot.reminders,
        };
    });
}

async function getTraderBookings(traderId, { status = null } = {}) {
    const traderCheck = await pool.query(`SELECT id, company_name FROM trader WHERE id = $1`, [traderId]);
    if (traderCheck.rowCount === 0) {
        throw new AppError(`Trader ID ${traderId} does not exist`, 404, "TRADER_NOT_FOUND");
    }

    const params = [traderId];
    let statusClause = "";
    if (status) {
        params.push(status);
        statusClause = `AND booking_status = $${params.length}`;
    }

    const { rows } = await pool.query(
        `SELECT *
         FROM v_trader_bookings
         WHERE trader_id = $1 ${statusClause}
         ORDER BY booking_time DESC, booking_id DESC`,
        params
    );
    return rows;
}

async function getBookingDetails(bookingId, { trader_id = null, provider_id = null } = {}) {
    const bookingRes = await pool.query(
        `SELECT * FROM v_trader_bookings WHERE booking_id = $1`,
        [bookingId]
    );
    if (bookingRes.rowCount === 0) {
        throw new AppError(`Booking ID ${bookingId} does not exist`, 404, "BOOKING_NOT_FOUND");
    }
    const booking = bookingRes.rows[0];

    if (trader_id !== null && Number(booking.trader_id) !== Number(trader_id)) {
        throw new AppError(
            `Forbidden (Rule R8): Booking ID ${bookingId} does not belong to Trader ID ${trader_id}`,
            403,
            "FORBIDDEN_OWNERSHIP"
        );
    }
    if (provider_id !== null && Number(booking.provider_id) !== Number(provider_id)) {
        throw new AppError(
            `Forbidden (Rule R8): Booking ID ${bookingId} is not on a listing owned by Provider ID ${provider_id}`,
            403,
            "FORBIDDEN_OWNERSHIP"
        );
    }

    const [historyRes, financialSnapshot, timeline] = await Promise.all([
        pool.query(
            `SELECT
                h.id AS history_id,
                h.booking_id,
                h.changed_by_user_id,
                u.name AS changed_by_name,
                u.email AS changed_by_email,
                u.role AS changed_by_role,
                h.old_status,
                h.new_status,
                h.changed_at,
                h.reason
             FROM booking_status_history h
             JOIN user_account u ON h.changed_by_user_id = u.id
             WHERE h.booking_id = $1
             ORDER BY h.changed_at ASC, h.id ASC`,
            [bookingId]
        ),
        pricingEngine.getBookingFinancialSnapshot(bookingId),
        timelineService.getBookingTimeline(bookingId, {
            traderId: trader_id,
            providerId: provider_id,
        }),
    ]);

    return {
        ...booking,
        is_legacy_booking: financialSnapshot.is_legacy_booking,
        itemised_cost_summary: financialSnapshot.summary,
        charge_snapshots: financialSnapshot.snapshots,
        status_history: historyRes.rows,
        has_timeline_snapshot: timeline.has_timeline_snapshot,
        schedule_policy: timeline.schedule_policy,
        milestones: timeline.milestones,
        date_change_history: timeline.date_change_history,
        reminders: timeline.reminders,
        document_checklist: timeline.document_checklist,
        rollover_events: timeline.rollover_events,
        timeline,
    };
}

/**
 * Cancels a booking transactionally using PostgreSQL stored procedure sp_cancel_booking,
 * which locks the booking and listing rows FOR UPDATE, restores exact CBM and weight,
 * reopens the listing if previously full, and logs the status transition.
 */
async function cancelBookingByTrader({ bookingId, traderId, reason }) {
    return pool.withTransaction(async (client) => {
        // Verify booking exists and belongs to traderId (Rule R8)
        const bkCheck = await client.query(
            `SELECT id, trader_id, listing_id FROM booking WHERE id = $1`,
            [bookingId]
        );
        if (bkCheck.rowCount === 0) {
            throw new AppError(`Booking ID ${bookingId} does not exist`, 404, "BOOKING_NOT_FOUND");
        }
        if (Number(bkCheck.rows[0].trader_id) !== Number(traderId)) {
            throw new AppError(
                `Forbidden (Rule R8): Trader ID ${traderId} can only cancel their own bookings`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }

        // Delegate cancellation, row locking, capacity restoration & history logging to PostgreSQL
        await client.query(`CALL sp_cancel_booking($1, $2, $3)`, [
            bookingId,
            traderId,
            reason || "Cancelled by trader",
        ]);

        const updatedBookingRes = await client.query(
            `SELECT * FROM v_trader_bookings WHERE booking_id = $1`,
            [bookingId]
        );
        const updatedListingRes = await client.query(
            `SELECT id AS listing_id, status AS listing_status, available_cbm, total_cbm, available_weight, total_weight, updated_at
             FROM capacity_listing
             WHERE id = $1`,
            [bkCheck.rows[0].listing_id]
        );
        const historyRes = await client.query(
            `SELECT id AS history_id, booking_id, changed_by_user_id, old_status, new_status, changed_at, reason
             FROM booking_status_history
             WHERE booking_id = $1
             ORDER BY changed_at ASC, id ASC`,
            [bookingId]
        );
        const financialSnapshot = await pricingEngine.getBookingFinancialSnapshot(
            bookingId,
            client
        );

        return {
            booking: {
                ...updatedBookingRes.rows[0],
                is_legacy_booking: financialSnapshot.is_legacy_booking,
                itemised_cost_summary: financialSnapshot.summary,
                charge_snapshots: financialSnapshot.snapshots,
            },
            listing_capacity: updatedListingRes.rows[0],
            status_history: historyRes.rows,
            is_legacy_booking: financialSnapshot.is_legacy_booking,
            itemised_cost_summary: financialSnapshot.summary,
            charge_snapshots: financialSnapshot.snapshots,
        };
    });
}

async function getTraderQuote({
    listingId,
    cbm,
    weight,
    excessStorageDays = 0,
    asOfDate = null,
}) {
    return pricingEngine.getTraderQuote({
        listingId,
        cbm,
        weight,
        excessStorageDays,
        asOfDate,
    });
}

module.exports = {
    getAvailableCapacity,
    searchMatchingCapacity,
    createBooking,
    getTraderBookings,
    getBookingDetails,
    cancelBookingByTrader,
    getTraderQuote,
    getBookingTimeline: timelineService.getBookingTimeline,
    updateBookingMilestone: timelineService.updateBookingMilestone,
    ensureBookingDocumentChecklist: timelineService.ensureBookingDocumentChecklist,
    uploadBookingDocument: timelineService.uploadBookingDocument,
    updateBookingDocumentChecklistItem: timelineService.updateBookingDocumentChecklistItem,
    getBookingDocumentDownload: timelineService.getBookingDocumentDownload,
    processDueReminders: timelineService.processDueReminders,
    getUserNotifications: timelineService.getUserNotifications,
    markNotificationRead: timelineService.markNotificationRead,
    markAllNotificationsRead: timelineService.markAllNotificationsRead,
};
