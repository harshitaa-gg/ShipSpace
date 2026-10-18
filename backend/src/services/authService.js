const crypto = require("crypto");
const pool = require("../config/db");
const { AppError } = require("../middleware/errorHandler");

/**
 * Service to register a new user in PostgreSQL user_account and corresponding
 * subclass table (trader or provider) under transaction protection.
 */
async function registerUser({
    name,
    email,
    password,
    role,
    company_name,
    gst_tax_id,
    contact_phone,
}) {
    if (!name || !name.trim()) {
        throw new AppError("Full name is required", 400, "VALIDATION_ERROR");
    }
    if (!email || !email.trim()) {
        throw new AppError("Email is required", 400, "VALIDATION_ERROR");
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        throw new AppError("Please provide a valid commercial email address", 400, "VALIDATION_ERROR");
    }
    const cleanRole = String(role || "trader").trim().toLowerCase();
    if (!["trader", "provider"].includes(cleanRole)) {
        throw new AppError('Role must be either "trader" or "provider"', 400, "VALIDATION_ERROR");
    }
    if (!company_name || !company_name.trim()) {
        throw new AppError("Company name is required", 400, "VALIDATION_ERROR");
    }

    // Check email uniqueness in user_account
    const existing = await pool.query(
        "SELECT id, email FROM user_account WHERE LOWER(email) = $1",
        [cleanEmail]
    );
    if (existing.rowCount > 0) {
        throw new AppError(
            `An account with email "${cleanEmail}" is already registered in the system`,
            409,
            "DUPLICATE_EMAIL"
        );
    }

    // Hash password using sha256
    const passwordHash = crypto
        .createHash("sha256")
        .update(password || "shipspace_pass123")
        .digest("hex");

    const cleanCompany = company_name.trim();
    const cleanGst =
        gst_tax_id && gst_tax_id.trim()
            ? gst_tax_id.trim()
            : `27AAAC${Math.floor(1000 + Math.random() * 9000)}F1Z1`;
    const cleanPhone =
        contact_phone && contact_phone.trim()
            ? contact_phone.trim()
            : "+91-9876543210";

    return pool.withTransaction(async (client) => {
        const userRes = await client.query(
            `INSERT INTO user_account (name, email, password_hash, role)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, email, role, created_at`,
            [name.trim(), cleanEmail, passwordHash, cleanRole]
        );
        const newUser = userRes.rows[0];
        const newUserId = newUser.id;

        if (cleanRole === "trader") {
            await client.query(
                `INSERT INTO trader (id, role, company_name, gst_tax_id, contact_phone)
                 VALUES ($1, 'trader', $2, $3, $4)`,
                [newUserId, cleanCompany, cleanGst, cleanPhone]
            );
        } else if (cleanRole === "provider") {
            await client.query(
                `INSERT INTO provider (id, role, company_name, gst_tax_id, contact_phone)
                 VALUES ($1, 'provider', $2, $3, $4)`,
                [newUserId, cleanCompany, cleanGst, cleanPhone]
            );
        }

        return {
            id: Number(newUser.id),
            user_id: Number(newUser.id),
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            company_name: cleanCompany,
            gst_tax_id: cleanGst,
            contact_phone: cleanPhone,
            created_at: newUser.created_at,
        };
    });
}

module.exports = {
    registerUser,
};
