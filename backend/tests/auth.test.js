const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const app = require("../src/app");
const pool = require("../src/config/db");
const { getValidatedJwtSecret } = require("../src/middleware/auth");

let server;
let baseUrl;

async function apiRequest(endpoint, { method = "GET", headers = {}, body = undefined } = {}) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, body: json };
}

test.before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
});

test("Auth 1: Valid login with demo account succeeds, returns signed JWT, and upgrades hash to bcrypt", async () => {
    const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
            email: "shipping@aaravtextiles.in",
            password: "demopass123",
        },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token, "Expected signed JWT token in response");
    assert.equal(res.body.data.user.email, "shipping@aaravtextiles.in");
    assert.equal(res.body.data.user.role, "trader");

    // Verify database hash was upgraded to bcrypt ($2a$ or $2b$)
    const dbRes = await pool.query(
        "SELECT password_hash FROM user_account WHERE email = $1",
        ["shipping@aaravtextiles.in"]
    );
    const hash = dbRes.rows[0].password_hash;
    assert.ok(
        hash.startsWith("$2a$") || hash.startsWith("$2b$"),
        `Expected bcrypt hash format, found: ${hash}`
    );
});

test("Auth 2: Invalid password returns 401 INVALID_CREDENTIALS", async () => {
    const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
            email: "shipping@aaravtextiles.in",
            password: "wrong_password_999",
        },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
});

test("Auth 3: Missing email or password returns 400 VALIDATION_ERROR", async () => {
    const noEmail = await apiRequest("/api/auth/login", {
        method: "POST",
        body: { password: "some_password" },
    });
    assert.equal(noEmail.status, 400);
    assert.equal(noEmail.body.error.code, "VALIDATION_ERROR");

    const noPass = await apiRequest("/api/auth/login", {
        method: "POST",
        body: { email: "test@example.com" },
    });
    assert.equal(noPass.status, 400);
    assert.equal(noPass.body.error.code, "VALIDATION_ERROR");
});

test("Auth 4: Registration rejects missing or short passwords without substitution", async () => {
    const missingPass = await apiRequest("/api/auth/register", {
        method: "POST",
        body: {
            name: "Test No Pass",
            email: `nopass_${Date.now()}@test.in`,
            role: "trader",
            company_name: "Test Corp",
        },
    });
    assert.equal(missingPass.status, 400);
    assert.equal(missingPass.body.error.code, "VALIDATION_ERROR");
    assert.match(missingPass.body.message, /password is required/i);

    const shortPass = await apiRequest("/api/auth/register", {
        method: "POST",
        body: {
            name: "Test Short Pass",
            email: `shortpass_${Date.now()}@test.in`,
            password: "short",
            role: "trader",
            company_name: "Test Corp",
        },
    });
    assert.equal(shortPass.status, 400);
    assert.equal(shortPass.body.error.code, "VALIDATION_ERROR");
    assert.match(shortPass.body.message, /at least 8 characters/i);
});

test("Auth 5: Unauthenticated access to admin endpoints returns 401 AUTHENTICATION_REQUIRED", async () => {
    const resUsers = await apiRequest("/api/admin/users");
    assert.equal(resUsers.status, 401);
    assert.equal(resUsers.body.error.code, "AUTHENTICATION_REQUIRED");

    const resSummary = await apiRequest("/api/admin/summary");
    assert.equal(resSummary.status, 401);
    assert.equal(resSummary.body.error.code, "AUTHENTICATION_REQUIRED");
});

test("Auth 6: Invalid Bearer token returns 401 INVALID_TOKEN", async () => {
    const res = await apiRequest("/api/admin/users", {
        headers: {
            Authorization: "Bearer invalid.jwt.token",
        },
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "INVALID_TOKEN");
});

test("Auth 7: Role violations return 403 FORBIDDEN_ROLE", async () => {
    // 1. Authenticate as Trader #7
    const traderLogin = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
            email: "shipping@aaravtextiles.in",
            password: "demopass123",
        },
    });
    const traderToken = traderLogin.body.data.token;

    // 2. Trader attempts to access Admin endpoint -> 403 FORBIDDEN_ROLE
    const adminAccess = await apiRequest("/api/admin/users", {
        headers: {
            Authorization: `Bearer ${traderToken}`,
        },
    });
    assert.equal(adminAccess.status, 403);
    assert.equal(adminAccess.body.error.code, "FORBIDDEN_ROLE");

    // 3. Trader attempts to call Provider create listing -> 403 FORBIDDEN_ROLE
    const providerAccess = await apiRequest("/api/provider/listings", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${traderToken}`,
        },
        body: {
            route_id: 1,
            departure_date: "2027-01-01",
            arrival_date: "2027-01-10",
            cutoff_date: "2026-12-25",
            total_cbm: 50,
            total_weight: 40,
            price_per_cbm: 100,
            price_per_tonne: 90,
            cargo_type_ids: [1],
        },
    });
    assert.equal(providerAccess.status, 403);
    assert.equal(providerAccess.body.error.code, "FORBIDDEN_ROLE");
});

test("Auth 8: Cross-user access returns 403 FORBIDDEN_OWNERSHIP", async () => {
    // 1. Log in as Provider #1 (Maersk)
    const prov1Login = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
            email: "ops.india@maersk-lcl.com",
            password: "demopass123",
        },
    });
    assert.equal(prov1Login.status, 200);
    const prov1Token = prov1Login.body.data.token;

    // 2. Find a listing belonging to another provider (e.g. Provider #2 MSC)
    const otherListingRes = await pool.query(
        `SELECT id, provider_id FROM capacity_listing WHERE provider_id <> 1 AND status = 'open' LIMIT 1`
    );
    assert.ok(otherListingRes.rowCount > 0);
    const otherListing = otherListingRes.rows[0];

    // 3. Provider #1 attempts to update status of Provider #2's listing -> 403 FORBIDDEN_OWNERSHIP
    const tamperRes = await apiRequest(
        `/api/provider/listings/${otherListing.id}/status`,
        {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${prov1Token}`,
            },
            body: {
                status: "closed",
            },
        }
    );
    assert.equal(tamperRes.status, 403);
    assert.equal(tamperRes.body.error.code, "FORBIDDEN_OWNERSHIP");
});

test("Auth 9: Authenticated admin can access administrative endpoints", async () => {
    // Log in as Superadmin #27
    const adminLogin = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
            email: "superadmin@shipspace.internal",
            password: "demopass123",
        },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.body.data.token;

    // Call /api/admin/summary with admin token
    const summaryRes = await apiRequest("/api/admin/summary", {
        headers: {
            Authorization: `Bearer ${adminToken}`,
        },
    });
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.success, true);
    assert.ok(summaryRes.body.data.total_providers_count >= 1);
});

test("Auth 10: GET /api/auth/me returns verified user profile", async () => {
    const loginRes = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
            email: "shipping@aaravtextiles.in",
            password: "demopass123",
        },
    });
    const token = loginRes.body.data.token;

    const meRes = await apiRequest("/api/auth/me", {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.success, true);
    assert.equal(meRes.body.data.email, "shipping@aaravtextiles.in");
    assert.equal(meRes.body.data.role, "trader");
});

test("Auth 11: Production JWT_SECRET fails safely if missing or using insecure placeholder", () => {
    // Missing secret in production
    assert.throws(
        () => getValidatedJwtSecret({ NODE_ENV: "production", JWT_SECRET: "" }),
        /FATAL \[Security\]: In production mode/
    );

    // Development fallback placeholder in production
    assert.throws(
        () =>
            getValidatedJwtSecret({
                NODE_ENV: "production",
                JWT_SECRET: "shipspace_jwt_fallback_secret_never_use_in_prod",
            }),
        /known development placeholders/
    );

    // Short secret (< 32 chars) in production
    assert.throws(
        () =>
            getValidatedJwtSecret({
                NODE_ENV: "production",
                JWT_SECRET: "too_short_secret_value",
            }),
        /at least 32 characters/
    );

    // Valid 32+ character production secret passes
    const validSecret = "a_super_strong_production_jwt_signing_key_at_least_32_characters";
    const resolved = getValidatedJwtSecret({
        NODE_ENV: "production",
        JWT_SECRET: validSecret,
    });
    assert.equal(resolved, validSecret);
});

test("Auth 12: Cross-user timeline access is rejected (Trader #8 cannot view Trader #7's booking timeline)", async () => {
    // Log in as Trader #8 (Bharat Auto)
    const trader8Login = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
            email: "logistics@bharatauto.com",
            password: "demopass123",
        },
    });
    assert.equal(trader8Login.status, 200);
    const trader8Token = trader8Login.body.data.token;

    // Find a booking belonging to Trader #7
    const trader7BookingRes = await pool.query(
        "SELECT id FROM booking WHERE trader_id = 7 LIMIT 1"
    );
    assert.ok(trader7BookingRes.rowCount > 0);
    const bookingId = trader7BookingRes.rows[0].id;

    // Trader #8 attempts to view Trader #7's timeline -> 403 FORBIDDEN_OWNERSHIP
    const timelineRes = await apiRequest(`/api/bookings/${bookingId}/timeline`, {
        headers: {
            Authorization: `Bearer ${trader8Token}`,
        },
    });
    assert.equal(timelineRes.status, 403);
    assert.equal(timelineRes.body.error.code, "FORBIDDEN_OWNERSHIP");
});

test("Auth 13: Cross-user notifications access is rejected (Trader #8 cannot query Trader #7's notifications)", async () => {
    // Log in as Trader #8 (Bharat Auto)
    const trader8Login = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
            email: "logistics@bharatauto.com",
            password: "demopass123",
        },
    });
    assert.equal(trader8Login.status, 200);
    const trader8Token = trader8Login.body.data.token;

    // Trader #8 attempts to query notifications with ?user_id=7 -> 403 FORBIDDEN_OWNERSHIP
    const notifRes = await apiRequest("/api/notifications?user_id=7", {
        headers: {
            Authorization: `Bearer ${trader8Token}`,
        },
    });
    assert.equal(notifRes.status, 403);
    assert.equal(notifRes.body.error.code, "FORBIDDEN_OWNERSHIP");
});

test("Auth 14: Cross-provider access to recordBookingRolloverDecision and getProviderBookings is rejected", async () => {
    // Log in as Provider #1 (Maersk)
    const prov1Login = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
            email: "ops.india@maersk-lcl.com",
            password: "demopass123",
        },
    });
    assert.equal(prov1Login.status, 200);
    const prov1Token = prov1Login.body.data.token;

    // Provider #1 attempts to query Provider #2's private bookings -> 403 FORBIDDEN_OWNERSHIP
    const prov2Bookings = await apiRequest("/api/provider/2/bookings", {
        headers: {
            Authorization: `Bearer ${prov1Token}`,
        },
    });
    assert.equal(prov2Bookings.status, 403);
    assert.equal(prov2Bookings.body.error.code, "FORBIDDEN_OWNERSHIP");

    // Provider #1 attempts to perform rollover decision on Provider #2's listing booking -> 403 FORBIDDEN_OWNERSHIP
    const prov2BookingRes = await pool.query(
        `SELECT b.id FROM booking b
         JOIN capacity_listing l ON l.id = b.listing_id
         WHERE l.provider_id <> 1 LIMIT 1`
    );
    assert.ok(prov2BookingRes.rowCount > 0);
    const bookingId = prov2BookingRes.rows[0].id;

    const rolloverRes = await apiRequest(`/api/provider/bookings/${bookingId}/rollover`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${prov1Token}`,
        },
        body: {
            operator_decision: "roll",
            decision_reason: "Attempt unauthorized rollover across provider boundaries",
        },
    });
    assert.equal(rolloverRes.status, 403);
    assert.equal(rolloverRes.body.error.code, "FORBIDDEN_OWNERSHIP");
});
