const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const app = require("../src/app");
const pool = require("../src/config/db");
const traderService = require("../src/services/traderService");
const pricingEngine = require("../src/services/pricingEngine");

let server;
let baseUrl;
let itemisedListing;
let legacyListing;
let testTraderId;
const createdBookingIds = [];

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
    // Find two open listings with future cutoff dates, sufficient capacity, and allowed cargo types
    const listRes = await pool.query(
        `SELECT
            l.id,
            l.provider_id,
            l.available_cbm,
            l.available_weight,
            l.total_cbm,
            l.total_weight,
            l.price_per_cbm,
            l.price_per_tonne,
            l.minimum_charge,
            l.status,
            l.updated_at,
            (SELECT lc.cargo_type_id FROM listing_cargo lc WHERE lc.listing_id = l.id LIMIT 1) AS cargo_type_id
         FROM capacity_listing l
         WHERE l.status = 'open'
           AND l.id NOT IN (1, 2, 5, 6, 39, 42)
           AND l.cutoff_date >= CURRENT_DATE
           AND l.available_cbm >= 10
           AND l.available_weight >= 5
           AND NOT EXISTS (SELECT 1 FROM listing_charge_item lci WHERE lci.listing_id = l.id)
           AND NOT EXISTS (SELECT 1 FROM listing_pricing_rule lpr WHERE lpr.listing_id = l.id)
         ORDER BY l.id DESC
         OFFSET 1
         LIMIT 2`
    );
    assert.equal(listRes.rowCount, 2, "Expected at least 2 open unconfigured listings with future cutoff");
    itemisedListing = listRes.rows[0];
    legacyListing = listRes.rows[1];

    const traderRes = await pool.query(`SELECT id FROM trader ORDER BY id ASC LIMIT 1`);
    assert.ok(traderRes.rowCount > 0, "Expected at least one trader in database");
    testTraderId = Number(traderRes.rows[0].id);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SET LOCAL search_path TO shipspace, public");

        if (createdBookingIds.length > 0) {
            // Temporarily disable snapshot immutability trigger strictly for test teardown cleanup
            await client.query(
                `ALTER TABLE booking_charge_snapshot DISABLE TRIGGER trg_protect_booking_charge_snapshot`
            );
            await client.query(
                `DELETE FROM booking_charge_snapshot WHERE booking_id = ANY($1::bigint[])`,
                [createdBookingIds]
            );
            await client.query(
                `ALTER TABLE booking_charge_snapshot ENABLE TRIGGER trg_protect_booking_charge_snapshot`
            );

            await client.query(
                `DELETE FROM booking_status_history WHERE booking_id = ANY($1::bigint[])`,
                [createdBookingIds]
            );
            await client.query(
                `DELETE FROM booking WHERE id = ANY($1::bigint[])`,
                [createdBookingIds]
            );
        }

        for (const orig of [itemisedListing, legacyListing]) {
            if (orig) {
                await client.query(`DELETE FROM listing_charge_item WHERE listing_id = $1`, [orig.id]);
                await client.query(`DELETE FROM listing_pricing_rule WHERE listing_id = $1`, [orig.id]);
                await client.query(
                    `UPDATE capacity_listing
                     SET available_cbm = $1,
                         available_weight = $2,
                         price_per_cbm = $3,
                         price_per_tonne = $4,
                         minimum_charge = $5,
                         status = $6,
                         updated_at = $7
                     WHERE id = $8`,
                    [
                        orig.available_cbm,
                        orig.available_weight,
                        orig.price_per_cbm,
                        orig.price_per_tonne,
                        orig.minimum_charge,
                        orig.status,
                        orig.updated_at,
                        orig.id,
                    ]
                );
            }
        }

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }

    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
});

test("1. Itemised booking atomically creates frozen booking_charge_snapshot rows and populates v_booking_itemised_cost", async () => {
    const ownerId = Number(itemisedListing.provider_id);

    // Configure pricing rules and charge items on itemisedListing
    const configRes = await apiRequest(
        `/api/provider/${ownerId}/listings/${itemisedListing.id}/pricing`,
        {
            method: "PUT",
            body: {
                pricing_rule: {
                    min_billable_cbm: 2.0,
                    weight_volume_ratio: 1000.0,
                    cbm_rounding_decimal: 2,
                    free_storage_days: 4,
                    storage_rate_per_cbm_day: 10.0,
                    currency: "USD",
                },
                charge_items: [
                    {
                        charge_type_code: "origin_cfs",
                        charge_name: "Origin CFS Receiving",
                        stage: "origin",
                        treatment: "charged",
                        basis: "per_cbm",
                        rate: 15.0,
                        currency: "USD",
                        certainty: "fixed",
                        payer: "shipper",
                        payment_timing: "prepaid",
                    },
                    {
                        charge_type_code: "documentation_fee",
                        charge_name: "Bill of Lading & Docs",
                        stage: "origin",
                        treatment: "charged",
                        basis: "per_shipment",
                        rate: 45.0,
                        currency: "USD",
                        certainty: "fixed",
                        payer: "shipper",
                        payment_timing: "prepaid",
                    },
                    {
                        charge_type_code: "export_customs",
                        charge_name: "Export Customs Clearance",
                        stage: "origin",
                        treatment: "included",
                        basis: "per_shipment",
                        rate: 0.0,
                        currency: "USD",
                        certainty: "fixed",
                        payer: "shipper",
                        payment_timing: "prepaid",
                    },
                    {
                        charge_type_code: "destination_thc",
                        charge_name: "Destination THC (DTHC)",
                        stage: "destination",
                        treatment: "charged",
                        basis: "per_cbm",
                        rate: 25.0,
                        currency: "USD",
                        certainty: "estimate",
                        payer: "consignee",
                        payment_timing: "collect",
                    },
                    {
                        charge_type_code: "import_duties_taxes",
                        charge_name: "Import Duties & Taxes",
                        stage: "destination",
                        treatment: "excluded",
                        basis: "at_cost",
                        rate: 0.0,
                        currency: "USD",
                        certainty: "variable",
                        payer: "consignee",
                        payment_timing: "upon_delivery",
                    },
                ],
            },
        }
    );
    assert.equal(configRes.status, 200);

    // Book 3.0 CBM and 1.2 Tonnes on itemisedListing
    const bookedCbm = 3.0;
    const bookedWeight = 1.2;
    const bookRes = await apiRequest(`/api/trader/bookings`, {
        method: "POST",
        body: {
            trader_id: testTraderId,
            listing_id: Number(itemisedListing.id),
            cargo_type_id: Number(itemisedListing.cargo_type_id),
            booked_cbm: bookedCbm,
            booked_weight: bookedWeight,
        },
    });

    assert.equal(bookRes.status, 201);
    assert.equal(bookRes.body.success, true);

    const bookingData = bookRes.body.data.booking;
    const bookingId = Number(bookingData.booking_id);
    createdBookingIds.push(bookingId);

    // Base freight = GREATEST(3.0 * price_per_cbm, 1.2 * price_per_tonne, minimum_charge)
    const expectedBase = pricingEngine.calculateBaseFreight(itemisedListing, {
        cbm: bookedCbm,
        weight: bookedWeight,
    }).base_freight;

    assert.equal(Number(bookingData.total_price), expectedBase);
    assert.equal(bookingData.is_legacy_booking, false);

    // 6 snapshot lines: synthesized Base Ocean Freight + 5 configured items
    const snapshots = bookRes.body.data.charge_snapshots;
    assert.equal(snapshots.length, 6);

    const summary = bookRes.body.data.itemised_cost_summary;
    assert.equal(summary.is_legacy_booking, false);
    assert.equal(Number(summary.legacy_total_price), expectedBase);

    // Origin charged: Origin CFS (3.0 * 15 = 45) + Docs (45) = 90.00 (Export Customs is included = 0)
    assert.equal(Number(summary.origin_charges), 90.0);
    // Ocean charged: Base Ocean Freight = expectedBase
    assert.equal(Number(summary.ocean_charges), expectedBase);
    // Destination charged: DTHC (3.0 * 25 = 75.00) (Import Duties is excluded = 0)
    assert.equal(Number(summary.destination_charges), 75.0);

    // Shipper prepaid: expectedBase + 90.00
    assert.equal(Number(summary.total_shipper_prepaid), pricingEngine.round2(expectedBase + 90.0));
    // Consignee collect: 75.00
    assert.equal(Number(summary.total_consignee_collect), 75.0);
    // All-in total: expectedBase + 90.00 + 75.00
    assert.equal(Number(summary.total_all_in_cost), pricingEngine.round2(expectedBase + 165.0));

    // Verify GET /api/trader/bookings/:bookingId returns the exact same frozen snapshot and summary
    const detailRes = await apiRequest(`/api/trader/bookings/${bookingId}`);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.is_legacy_booking, false);
    assert.equal(detailRes.body.data.charge_snapshots.length, 6);
    assert.equal(
        Number(detailRes.body.data.itemised_cost_summary.total_all_in_cost),
        pricingEngine.round2(expectedBase + 165.0)
    );
});

test("2. Legacy listing booking creates zero snapshot rows, sets is_legacy_booking = true, and preserves total_price", async () => {
    const bookedCbm = 2.0;
    const bookedWeight = 1.0;

    const bookRes = await apiRequest(`/api/trader/bookings`, {
        method: "POST",
        body: {
            trader_id: testTraderId,
            listing_id: Number(legacyListing.id),
            cargo_type_id: Number(legacyListing.cargo_type_id),
            booked_cbm: bookedCbm,
            booked_weight: bookedWeight,
        },
    });

    assert.equal(bookRes.status, 201);
    const bookingData = bookRes.body.data.booking;
    const bookingId = Number(bookingData.booking_id);
    createdBookingIds.push(bookingId);

    const expectedBase = pricingEngine.calculateBaseFreight(legacyListing, {
        cbm: bookedCbm,
        weight: bookedWeight,
    }).base_freight;

    assert.equal(Number(bookingData.total_price), expectedBase);
    assert.equal(bookingData.is_legacy_booking, true);
    assert.equal(bookRes.body.data.charge_snapshots.length, 0);

    const summary = bookRes.body.data.itemised_cost_summary;
    assert.equal(summary.is_legacy_booking, true);
    assert.equal(summary.itemised_charge_count, 0);
    assert.equal(Number(summary.total_all_in_cost), expectedBase);
    assert.equal(Number(summary.total_shipper_prepaid), 0.0);
    assert.equal(Number(summary.total_consignee_collect), 0.0);
    assert.equal(Number(summary.origin_charges), 0.0);
    assert.equal(Number(summary.ocean_charges), 0.0);
    assert.equal(Number(summary.destination_charges), 0.0);
});

test("3. Snapshot insertion failure rolls back both the booking row and capacity deduction atomically", async () => {
    const beforeListingRes = await pool.query(
        `SELECT available_cbm, available_weight, status FROM capacity_listing WHERE id = $1`,
        [itemisedListing.id]
    );
    const beforeBookingCountRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM booking WHERE listing_id = $1`,
        [itemisedListing.id]
    );

    // Force a PostgreSQL check constraint failure (ck_snapshot_rate: rate >= 0) during snapshot insertion
    // AFTER sp_create_booking has already inserted the booking and deducted capacity.
    await assert.rejects(
        () =>
            traderService.createBooking({
                trader_id: testTraderId,
                listing_id: Number(itemisedListing.id),
                cargo_type_id: Number(itemisedListing.cargo_type_id),
                booked_cbm: 2.0,
                booked_weight: 1.0,
                transformSnapshots: (rows) =>
                    rows.map((r, idx) => (idx === 0 ? { ...r, rate: -500.0 } : r)),
            }),
        (err) => err && err.code === "23514"
    );

    // Verify full rollback of capacity_listing and booking table
    const afterListingRes = await pool.query(
        `SELECT available_cbm, available_weight, status FROM capacity_listing WHERE id = $1`,
        [itemisedListing.id]
    );
    const afterBookingCountRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM booking WHERE listing_id = $1`,
        [itemisedListing.id]
    );

    assert.equal(
        Number(afterListingRes.rows[0].available_cbm),
        Number(beforeListingRes.rows[0].available_cbm)
    );
    assert.equal(
        Number(afterListingRes.rows[0].available_weight),
        Number(beforeListingRes.rows[0].available_weight)
    );
    assert.equal(afterListingRes.rows[0].status, beforeListingRes.rows[0].status);
    assert.equal(afterBookingCountRes.rows[0].cnt, beforeBookingCountRes.rows[0].cnt);
});

test("4. Subsequent provider listing price edits do not alter existing booking snapshots, and direct snapshot UPDATE/DELETE is blocked", async () => {
    const itemisedBookingId = createdBookingIds[0];
    const ownerId = Number(itemisedListing.provider_id);

    // Capture booking details before provider modifies listing prices
    const beforeDetailRes = await apiRequest(`/api/trader/bookings/${itemisedBookingId}`);
    const beforeSummary = beforeDetailRes.body.data.itemised_cost_summary;
    const beforeSnapshots = beforeDetailRes.body.data.charge_snapshots;

    // Provider drastically increases rates on itemisedListing
    const updatePricingRes = await apiRequest(
        `/api/provider/${ownerId}/listings/${itemisedListing.id}/pricing`,
        {
            method: "PUT",
            body: {
                pricing_rule: {
                    min_billable_cbm: 5.0,
                    weight_volume_ratio: 1000.0,
                    cbm_rounding_decimal: 2,
                    free_storage_days: 1,
                    storage_rate_per_cbm_day: 50.0,
                    currency: "USD",
                },
                charge_items: [
                    {
                        charge_type_code: "origin_cfs",
                        charge_name: "Origin CFS Receiving",
                        stage: "origin",
                        treatment: "charged",
                        basis: "per_cbm",
                        rate: 99.0,
                        currency: "USD",
                        certainty: "fixed",
                        payer: "shipper",
                        payment_timing: "prepaid",
                    },
                    {
                        charge_type_code: "documentation_fee",
                        charge_name: "Bill of Lading & Docs",
                        stage: "origin",
                        treatment: "charged",
                        basis: "per_shipment",
                        rate: 250.0,
                        currency: "USD",
                        certainty: "fixed",
                        payer: "shipper",
                        payment_timing: "prepaid",
                    },
                ],
            },
        }
    );
    assert.equal(updatePricingRes.status, 200);

    // Fetch existing booking details again — must match original frozen snapshot 100%
    const afterDetailRes = await apiRequest(`/api/trader/bookings/${itemisedBookingId}`);
    const afterSummary = afterDetailRes.body.data.itemised_cost_summary;
    const afterSnapshots = afterDetailRes.body.data.charge_snapshots;

    assert.equal(afterSnapshots.length, beforeSnapshots.length);
    assert.equal(
        Number(afterSummary.total_all_in_cost),
        Number(beforeSummary.total_all_in_cost)
    );
    assert.equal(
        Number(afterSummary.total_shipper_prepaid),
        Number(beforeSummary.total_shipper_prepaid)
    );
    assert.equal(
        Number(afterSummary.total_consignee_collect),
        Number(beforeSummary.total_consignee_collect)
    );

    // Also verify database trigger trg_protect_booking_charge_snapshot blocks direct UPDATE and DELETE
    const firstSnapshotId = afterSnapshots[0].id;
    await assert.rejects(
        () =>
            pool.query(
                `UPDATE booking_charge_snapshot SET calculated_amount = 9999.00 WHERE id = $1`,
                [firstSnapshotId]
            ),
        /immutable financial audit record/i
    );
    await assert.rejects(
        () =>
            pool.query(`DELETE FROM booking_charge_snapshot WHERE id = $1`, [firstSnapshotId]),
        /immutable financial audit record/i
    );
});

test("5. Cancelling a booking restores listing capacity while preserving all financial snapshots intact", async () => {
    const itemisedBookingId = createdBookingIds[0];

    const beforeCancelListing = await pool.query(
        `SELECT available_cbm, available_weight FROM capacity_listing WHERE id = $1`,
        [itemisedListing.id]
    );
    const beforeDetailRes = await apiRequest(`/api/trader/bookings/${itemisedBookingId}`);
    const expectedAllIn = Number(beforeDetailRes.body.data.itemised_cost_summary.total_all_in_cost);

    // Cancel the booking via POST /api/trader/bookings/:bookingId/cancel
    const cancelRes = await apiRequest(`/api/trader/bookings/${itemisedBookingId}/cancel`, {
        method: "POST",
        body: {
            trader_id: testTraderId,
            reason: "Test cancellation preserving financial snapshot",
        },
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.success, true);
    assert.equal(cancelRes.body.data.booking.booking_status, "cancelled");

    // Verify capacity was restored by exact booked_cbm (3.0) and booked_weight (1.2)
    const afterCancelListing = await pool.query(
        `SELECT available_cbm, available_weight FROM capacity_listing WHERE id = $1`,
        [itemisedListing.id]
    );
    assert.equal(
        Number(afterCancelListing.rows[0].available_cbm),
        pricingEngine.round2(Number(beforeCancelListing.rows[0].available_cbm) + 3.0)
    );
    assert.equal(
        Number(afterCancelListing.rows[0].available_weight),
        pricingEngine.round2(Number(beforeCancelListing.rows[0].available_weight) + 1.2)
    );

    // Verify financial snapshots remain completely intact after cancellation
    assert.equal(cancelRes.body.data.charge_snapshots.length, 6);
    assert.equal(
        Number(cancelRes.body.data.itemised_cost_summary.total_all_in_cost),
        expectedAllIn
    );
});
