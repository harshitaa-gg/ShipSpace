const pool = require("../config/db");
const { AppError } = require("../middleware/errorHandler");

async function getPlatformSummary() {
    const { rows } = await pool.query(`SELECT * FROM v_admin_platform_summary`);
    return rows[0] || {};
}

async function getCapacityOverview({ origin_un_locode = null, destination_un_locode = null } = {}) {
    const params = [];
    const clauses = [];

    if (origin_un_locode) {
        params.push(`${origin_un_locode} -> %`);
        clauses.push(`route_code LIKE $${params.length}`);
    }
    if (destination_un_locode) {
        params.push(`% -> ${destination_un_locode}`);
        clauses.push(`route_code LIKE $${params.length}`);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const { rows } = await pool.query(
        `SELECT *
         FROM v_admin_capacity_overview
         ${whereSql}
         ORDER BY total_active_bookings DESC, route_code ASC`,
        params
    );
    return rows;
}

async function getProviderUtilization({ provider_id = null } = {}) {
    const params = [];
    let whereSql = "";
    if (provider_id !== null) {
        params.push(provider_id);
        whereSql = `WHERE provider_id = $1`;
    }

    const { rows } = await pool.query(
        `SELECT *
         FROM v_provider_listing_utilization
         ${whereSql}
         ORDER BY provider_id ASC, departure_date ASC, listing_id ASC`,
        params
    );
    return rows;
}

async function getUsers({ role = null } = {}) {
    const params = [];
    let whereSql = "";

    if (role) {
        const validRoles = ["provider", "trader", "admin"];
        if (!validRoles.includes(role)) {
            throw new AppError(
                `Invalid role filter "${role}". Allowed roles: ${validRoles.join(", ")}`,
                400,
                "VALIDATION_ERROR"
            );
        }
        params.push(role);
        whereSql = `WHERE u.role = $1`;
    }

    const { rows } = await pool.query(
        `SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            COALESCE(p.company_name, t.company_name) AS company_name,
            COALESCE(p.gst_tax_id, t.gst_tax_id) AS gst_tax_id,
            COALESCE(p.contact_phone, t.contact_phone) AS contact_phone,
            u.created_at,
            u.updated_at
         FROM user_account u
         LEFT JOIN provider p ON u.id = p.id AND u.role = 'provider'
         LEFT JOIN trader t ON u.id = t.id AND u.role = 'trader'
         LEFT JOIN admin a ON u.id = a.id AND u.role = 'admin'
         ${whereSql}
         ORDER BY u.id ASC`,
        params
    );
    return rows;
}

async function getAllBookings({ status = null, provider_id = null, trader_id = null, route_id = null } = {}) {
    const params = [];
    const clauses = [];

    if (status) {
        params.push(status);
        clauses.push(`booking_status = $${params.length}`);
    }
    if (provider_id !== null) {
        params.push(provider_id);
        clauses.push(`provider_id = $${params.length}`);
    }
    if (trader_id !== null) {
        params.push(trader_id);
        clauses.push(`trader_id = $${params.length}`);
    }
    if (route_id !== null) {
        params.push(route_id);
        clauses.push(`route_id = $${params.length}`);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const { rows } = await pool.query(
        `SELECT *
         FROM v_trader_bookings
         ${whereSql}
         ORDER BY booking_time DESC, booking_id DESC`,
        params
    );
    return rows;
}

async function getBookingAuditHistory({ booking_id = null } = {}) {
    const params = [];
    let whereSql = "";

    if (booking_id !== null) {
        const bkCheck = await pool.query(`SELECT id FROM booking WHERE id = $1`, [booking_id]);
        if (bkCheck.rowCount === 0) {
            throw new AppError(`Booking ID ${booking_id} does not exist`, 404, "BOOKING_NOT_FOUND");
        }
        params.push(booking_id);
        whereSql = `WHERE h.booking_id = $1`;
    }

    const { rows } = await pool.query(
        `SELECT
            h.id AS history_id,
            h.booking_id,
            b.listing_id,
            b.trader_id,
            t.company_name AS trader_company_name,
            h.changed_by_user_id,
            u.name AS changed_by_name,
            u.email AS changed_by_email,
            u.role AS changed_by_role,
            h.old_status,
            h.new_status,
            h.changed_at,
            h.reason
         FROM booking_status_history h
         JOIN booking b ON h.booking_id = b.id
         JOIN trader t ON b.trader_id = t.id
         JOIN user_account u ON h.changed_by_user_id = u.id
         ${whereSql}
         ORDER BY h.changed_at DESC, h.id DESC`,
        params
    );
    return rows;
}

module.exports = {
    getPlatformSummary,
    getCapacityOverview,
    getProviderUtilization,
    getUsers,
    getAllBookings,
    getBookingAuditHistory,
};
