const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const app = require("../src/app");
const pool = require("../src/config/db");

let server;
let baseUrl;
let originalListing42;
const listingOwners = new Map();

async function patchListingStatus(listingId, payload) {
    const res = await fetch(`${baseUrl}/api/provider/listings/${listingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const body = await res.json();
    return { status: res.status, body };
}

test.before(async () => {
    const rowsRes = await pool.query(
        `SELECT id, provider_id, status, updated_at
         FROM capacity_listing
         WHERE id IN (1, 2, 5, 6, 39, 42)`
    );
    for (const r of rowsRes.rows) {
        listingOwners.set(Number(r.id), Number(r.provider_id));
        if (Number(r.id) === 42) {
            originalListing42 = r;
        }
    }

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
    if (originalListing42) {
        await pool.query(
            `UPDATE capacity_listing SET status = $1, updated_at = $2 WHERE id = 42`,
            [originalListing42.status, originalListing42.updated_at]
        );
    }
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
});

test("1. Reopening a listing with zero available weight returns 409 Conflict", async () => {
    // Listing #2: available_cbm = 20.00, available_weight = 0.00, status = 'full'
    const { status, body } = await patchListingStatus(2, {
        provider_id: listingOwners.get(2),
        status: "open",
    });

    assert.equal(status, 409);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "INSUFFICIENT_CAPACITY_TO_REOPEN");
    assert.match(body.error.message, /available weight is 0\.00/i);
});

test("2. Reopening a listing with zero available CBM returns 409 Conflict", async () => {
    // Listing #1: available_cbm = 0.00, available_weight = 9.00, status = 'full'
    const { status, body } = await patchListingStatus(1, {
        provider_id: listingOwners.get(1),
        status: "open",
    });

    assert.equal(status, 409);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "INSUFFICIENT_CAPACITY_TO_REOPEN");
    assert.match(body.error.message, /available CBM is 0\.00/i);
});

test("3. Reopening a listing after its cutoff date returns 409 Conflict", async () => {
    // Listing #6: status = 'closed', available_cbm = 20.00, available_weight = 11.00, cutoff_date = 2026-10-08 (past)
    const { status, body } = await patchListingStatus(6, {
        provider_id: listingOwners.get(6),
        status: "open",
    });

    assert.equal(status, 409);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "CUTOFF_DATE_PASSED");
    assert.match(body.error.message, /cutoff date has already passed/i);
});

test("4. Reopening a valid closed listing with remaining CBM, weight, and valid cutoff date succeeds", async () => {
    // Listing #42: available_cbm = 36.00, available_weight = 18.00, cutoff_date = 2026-10-23 (valid)
    const owner42 = listingOwners.get(42);
    const closeRes = await patchListingStatus(42, {
        provider_id: owner42,
        status: "closed",
    });
    assert.equal(closeRes.status, 200);
    assert.equal(closeRes.body.data.listing_status, "closed");

    const reopenRes = await patchListingStatus(42, {
        provider_id: owner42,
        status: "open",
    });
    assert.equal(reopenRes.status, 200);
    assert.equal(reopenRes.body.success, true);
    assert.equal(reopenRes.body.data.listing_status, "open");
});

test("5. Cancelling a listing with confirmed bookings returns 409 Conflict", async () => {
    // Listing #1 has 3 confirmed bookings
    const { status, body } = await patchListingStatus(1, {
        provider_id: listingOwners.get(1),
        status: "cancelled",
    });

    assert.equal(status, 409);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "ACTIVE_BOOKINGS_EXIST");
    assert.match(body.error.message, /active confirmed booking/i);
});

test("6. Cancelling a listing with completed bookings returns 409 Conflict", async () => {
    // Listing #5 has 2 completed bookings and 0 confirmed bookings
    const { status, body } = await patchListingStatus(5, {
        provider_id: listingOwners.get(5),
        status: "cancelled",
    });

    assert.equal(status, 409);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "COMPLETED_BOOKINGS_EXIST");
    assert.match(body.error.message, /completed booking/i);
});

test("7. Concurrent or stale status-change requests are handled safely via row locking", async () => {
    const owner42 = listingOwners.get(42);

    // 7a. Stale transition: Listing #42 is already 'open'
    const staleOpen = await patchListingStatus(42, {
        provider_id: owner42,
        status: "open",
    });
    assert.equal(staleOpen.status, 409);
    assert.equal(staleOpen.body.error.code, "INVALID_STATUS_TRANSITION");

    // 7b. Terminal transition: Listing #39 is 'cancelled'
    const reopenCancelled = await patchListingStatus(39, {
        provider_id: listingOwners.get(39),
        status: "open",
    });
    assert.equal(reopenCancelled.status, 409);
    assert.equal(reopenCancelled.body.error.code, "INVALID_STATUS_TRANSITION");

    // 7c. Concurrent duplicate status-change requests serialized by SELECT ... FOR UPDATE
    const [resA, resB] = await Promise.all([
        patchListingStatus(42, { provider_id: owner42, status: "closed" }),
        patchListingStatus(42, { provider_id: owner42, status: "closed" }),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409]);

    const conflictRes = resA.status === 409 ? resA : resB;
    assert.equal(conflictRes.body.error.code, "INVALID_STATUS_TRANSITION");

    // Restore Listing #42 to 'open'
    const restoreRes = await patchListingStatus(42, {
        provider_id: owner42,
        status: "open",
    });
    assert.equal(restoreRes.status, 200);
});

test("8. ProviderDashboardPage.jsx displays the correct action buttons for each listing state", async () => {
    const dashboardPath = path.resolve(
        __dirname,
        "../../frontend/src/pages/ProviderDashboardPage.jsx"
    );
    const source = fs.readFileSync(dashboardPath, "utf8");

    const helperMatch = source.match(
        /export function isListingCutoffValid[\s\S]*?export function getListingStatusActions[\s\S]*?\n\}/
    );
    assert.ok(helperMatch, "Expected exported status action helpers in ProviderDashboardPage.jsx");

    const executableHelpers =
        helperMatch[0].replace(/export function /g, "function ") +
        "\nreturn { isListingCutoffValid, getListingStatusActions };";
    const { getListingStatusActions } = new Function(executableHelpers)();

    const refNow = new Date(2026, 9, 18, 12, 0, 0); // 2026-10-18 local time

    // Case A: Closed listing with positive CBM, positive weight, and valid future cutoff -> canReopen = true
    const validClosed = getListingStatusActions(
        {
            status: "closed",
            available_cbm: "20.00",
            available_weight: "11.00",
            cutoff_date: "2026-10-25",
            active_booking_count: 1,
        },
        refNow
    );
    assert.equal(validClosed.canReopen, true);
    assert.equal(validClosed.canClose, false);
    assert.equal(validClosed.canCancel, false);

    // Case B: Listing with zero available weight -> canReopen = false
    const zeroWeight = getListingStatusActions(
        {
            status: "full",
            available_cbm: "20.00",
            available_weight: "0.00",
            cutoff_date: "2026-10-30",
            active_booking_count: 2,
        },
        refNow
    );
    assert.equal(zeroWeight.canReopen, false);
    assert.equal(zeroWeight.canClose, false);
    assert.equal(zeroWeight.canCancel, false);

    // Case C: Listing with zero available CBM -> canReopen = false
    const zeroCbm = getListingStatusActions(
        {
            status: "full",
            available_cbm: "0.00",
            available_weight: "9.00",
            cutoff_date: "2026-10-25",
            active_booking_count: 3,
        },
        refNow
    );
    assert.equal(zeroCbm.canReopen, false);

    // Case D: Closed listing after its cutoff date -> canReopen = false
    const pastCutoff = getListingStatusActions(
        {
            status: "closed",
            available_cbm: "20.00",
            available_weight: "11.00",
            cutoff_date: "2026-10-08",
            active_booking_count: 1,
        },
        refNow
    );
    assert.equal(pastCutoff.canReopen, false);

    // Case E: Cancelled listing with remaining CBM/weight and valid cutoff -> canReopen = false, canCancel = false
    const cancelledListing = getListingStatusActions(
        {
            status: "cancelled",
            available_cbm: "40.00",
            available_weight: "20.00",
            cutoff_date: "2026-10-28",
            active_booking_count: 0,
        },
        refNow
    );
    assert.equal(cancelledListing.canReopen, false);
    assert.equal(cancelledListing.canClose, false);
    assert.equal(cancelledListing.canCancel, false);

    // Case F: Open listing with 0 confirmed/completed bookings -> canClose = true, canCancel = true, canReopen = false
    const openNoBookings = getListingStatusActions(
        {
            status: "open",
            available_cbm: "36.00",
            available_weight: "18.00",
            cutoff_date: "2026-10-23",
            active_booking_count: 0,
        },
        refNow
    );
    assert.equal(openNoBookings.canReopen, false);
    assert.equal(openNoBookings.canClose, true);
    assert.equal(openNoBookings.canCancel, true);

    // Case G: Closed listing with completed bookings -> canCancel = false
    const completedBookingsListing = getListingStatusActions(
        {
            status: "closed",
            available_cbm: "23.00",
            available_weight: "13.00",
            cutoff_date: "2026-10-05",
            active_booking_count: 2,
            completed_booking_count: 2,
        },
        refNow
    );
    assert.equal(completedBookingsListing.canCancel, false);
});
