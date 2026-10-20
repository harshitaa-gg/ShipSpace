const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const app = require("../src/app");
const pool = require("../src/config/db");
const pricingEngine = require("../src/services/pricingEngine");

let server;
let baseUrl;
let testListing;
let otherProviderId;

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
    // Select an open listing that currently has 0 configured charge items for clean testing
    const listRes = await pool.query(
        `SELECT l.id, l.provider_id, l.available_cbm, l.available_weight,
                l.price_per_cbm, l.price_per_tonne, l.minimum_charge, l.status
         FROM capacity_listing l
         WHERE l.status = 'open'
           AND NOT EXISTS (SELECT 1 FROM listing_charge_item lci WHERE lci.listing_id = l.id)
           AND NOT EXISTS (SELECT 1 FROM listing_pricing_rule lpr WHERE lpr.listing_id = l.id)
         ORDER BY l.id DESC
         LIMIT 1`
    );
    assert.ok(listRes.rowCount > 0, "Expected at least one open legacy listing in database");
    testListing = listRes.rows[0];

    const otherProvRes = await pool.query(
        `SELECT id FROM provider WHERE id <> $1 ORDER BY id ASC LIMIT 1`,
        [testListing.provider_id]
    );
    assert.ok(otherProvRes.rowCount > 0, "Expected a second distinct provider in database");
    otherProviderId = Number(otherProvRes.rows[0].id);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
    if (testListing) {
        await pool.query(`DELETE FROM listing_charge_item WHERE listing_id = $1`, [testListing.id]);
        await pool.query(`DELETE FROM listing_pricing_rule WHERE listing_id = $1`, [testListing.id]);
    }
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
});

// ============================================================================
// UNIT TESTS — Pure Pricing Engine Logic
// ============================================================================

test("Unit 1: Legacy listing pricing & minimum-charge behavior", () => {
    const mockListing = {
        id: 101,
        price_per_cbm: 60.0,
        price_per_tonne: 80.0,
        minimum_charge: 150.0,
    };

    // 1a. Small shipment triggers minimum_charge floor (1.0 * 60 = 60, 0.5 * 80 = 40 < 150)
    const minQuote = pricingEngine.calculateQuote({
        listing: mockListing,
        pricingRule: null,
        chargeItems: [],
        cbm: 1.0,
        weight: 0.5,
    });
    assert.equal(minQuote.is_legacy_listing, true);
    assert.equal(minQuote.has_itemised_pricing, false);
    assert.equal(minQuote.base_freight, 150.0);
    assert.equal(minQuote.base_freight_details.governing_basis, "minimum_charge");
    assert.equal(minQuote.totals.estimated_all_in_total, 150.0);
    assert.equal(minQuote.totals.estimated_shipper_prepaid_total, 150.0);
    assert.equal(minQuote.totals.estimated_consignee_payable_total, 0.0);
    assert.ok(minQuote.warnings.some((w) => /legacy listing/i.test(w)));

    // 1b. CBM-governed shipment (4.0 * 60 = 240 > 1.5 * 80 = 120 and > 150)
    const cbmQuote = pricingEngine.calculateQuote({
        listing: mockListing,
        pricingRule: null,
        chargeItems: [],
        cbm: 4.0,
        weight: 1.5,
    });
    assert.equal(cbmQuote.base_freight, 240.0);
    assert.equal(cbmQuote.base_freight_details.governing_basis, "per_cbm");
    assert.equal(cbmQuote.totals.estimated_all_in_total, 240.0);

    // 1c. Weight-governed shipment (2.0 * 60 = 120 < 3.5 * 80 = 280)
    const wtQuote = pricingEngine.calculateQuote({
        listing: mockListing,
        pricingRule: null,
        chargeItems: [],
        cbm: 2.0,
        weight: 3.5,
    });
    assert.equal(wtQuote.base_freight, 280.0);
    assert.equal(wtQuote.base_freight_details.governing_basis, "per_tonne");
});

test("Unit 2: Zero and non-zero CBM/weight inputs and rounding rules", () => {
    const mockListing = {
        id: 102,
        price_per_cbm: 50.0,
        price_per_tonne: 50.0,
        minimum_charge: 100.0,
    };

    // Zero CBM and zero weight returns minimum_charge with an explicit warning
    const zeroQuote = pricingEngine.calculateQuote({
        listing: mockListing,
        pricingRule: { min_billable_cbm: 1.0, cbm_rounding_decimal: 2, weight_volume_ratio: 1000 },
        chargeItems: [],
        cbm: 0,
        weight: 0,
    });
    assert.equal(zeroQuote.base_freight, 100.0);
    assert.equal(zeroQuote.quantities.billable_cbm, 1.0);
    assert.ok(zeroQuote.warnings.some((w) => /zero cbm or weight/i.test(w)));

    // Rounding and min_billable_cbm enforcement (0.456 CBM -> rounded 0.46 -> billable 2.00)
    const quantities = pricingEngine.calculateBillableQuantities({
        cbm: 0.456,
        weight: 1.25,
        pricingRule: {
            min_billable_cbm: 2.0,
            cbm_rounding_decimal: 2,
            weight_volume_ratio: 1000,
        },
    });
    assert.equal(quantities.rounded_cbm, 0.46);
    assert.equal(quantities.billable_cbm, 2.0);
    assert.equal(quantities.weight_equivalent_cbm, 1.25);
});

test("Unit 3: All 5 supported charge bases, treatments, certainties, and payer splits", () => {
    const mockListing = {
        id: 103,
        price_per_cbm: 50.0,
        price_per_tonne: 60.0,
        minimum_charge: 100.0,
    };
    const pricingRule = {
        min_billable_cbm: 1.0,
        weight_volume_ratio: 1000.0,
        cbm_rounding_decimal: 2,
        free_storage_days: 4,
        storage_rate_per_cbm_day: 8.0,
        currency: "USD",
    };

    const chargeItems = [
        // 1. Ocean Freight (per_cbm, shipper, prepaid, fixed) -> 3 CBM * 50 = 150
        {
            id: 1,
            charge_type_id: 1,
            charge_type_code: "ocean_freight",
            charge_name: "Ocean Freight",
            stage: "ocean",
            treatment: "charged",
            basis: "per_cbm",
            rate: 50.0,
            min_amount: 100.0,
            max_amount: null,
            currency: "USD",
            certainty: "fixed",
            payer: "shipper",
            payment_timing: "prepaid",
        },
        // 2. BAF (percent_ocean_freight, 10% of 150 = 15.00, min_amount 20.00 -> clamped to 20.00, variable)
        {
            id: 2,
            charge_type_id: 2,
            charge_type_code: "fuel_surcharge_baf",
            charge_name: "Fuel Surcharge (BAF)",
            stage: "ocean",
            treatment: "charged",
            basis: "percent_ocean_freight",
            rate: 10.0,
            min_amount: 20.0,
            max_amount: 45.0,
            currency: "USD",
            certainty: "variable",
            payer: "shipper",
            payment_timing: "prepaid",
        },
        // 3. Documentation Fee (per_shipment, shipper, prepaid, fixed) -> 40.00
        {
            id: 3,
            charge_type_id: 6,
            charge_type_code: "documentation_fee",
            charge_name: "Bill of Lading Fee",
            stage: "origin",
            treatment: "charged",
            basis: "per_shipment",
            rate: 40.0,
            currency: "USD",
            certainty: "fixed",
            payer: "shipper",
            payment_timing: "prepaid",
        },
        // 4. Origin CFS (included) -> 0.00
        {
            id: 4,
            charge_type_id: 4,
            charge_type_code: "origin_cfs",
            charge_name: "Origin CFS Receiving",
            stage: "origin",
            treatment: "included",
            basis: "per_cbm",
            rate: 0.0,
            currency: "USD",
            certainty: "fixed",
            payer: "shipper",
            payment_timing: "prepaid",
        },
        // 5. Optional Pickup (not_charged) -> 0.00
        {
            id: 5,
            charge_type_id: 8,
            charge_type_code: "origin_pickup",
            charge_name: "Origin Pickup",
            stage: "origin",
            treatment: "not_charged",
            basis: "per_shipment",
            rate: 0.0,
            currency: "USD",
            certainty: "fixed",
            payer: "shipper",
            payment_timing: "prepaid",
        },
        // 6. Destination THC (per_cbm, consignee, collect, estimate) -> 3 CBM * 25 = 75.00
        {
            id: 6,
            charge_type_id: 10,
            charge_type_code: "destination_thc",
            charge_name: "Destination THC",
            stage: "destination",
            treatment: "charged",
            basis: "per_cbm",
            rate: 25.0,
            min_amount: 60.0,
            max_amount: 110.0,
            currency: "USD",
            certainty: "estimate",
            payer: "consignee",
            payment_timing: "collect",
        },
        // 7. Destination Storage (per_cbm_per_day, conditional when excessStorageDays = 0)
        {
            id: 7,
            charge_type_id: 12,
            charge_type_code: "destination_storage",
            charge_name: "Destination Storage",
            stage: "destination",
            treatment: "charged",
            basis: "per_cbm_per_day",
            rate: 8.0,
            currency: "USD",
            certainty: "variable",
            payer: "consignee",
            payment_timing: "at_terminal",
        },
        // 8. Import Duties (excluded, at_cost) -> 0.00, excluded
        {
            id: 8,
            charge_type_id: 13,
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
    ];

    // Evaluate with 3.0 CBM, 1.2 tonnes, 0 excess storage days
    const quote = pricingEngine.calculateQuote({
        listing: mockListing,
        pricingRule,
        chargeItems,
        cbm: 3.0,
        weight: 1.2,
        excessStorageDays: 0,
    });

    assert.equal(quote.is_legacy_listing, false);
    assert.equal(quote.has_itemised_pricing, true);
    assert.equal(quote.base_freight, 150.0);

    // Shipper prepaid: Ocean Freight (150) + BAF (min 20) + BL Fee (40) = 210.00
    assert.equal(quote.totals.estimated_shipper_prepaid_total, 210.0);
    // Consignee payable: Destination THC (75) + Storage (0 for 0 excess days) = 75.00
    assert.equal(quote.totals.estimated_consignee_payable_total, 75.0);
    // All-in total: 210 + 75 = 285.00
    assert.equal(quote.totals.estimated_all_in_total, 285.0);

    // Certainty breakdown: Fixed (150 + 40 = 190), Estimate (75), Variable (20)
    assert.equal(quote.totals.fixed_charges_total, 190.0);
    assert.equal(quote.totals.estimated_charges_total, 75.0);
    assert.equal(quote.totals.variable_charges_total, 20.0);

    // Stage breakdown: Origin (40), Ocean (170), Destination (75)
    assert.equal(quote.totals.by_stage.origin, 40.0);
    assert.equal(quote.totals.by_stage.ocean, 170.0);
    assert.equal(quote.totals.by_stage.destination, 75.0);

    // Range accounts for min/max on variable/estimate lines:
    // Min: 150 + 20 + 40 + 60 = 270.00; Max: 150 + 45 + 40 + 110 = 345.00
    assert.equal(quote.totals.estimated_all_in_range.min, 270.0);
    assert.equal(quote.totals.estimated_all_in_range.max, 345.0);

    // Included, excluded, and not_charged arrays
    assert.equal(quote.included_charges.length, 1);
    assert.equal(quote.excluded_charges.length, 1);
    assert.equal(quote.not_charged_items.length, 1);

    // Warnings for excluded, conditional storage, variable, and estimate charges
    assert.ok(quote.warnings.some((w) => /Excluded charge: "Import Duties & Taxes"/i.test(w)));
    assert.ok(quote.warnings.some((w) => /Conditional charge: "Destination Storage"/i.test(w)));
    assert.ok(quote.warnings.some((w) => /Variable charge: "Fuel Surcharge \(BAF\)"/i.test(w)));

    // Evaluate with 2 excess storage days -> Storage = 3 CBM * 2 days * 8 = 48.00
    const quoteWithStorage = pricingEngine.calculateQuote({
        listing: mockListing,
        pricingRule,
        chargeItems,
        cbm: 3.0,
        weight: 1.2,
        excessStorageDays: 2,
    });
    assert.equal(quoteWithStorage.totals.estimated_consignee_payable_total, 123.0);
    assert.equal(quoteWithStorage.totals.estimated_all_in_total, 333.0);
});

test("Unit 4: Invalid and negative inputs are rejected clearly", () => {
    const mockListing = {
        id: 104,
        price_per_cbm: 50,
        price_per_tonne: 50,
        minimum_charge: 100,
    };

    assert.throws(
        () => pricingEngine.calculateBaseFreight(mockListing, { cbm: -1, weight: 1 }),
        /cbm must be a non-negative number/i
    );
    assert.throws(
        () => pricingEngine.calculateBaseFreight(mockListing, { cbm: 2, weight: -0.5 }),
        /weight must be a non-negative number/i
    );
    assert.throws(
        () => pricingEngine.calculateBaseFreight(mockListing, { cbm: "invalid", weight: 1 }),
        /cbm must be a non-negative number/i
    );
    assert.throws(
        () =>
            pricingEngine.validateChargeItemsInput([
                {
                    charge_name: "Bad Range",
                    stage: "origin",
                    treatment: "charged",
                    basis: "per_cbm",
                    rate: 20,
                    min_amount: 100,
                    max_amount: 50,
                },
            ]),
        /max_amount .* must be greater than or equal to min_amount/i
    );
    assert.throws(
        () =>
            pricingEngine.validateChargeItemsInput([
                {
                    charge_name: "USD Item",
                    stage: "origin",
                    treatment: "charged",
                    basis: "per_cbm",
                    rate: 10,
                    currency: "USD",
                },
                {
                    charge_name: "EUR Item",
                    stage: "destination",
                    treatment: "charged",
                    basis: "per_cbm",
                    rate: 15,
                    currency: "EUR",
                },
            ]),
        /Currency mismatch/i
    );
});

// ============================================================================
// INTEGRATION TESTS — Reference, Provider & Trader APIs against PostgreSQL
// ============================================================================

test("API 1: GET /api/reference/charge-types returns the 13 standard charge types and supports stage filter", async () => {
    const allRes = await apiRequest("/api/reference/charge-types");
    assert.equal(allRes.status, 200);
    assert.equal(allRes.body.success, true);
    assert.equal(allRes.body.count, 13);
    assert.equal(allRes.body.data[0].code, "ocean_freight");

    const destRes = await apiRequest("/api/reference/charge-types?stage=destination");
    assert.equal(destRes.status, 200);
    assert.ok(destRes.body.count >= 4);
    assert.ok(destRes.body.data.every((item) => item.stage === "destination"));
});

test("API 2: Legacy listing pricing & quote endpoints return legacy indicator without reserving capacity", async () => {
    const beforeListing = await pool.query(
        `SELECT available_cbm, available_weight FROM capacity_listing WHERE id = $1`,
        [testListing.id]
    );
    const beforeBookings = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM booking WHERE listing_id = $1`,
        [testListing.id]
    );

    // 2a. GET /api/listings/:listingId/pricing on unconfigured listing
    const pricingRes = await apiRequest(`/api/listings/${testListing.id}/pricing`);
    assert.equal(pricingRes.status, 200);
    assert.equal(pricingRes.body.data.is_legacy_listing, true);
    assert.equal(pricingRes.body.data.pricing_rule, null);
    assert.equal(pricingRes.body.data.charge_items.length, 0);

    // 2b. GET /api/trader/listings/:listingId/quote on unconfigured listing
    const quoteRes = await apiRequest(
        `/api/trader/listings/${testListing.id}/quote?cbm=2.5&weight=1.2`
    );
    assert.equal(quoteRes.status, 200);
    assert.equal(quoteRes.body.success, true);
    assert.equal(quoteRes.body.data.is_legacy_listing, true);
    assert.equal(
        quoteRes.body.data.totals.estimated_all_in_total,
        quoteRes.body.data.base_freight
    );

    // Verify capacity and booking count did not change
    const afterListing = await pool.query(
        `SELECT available_cbm, available_weight FROM capacity_listing WHERE id = $1`,
        [testListing.id]
    );
    const afterBookings = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM booking WHERE listing_id = $1`,
        [testListing.id]
    );
    assert.equal(
        Number(afterListing.rows[0].available_cbm),
        Number(beforeListing.rows[0].available_cbm)
    );
    assert.equal(
        Number(afterListing.rows[0].available_weight),
        Number(beforeListing.rows[0].available_weight)
    );
    assert.equal(afterBookings.rows[0].cnt, beforeBookings.rows[0].cnt);
});

test("API 3: Provider ownership validation rejects body-only provider_id and non-owner provider_id", async () => {
    const validPayload = {
        pricing_rule: {
            min_billable_cbm: 1.0,
            weight_volume_ratio: 1000,
            cbm_rounding_decimal: 2,
            free_storage_days: 5,
            storage_rate_per_cbm_day: 12.0,
            currency: "USD",
        },
        charge_items: [
            {
                charge_type_code: "documentation_fee",
                charge_name: "Bill of Lading Fee",
                stage: "origin",
                treatment: "charged",
                basis: "per_shipment",
                rate: 45.0,
                currency: "USD",
                certainty: "fixed",
                payer: "shipper",
                payment_timing: "prepaid",
            },
        ],
    };

    // 3a. Sending provider_id ONLY in request body must be rejected (403 FORBIDDEN_OWNERSHIP)
    const bodyOnlyRes = await apiRequest(`/api/provider/listings/${testListing.id}/pricing`, {
        method: "PUT",
        body: {
            provider_id: Number(testListing.provider_id),
            ...validPayload,
        },
    });
    assert.equal(bodyOnlyRes.status, 403);
    assert.equal(bodyOnlyRes.body.error.code, "FORBIDDEN_OWNERSHIP");

    // 3b. Sending another provider's ID via route parameter must be rejected (403 FORBIDDEN_OWNERSHIP)
    const wrongOwnerRes = await apiRequest(
        `/api/provider/${otherProviderId}/listings/${testListing.id}/pricing`,
        {
            method: "PUT",
            body: validPayload,
        }
    );
    assert.equal(wrongOwnerRes.status, 403);
    assert.equal(wrongOwnerRes.body.error.code, "FORBIDDEN_OWNERSHIP");
});

test("API 4: Provider can save pricing rules and charge items, and Trader receives full itemised quote", async () => {
    const ownerId = Number(testListing.provider_id);
    const payload = {
        pricing_rule: {
            min_billable_cbm: 2.0,
            weight_volume_ratio: 1000,
            cbm_rounding_decimal: 2,
            free_storage_days: 4,
            storage_rate_per_cbm_day: 10.0,
            currency: "USD",
            price_validity_date: "2027-12-31",
            surcharge_change_policy: "BAF subject to monthly carrier review",
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
                charge_name: "Export Documentation & BL",
                stage: "origin",
                treatment: "charged",
                basis: "per_shipment",
                rate: 50.0,
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
                rate: 22.0,
                min_amount: 55.0,
                max_amount: 120.0,
                currency: "USD",
                certainty: "estimate",
                payer: "consignee",
                payment_timing: "collect",
            },
            {
                charge_type_code: "import_duties_taxes",
                charge_name: "Import Customs Duties & Taxes",
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
    };

    const saveRes = await apiRequest(
        `/api/provider/${ownerId}/listings/${testListing.id}/pricing`,
        {
            method: "PUT",
            body: payload,
        }
    );
    assert.equal(saveRes.status, 200);
    assert.equal(saveRes.body.success, true);
    assert.equal(saveRes.body.data.is_legacy_listing, false);
    assert.equal(saveRes.body.data.charge_items.length, 5);
    assert.equal(Number(saveRes.body.data.pricing_rule.min_billable_cbm), 2.0);

    // Request a Trader Quote for 1.5 CBM, 0.8 Tonnes (min_billable_cbm = 2.0 applies to per_cbm charges)
    const quoteRes = await apiRequest(
        `/api/trader/listings/${testListing.id}/quote?cbm=1.5&weight=0.8`
    );
    assert.equal(quoteRes.status, 200);
    const quote = quoteRes.body.data;

    assert.equal(quote.is_legacy_listing, false);
    assert.equal(quote.has_itemised_pricing, true);
    assert.equal(quote.quantities.requested_cbm, 1.5);
    assert.equal(quote.quantities.billable_cbm, 2.0);

    // Expected Shipper Prepaid:
    // Base Ocean Freight + Origin CFS (2.0 billable CBM * 15 = 30) + Docs (50) = base_freight + 80
    assert.equal(
        quote.totals.estimated_shipper_prepaid_total,
        pricingEngine.round2(quote.base_freight + 30.0 + 50.0)
    );

    // Expected Consignee Collect:
    // Destination THC: 2.0 billable CBM * 22 = 44, clamped to min_amount 55.00
    assert.equal(quote.totals.estimated_consignee_payable_total, 55.0);

    // Expected All-In Total:
    assert.equal(
        quote.totals.estimated_all_in_total,
        pricingEngine.round2(quote.base_freight + 80.0 + 55.0)
    );

    // Excluded and included items
    assert.equal(quote.included_charges.length, 1);
    assert.equal(quote.excluded_charges.length, 1);
    assert.ok(quote.warnings.some((w) => /Import Customs Duties & Taxes/i.test(w)));
});

test("API 5: Quote and pricing endpoints reject negative and invalid HTTP inputs with 400", async () => {
    const ownerId = Number(testListing.provider_id);

    // Negative CBM in quote request
    const negCbmRes = await apiRequest(
        `/api/trader/listings/${testListing.id}/quote?cbm=-2.5&weight=1.0`
    );
    assert.equal(negCbmRes.status, 400);
    assert.equal(negCbmRes.body.error.code, "VALIDATION_ERROR");

    // Negative weight in quote request
    const negWtRes = await apiRequest(
        `/api/trader/listings/${testListing.id}/quote?cbm=2.5&weight=-1.0`
    );
    assert.equal(negWtRes.status, 400);
    assert.equal(negWtRes.body.error.code, "VALIDATION_ERROR");

    // Negative rate in provider pricing payload
    const negRateRes = await apiRequest(
        `/api/provider/${ownerId}/listings/${testListing.id}/pricing`,
        {
            method: "PUT",
            body: {
                charge_items: [
                    {
                        charge_type_code: "origin_cfs",
                        charge_name: "Origin CFS",
                        stage: "origin",
                        treatment: "charged",
                        basis: "per_cbm",
                        rate: -10.0,
                        currency: "USD",
                        certainty: "fixed",
                        payer: "shipper",
                        payment_timing: "prepaid",
                    },
                ],
            },
        }
    );
    assert.equal(negRateRes.status, 400);
    assert.equal(negRateRes.body.error.code, "VALIDATION_ERROR");
});
