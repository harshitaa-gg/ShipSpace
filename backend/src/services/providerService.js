const pool = require("../config/db");
const { AppError } = require("../middleware/errorHandler");

async function fetchEnrichedListing(clientOrPool, listingId) {
    const { rows } = await clientOrPool.query(
        `SELECT
            v.*,
            COALESCE(
                json_agg(
                    json_build_object('id', ct.id, 'name', ct.name)
                    ORDER BY ct.name
                ) FILTER (WHERE ct.id IS NOT NULL),
                '[]'::json
            ) AS allowed_cargo_types
         FROM v_provider_listing_utilization v
         LEFT JOIN listing_cargo lc ON lc.listing_id = v.listing_id
         LEFT JOIN cargo_type ct ON ct.id = lc.cargo_type_id
         WHERE v.listing_id = $1
         GROUP BY
            v.listing_id, v.provider_id, v.provider_company_name, v.route_id,
            v.route_code, v.origin_port, v.destination_port, v.cutoff_date,
            v.departure_date, v.arrival_date, v.listing_status, v.total_cbm,
            v.available_cbm, v.booked_cbm, v.cbm_utilization_pct, v.total_weight,
            v.available_weight, v.booked_weight, v.weight_utilization_pct,
            v.price_per_cbm, v.price_per_tonne, v.minimum_charge,
            v.active_booking_count, v.confirmed_booking_count,
            v.completed_booking_count, v.cancelled_booking_count,
            v.total_active_revenue`,
        [listingId]
    );
    return rows[0] || null;
}

async function createListing({
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
}) {
    if (cutoff_date > departure_date) {
        throw new AppError(
            "cutoff_date must be on or before departure_date (Rule R7)",
            400,
            "VALIDATION_ERROR"
        );
    }
    if (departure_date >= arrival_date) {
        throw new AppError(
            "departure_date must be strictly before arrival_date (Rule R7)",
            400,
            "VALIDATION_ERROR"
        );
    }

    return pool.withTransaction(async (client) => {
        // 1. Verify provider exists
        const provRes = await client.query(
            `SELECT id, company_name FROM provider WHERE id = $1`,
            [provider_id]
        );
        if (provRes.rowCount === 0) {
            throw new AppError(`Provider ID ${provider_id} does not exist`, 404, "PROVIDER_NOT_FOUND");
        }

        // 2. Verify route exists
        const routeRes = await client.query(
            `SELECT id FROM route WHERE id = $1`,
            [route_id]
        );
        if (routeRes.rowCount === 0) {
            throw new AppError(`Route ID ${route_id} does not exist`, 404, "ROUTE_NOT_FOUND");
        }

        // 3. Verify all cargo_type_ids exist
        const uniqueCargoIds = [...new Set(cargo_type_ids)];
        const cargoRes = await client.query(
            `SELECT id FROM cargo_type WHERE id = ANY($1::bigint[])`,
            [uniqueCargoIds]
        );
        if (cargoRes.rowCount !== uniqueCargoIds.length) {
            throw new AppError(
                "One or more cargo_type_ids do not exist in cargo_type catalog",
                400,
                "INVALID_CARGO_TYPE"
            );
        }

        // 4. Insert capacity_listing with available = total and status = 'open'
        const insertRes = await client.query(
            `INSERT INTO capacity_listing (
                provider_id, route_id, departure_date, arrival_date, cutoff_date,
                total_cbm, available_cbm, total_weight, available_weight,
                price_per_cbm, price_per_tonne, minimum_charge, status
             ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $6, $7, $7,
                $8, $9, $10, 'open'
             ) RETURNING id`,
            [
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
            ]
        );
        const listingId = insertRes.rows[0].id;

        // 5. Insert allowed cargo types into listing_cargo
        for (const cargoTypeId of uniqueCargoIds) {
            await client.query(
                `INSERT INTO listing_cargo (listing_id, cargo_type_id) VALUES ($1, $2)`,
                [listingId, cargoTypeId]
            );
        }

        return fetchEnrichedListing(client, listingId);
    });
}

async function getProviderListings(providerId, { status = null } = {}) {
    const provCheck = await pool.query(`SELECT id, company_name FROM provider WHERE id = $1`, [providerId]);
    if (provCheck.rowCount === 0) {
        throw new AppError(`Provider ID ${providerId} does not exist`, 404, "PROVIDER_NOT_FOUND");
    }

    const params = [providerId];
    let statusClause = "";
    if (status) {
        params.push(status);
        statusClause = `AND v.listing_status = $${params.length}`;
    }

    const { rows } = await pool.query(
        `SELECT
            v.*,
            COALESCE(
                json_agg(
                    json_build_object('id', ct.id, 'name', ct.name)
                    ORDER BY ct.name
                ) FILTER (WHERE ct.id IS NOT NULL),
                '[]'::json
            ) AS allowed_cargo_types
         FROM v_provider_listing_utilization v
         LEFT JOIN listing_cargo lc ON lc.listing_id = v.listing_id
         LEFT JOIN cargo_type ct ON ct.id = lc.cargo_type_id
         WHERE v.provider_id = $1 ${statusClause}
         GROUP BY
            v.listing_id, v.provider_id, v.provider_company_name, v.route_id,
            v.route_code, v.origin_port, v.destination_port, v.cutoff_date,
            v.departure_date, v.arrival_date, v.listing_status, v.total_cbm,
            v.available_cbm, v.booked_cbm, v.cbm_utilization_pct, v.total_weight,
            v.available_weight, v.booked_weight, v.weight_utilization_pct,
            v.price_per_cbm, v.price_per_tonne, v.minimum_charge,
            v.active_booking_count, v.confirmed_booking_count,
            v.completed_booking_count, v.cancelled_booking_count,
            v.total_active_revenue
         ORDER BY v.departure_date ASC, v.listing_id DESC`,
        params
    );

    return rows;
}

async function getListingById(listingId) {
    const listing = await fetchEnrichedListing(pool, listingId);
    if (!listing) {
        throw new AppError(`Listing ID ${listingId} does not exist`, 404, "LISTING_NOT_FOUND");
    }
    return listing;
}

async function getProviderBookings(providerId, { listing_id = null, status = null } = {}) {
    const provCheck = await pool.query(`SELECT id FROM provider WHERE id = $1`, [providerId]);
    if (provCheck.rowCount === 0) {
        throw new AppError(`Provider ID ${providerId} does not exist`, 404, "PROVIDER_NOT_FOUND");
    }

    if (listing_id !== null) {
        const listCheck = await pool.query(
            `SELECT id, provider_id FROM capacity_listing WHERE id = $1`,
            [listing_id]
        );
        if (listCheck.rowCount === 0) {
            throw new AppError(`Listing ID ${listing_id} does not exist`, 404, "LISTING_NOT_FOUND");
        }
        if (Number(listCheck.rows[0].provider_id) !== Number(providerId)) {
            throw new AppError(
                `Forbidden (Rule R8): Listing ID ${listing_id} does not belong to Provider ID ${providerId}`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }
    }

    const params = [providerId];
    const clauses = [`provider_id = $1`];

    if (listing_id !== null) {
        params.push(listing_id);
        clauses.push(`listing_id = $${params.length}`);
    }
    if (status) {
        params.push(status);
        clauses.push(`booking_status = $${params.length}`);
    }

    const { rows } = await pool.query(
        `SELECT *
         FROM v_trader_bookings
         WHERE ${clauses.join(" AND ")}
         ORDER BY booking_time DESC, booking_id DESC`,
        params
    );
    return rows;
}

async function updateListingStatus({ listingId, providerId, status }) {
    const allowedStatuses = ["open", "closed", "cancelled"];
    if (!allowedStatuses.includes(status)) {
        throw new AppError(
            `Invalid status "${status}". Allowed provider status transitions: ${allowedStatuses.join(", ")}`,
            400,
            "VALIDATION_ERROR"
        );
    }

    return pool.withTransaction(async (client) => {
        const listRes = await client.query(
            `SELECT *, (cutoff_date < CURRENT_DATE) AS is_past_cutoff
             FROM capacity_listing
             WHERE id = $1
             FOR UPDATE`,
            [listingId]
        );
        if (listRes.rowCount === 0) {
            throw new AppError(`Listing ID ${listingId} does not exist`, 404, "LISTING_NOT_FOUND");
        }
        const listing = listRes.rows[0];

        if (Number(listing.provider_id) !== Number(providerId)) {
            throw new AppError(
                `Forbidden (Rule R8): Provider ID ${providerId} cannot modify Listing ID ${listingId}`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }

        if (listing.status === status) {
            throw new AppError(
                `Listing ID ${listingId} is already in status "${status}".`,
                409,
                "INVALID_STATUS_TRANSITION"
            );
        }

        if (listing.status === "cancelled") {
            throw new AppError(
                `Cannot change status of Listing ID ${listingId} from "cancelled" to "${status}". Cancelled listings are terminal and cannot be reopened or modified.`,
                409,
                "INVALID_STATUS_TRANSITION"
            );
        }

        if (status === "open") {
            const availCbm = Number(listing.available_cbm);
            const availWeight = Number(listing.available_weight);

            if (availCbm <= 0) {
                throw new AppError(
                    `Cannot reopen Listing ID ${listingId}: available CBM is ${availCbm.toFixed(2)} (must be greater than zero).`,
                    409,
                    "INSUFFICIENT_CAPACITY_TO_REOPEN"
                );
            }

            if (availWeight <= 0) {
                throw new AppError(
                    `Cannot reopen Listing ID ${listingId}: available weight is ${availWeight.toFixed(2)} tonnes (must be greater than zero).`,
                    409,
                    "INSUFFICIENT_CAPACITY_TO_REOPEN"
                );
            }

            if (listing.is_past_cutoff) {
                throw new AppError(
                    `Cannot reopen Listing ID ${listingId}: the booking cutoff date has already passed.`,
                    409,
                    "CUTOFF_DATE_PASSED"
                );
            }
        }

        if (status === "cancelled") {
            const bookingCountsRes = await client.query(
                `SELECT
                     COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_cnt,
                     COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_cnt
                 FROM booking
                 WHERE listing_id = $1`,
                [listingId]
            );
            const { confirmed_cnt: confirmedCnt, completed_cnt: completedCnt } =
                bookingCountsRes.rows[0];

            if (confirmedCnt > 0 && completedCnt > 0) {
                throw new AppError(
                    `Cannot cancel Listing ID ${listingId} while it has ${confirmedCnt} confirmed and ${completedCnt} completed booking(s).`,
                    409,
                    "ACTIVE_OR_COMPLETED_BOOKINGS_EXIST"
                );
            }

            if (confirmedCnt > 0) {
                throw new AppError(
                    `Cannot cancel Listing ID ${listingId} while it has ${confirmedCnt} active confirmed booking(s). Cancel active bookings first.`,
                    409,
                    "ACTIVE_BOOKINGS_EXIST"
                );
            }

            if (completedCnt > 0) {
                throw new AppError(
                    `Cannot cancel Listing ID ${listingId} because it has ${completedCnt} completed booking(s) that have already been fulfilled.`,
                    409,
                    "COMPLETED_BOOKINGS_EXIST"
                );
            }
        }

        await client.query(
            `UPDATE capacity_listing
             SET status = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [status, listingId]
        );

        return fetchEnrichedListing(client, listingId);
    });
}

async function cancelBookingByProvider({ bookingId, providerId, reason }) {
    return pool.withTransaction(async (client) => {
        // Verify booking exists and belongs to a listing owned by providerId (Rule R8)
        const bkCheck = await client.query(
            `SELECT b.id, b.listing_id, l.provider_id
             FROM booking b
             JOIN capacity_listing l ON b.listing_id = l.id
             WHERE b.id = $1`,
            [bookingId]
        );
        if (bkCheck.rowCount === 0) {
            throw new AppError(`Booking ID ${bookingId} does not exist`, 404, "BOOKING_NOT_FOUND");
        }
        if (Number(bkCheck.rows[0].provider_id) !== Number(providerId)) {
            throw new AppError(
                `Forbidden (Rule R8): Booking ID ${bookingId} is not on a listing owned by Provider ID ${providerId}`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }

        // Delegate cancellation, row locking, capacity restoration & history logging to PostgreSQL
        await client.query(`CALL sp_cancel_booking($1, $2, $3)`, [
            bookingId,
            providerId,
            reason || "Cancelled by logistics provider",
        ]);

        const updatedBookingRes = await client.query(
            `SELECT * FROM v_trader_bookings WHERE booking_id = $1`,
            [bookingId]
        );
        const updatedListing = await fetchEnrichedListing(client, bkCheck.rows[0].listing_id);

        return {
            booking: updatedBookingRes.rows[0],
            listing: updatedListing,
        };
    });
}

module.exports = {
    createListing,
    getProviderListings,
    getListingById,
    getProviderBookings,
    updateListingStatus,
    cancelBookingByProvider,
};
