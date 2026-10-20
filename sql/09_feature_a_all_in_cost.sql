-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 09_feature_a_all_in_cost.sql
-- Description: Feature A — Itemised All-In Cost Schema & Database Foundation
-- Target: PostgreSQL 14+
--
-- Scope:
--   1. standard_charge_type: Master catalogue of 12 standard LCL charge categories
--   2. listing_pricing_rule: Listing-level pricing rules (min CBM, W/V ratio, storage)
--   3. listing_charge_item: Provider-configured line items per capacity listing
--   4. booking_charge_snapshot: Immutable snapshot of all charges locked at booking
--   5. booking_actual_charge: Post-delivery reconciliation of actual invoiced fees
--   6. trg_protect_booking_charge_snapshot: Immutability enforcement trigger
--   7. v_booking_itemised_cost: Read-optimized view for itemised cost breakdown
--
-- Historical & Backward Compatibility:
--   - Wrapped in atomic transaction block (BEGIN ... COMMIT).
--   - Additive-only. Zero modifications or drops to existing tables or columns.
--   - Does NOT backfill fake or estimated charges into live capacity listings.
--   - Existing bookings with 0 snapshot rows remain identifiable as legacy records
--     with total_all_in_cost set to booking.total_price and zero for unverified stages.
-- ============================================================================

BEGIN;

SET search_path TO shipspace, public;

-- ============================================================================
-- 1. STANDARD_CHARGE_TYPE
-- Master catalogue of standard LCL freight charges across Origin, Ocean, Destination.
-- ============================================================================
CREATE TABLE IF NOT EXISTS standard_charge_type (
    id                     INT GENERATED ALWAYS AS IDENTITY,
    code                   VARCHAR(50)  NOT NULL,
    name                   VARCHAR(100) NOT NULL,
    stage                  VARCHAR(20)  NOT NULL,
    default_basis          VARCHAR(30)  NOT NULL,
    default_treatment      VARCHAR(20)  NOT NULL DEFAULT 'charged',
    default_payer          VARCHAR(20)  NOT NULL DEFAULT 'shipper',
    default_payment_timing VARCHAR(30)  NOT NULL DEFAULT 'prepaid',
    is_mandatory           BOOLEAN      NOT NULL DEFAULT FALSE,
    display_order          INT          NOT NULL DEFAULT 0,
    description            TEXT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_standard_charge_type PRIMARY KEY (id),
    CONSTRAINT uq_standard_charge_type_code UNIQUE (code),
    CONSTRAINT ck_std_charge_stage CHECK (stage IN ('origin', 'ocean', 'destination')),
    CONSTRAINT ck_std_charge_basis CHECK (default_basis IN ('per_cbm', 'per_shipment', 'percent_ocean_freight', 'per_cbm_per_day', 'at_cost')),
    CONSTRAINT ck_std_charge_treatment CHECK (default_treatment IN ('charged', 'included', 'not_charged', 'excluded')),
    CONSTRAINT ck_std_charge_payer CHECK (default_payer IN ('shipper', 'consignee')),
    CONSTRAINT ck_std_charge_timing CHECK (default_payment_timing IN ('prepaid', 'collect', 'upon_delivery', 'at_terminal'))
);

-- ============================================================================
-- Seed 12 Standard LCL Charges (+ Excluded Statutory Duties)
-- Idempotent upsert using ON CONFLICT (code) DO NOTHING.
-- ============================================================================
INSERT INTO standard_charge_type (
    code, name, stage, default_basis, default_treatment, default_payer, default_payment_timing, is_mandatory, display_order, description
) VALUES
(
    'ocean_freight',
    'Ocean Freight',
    'ocean',
    'per_cbm',
    'charged',
    'shipper',
    'prepaid',
    TRUE,
    10,
    'Base ocean transport rate per revenue ton (CBM or W/V equivalent).'
),
(
    'fuel_surcharge_baf',
    'Fuel Surcharge (BAF)',
    'ocean',
    'per_cbm',
    'charged',
    'shipper',
    'prepaid',
    FALSE,
    20,
    'Bunker Adjustment Factor compensating for carrier marine fuel fluctuations.'
),
(
    'carrier_surcharges',
    'Carrier Security & Surcharges (ISPS / PSS)',
    'ocean',
    'per_cbm',
    'charged',
    'shipper',
    'prepaid',
    FALSE,
    30,
    'Mandatory maritime security (ISPS), peak season, and low sulphur surcharges.'
),
(
    'origin_cfs',
    'Origin CFS Receiving & Consolidation',
    'origin',
    'per_cbm',
    'charged',
    'shipper',
    'prepaid',
    FALSE,
    40,
    'Container Freight Station handling, cargo receiving, tallying, and stuffing.'
),
(
    'origin_thc',
    'Origin Terminal Handling Charge (OTHC)',
    'origin',
    'per_cbm',
    'charged',
    'shipper',
    'prepaid',
    FALSE,
    50,
    'Terminal container handling from origin port gate/yard to ship berth.'
),
(
    'documentation_fee',
    'Bill of Lading & Documentation',
    'origin',
    'per_shipment',
    'charged',
    'shipper',
    'prepaid',
    FALSE,
    60,
    'Issuance and processing fee for Ocean Bill of Lading and shipping manifests.'
),
(
    'export_customs',
    'Export Customs Clearance (Optional)',
    'origin',
    'per_shipment',
    'not_charged',
    'shipper',
    'prepaid',
    FALSE,
    70,
    'Brokerage and documentation for origin export customs filing and examination.'
),
(
    'origin_pickup',
    'Origin CFS Pickup / Drayage (Optional)',
    'origin',
    'per_shipment',
    'not_charged',
    'shipper',
    'prepaid',
    FALSE,
    80,
    'First-mile trucking from exporter warehouse to the origin CFS facility.'
),
(
    'destination_cfs',
    'Destination CFS Deconsolidation & Handling',
    'destination',
    'per_cbm',
    'charged',
    'consignee',
    'collect',
    FALSE,
    90,
    'Container stripping, sorting, and loose cargo storage at destination port CFS.'
),
(
    'destination_thc',
    'Destination Terminal Handling Charge (DTHC)',
    'destination',
    'per_cbm',
    'charged',
    'consignee',
    'collect',
    FALSE,
    100,
    'Port crane discharge, terminal transfer, and staging at destination berth.'
),
(
    'delivery_order_fee',
    'Delivery Order (D/O) & Turn-in Fee',
    'destination',
    'per_shipment',
    'charged',
    'consignee',
    'collect',
    FALSE,
    110,
    'Administrative fee to release carrier Delivery Order authorizing cargo pickup.'
),
(
    'destination_storage',
    'Destination Storage & Demurrage',
    'destination',
    'per_cbm_per_day',
    'charged',
    'consignee',
    'at_terminal',
    FALSE,
    120,
    'Daily warehousing fees incurred if cargo remains unclaimed beyond free days.'
),
(
    'import_duties_taxes',
    'Import Customs Duties & Statutory Taxes',
    'destination',
    'at_cost',
    'excluded',
    'consignee',
    'upon_delivery',
    FALSE,
    130,
    'Government tariffs, VAT/GST, and customs inspection fees assessed by destination customs.'
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. LISTING_PRICING_RULE
-- Listing-level pricing policy, calculation rules, and terms.
-- ============================================================================
CREATE TABLE IF NOT EXISTS listing_pricing_rule (
    listing_id                BIGINT         NOT NULL,
    min_billable_cbm          NUMERIC(6, 2)  NOT NULL DEFAULT 1.00,
    weight_volume_ratio       NUMERIC(6, 2)  NOT NULL DEFAULT 1000.00, -- 1000 kg = 1 CBM
    cbm_rounding_decimal      INT            NOT NULL DEFAULT 2,
    free_storage_days         INT            NOT NULL DEFAULT 3,
    storage_rate_per_cbm_day  NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    currency                  VARCHAR(3)     NOT NULL DEFAULT 'USD',
    price_validity_date       DATE,
    surcharge_change_policy   TEXT,
    created_at                TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_listing_pricing_rule PRIMARY KEY (listing_id),
    CONSTRAINT fk_pricing_rule_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT ck_pricing_min_billable_cbm CHECK (min_billable_cbm >= 0),
    CONSTRAINT ck_pricing_weight_volume_ratio CHECK (weight_volume_ratio > 0),
    CONSTRAINT ck_pricing_free_storage_days CHECK (free_storage_days >= 0),
    CONSTRAINT ck_pricing_storage_rate CHECK (storage_rate_per_cbm_day >= 0)
);

-- ============================================================================
-- 3. LISTING_CHARGE_ITEM
-- Individual line item charges defined by the logistics provider for a listing.
-- ============================================================================
CREATE TABLE IF NOT EXISTS listing_charge_item (
    id               BIGINT GENERATED ALWAYS AS IDENTITY,
    listing_id       BIGINT         NOT NULL,
    charge_type_id   INT,
    charge_name      VARCHAR(150)   NOT NULL,
    stage            VARCHAR(20)    NOT NULL,
    treatment        VARCHAR(20)    NOT NULL DEFAULT 'charged',
    basis            VARCHAR(30)    NOT NULL DEFAULT 'per_cbm',
    rate             NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    min_amount       NUMERIC(12, 2),
    max_amount       NUMERIC(12, 2),
    currency         VARCHAR(3)     NOT NULL DEFAULT 'USD',
    certainty        VARCHAR(20)    NOT NULL DEFAULT 'fixed',
    payer            VARCHAR(20)    NOT NULL DEFAULT 'shipper',
    payee            VARCHAR(100),
    payment_timing   VARCHAR(30)    NOT NULL DEFAULT 'prepaid',
    explanatory_note TEXT,
    valid_from       DATE,
    valid_to         DATE,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_listing_charge_item PRIMARY KEY (id),
    CONSTRAINT fk_charge_item_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_charge_item_type FOREIGN KEY (charge_type_id)
        REFERENCES standard_charge_type (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT ck_charge_item_stage CHECK (stage IN ('origin', 'ocean', 'destination')),
    CONSTRAINT ck_charge_item_treatment CHECK (treatment IN ('charged', 'included', 'not_charged', 'excluded')),
    CONSTRAINT ck_charge_item_basis CHECK (basis IN ('per_cbm', 'per_shipment', 'percent_ocean_freight', 'per_cbm_per_day', 'at_cost')),
    CONSTRAINT ck_charge_item_certainty CHECK (certainty IN ('fixed', 'estimate', 'variable')),
    CONSTRAINT ck_charge_item_payer CHECK (payer IN ('shipper', 'consignee')),
    CONSTRAINT ck_charge_item_payment_timing CHECK (payment_timing IN ('prepaid', 'collect', 'upon_delivery', 'at_terminal')),
    CONSTRAINT ck_charge_item_rate CHECK (rate >= 0),
    CONSTRAINT ck_charge_item_min_amount CHECK (min_amount IS NULL OR min_amount >= 0),
    CONSTRAINT ck_charge_item_max_amount CHECK (max_amount IS NULL OR max_amount >= 0),
    CONSTRAINT ck_charge_item_amount_range CHECK (min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount),
    CONSTRAINT ck_charge_item_validity CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from)
);

-- ============================================================================
-- 4. BOOKING_CHARGE_SNAPSHOT
-- Immutable snapshot of every line item and calculation locked at booking time.
-- Protected against UPDATE and DELETE via trg_protect_booking_charge_snapshot.
-- Deleting a booking is RESTRICTED to preserve financial audit history.
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_charge_snapshot (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    booking_id          BIGINT         NOT NULL,
    listing_id          BIGINT,
    charge_type_code    VARCHAR(50),
    charge_name         VARCHAR(150)   NOT NULL,
    stage               VARCHAR(20)    NOT NULL,
    treatment           VARCHAR(20)    NOT NULL,
    basis               VARCHAR(30)    NOT NULL,
    rate                NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    chargeable_quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    calculated_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency            VARCHAR(3)     NOT NULL DEFAULT 'USD',
    certainty           VARCHAR(20)    NOT NULL DEFAULT 'fixed',
    payer               VARCHAR(20)    NOT NULL DEFAULT 'shipper',
    payee               VARCHAR(100),
    payment_timing      VARCHAR(30)    NOT NULL DEFAULT 'prepaid',
    explanatory_note    TEXT,
    snapshot_time       TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_booking_charge_snapshot PRIMARY KEY (id),
    CONSTRAINT fk_snapshot_booking FOREIGN KEY (booking_id)
        REFERENCES booking (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_snapshot_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT ck_snapshot_stage CHECK (stage IN ('origin', 'ocean', 'destination')),
    CONSTRAINT ck_snapshot_treatment CHECK (treatment IN ('charged', 'included', 'not_charged', 'excluded')),
    CONSTRAINT ck_snapshot_basis CHECK (basis IN ('per_cbm', 'per_shipment', 'percent_ocean_freight', 'per_cbm_per_day', 'at_cost')),
    CONSTRAINT ck_snapshot_certainty CHECK (certainty IN ('fixed', 'estimate', 'variable')),
    CONSTRAINT ck_snapshot_payer CHECK (payer IN ('shipper', 'consignee')),
    CONSTRAINT ck_snapshot_payment_timing CHECK (payment_timing IN ('prepaid', 'collect', 'upon_delivery', 'at_terminal')),
    CONSTRAINT ck_snapshot_rate CHECK (rate >= 0),
    CONSTRAINT ck_snapshot_quantity CHECK (chargeable_quantity >= 0),
    CONSTRAINT ck_snapshot_amount CHECK (calculated_amount >= 0)
);

-- ============================================================================
-- 5. SNAPSHOT IMMUTABILITY TRIGGER
-- Explicitly rejects any UPDATE or DELETE operations on booking_charge_snapshot.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_prevent_snapshot_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'booking_charge_snapshot is an immutable financial audit record and cannot be modified or deleted (id: %)', OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_booking_charge_snapshot ON booking_charge_snapshot;
CREATE TRIGGER trg_protect_booking_charge_snapshot
    BEFORE UPDATE OR DELETE ON booking_charge_snapshot
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_snapshot_modification();

-- ============================================================================
-- 6. BOOKING_ACTUAL_CHARGE
-- Post-delivery reconciliation for charges that differed or were assessed upon delivery.
-- Retains audit history via ON DELETE RESTRICT on booking_id.
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_actual_charge (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    booking_id          BIGINT         NOT NULL,
    snapshot_id         BIGINT,
    charge_name         VARCHAR(150)   NOT NULL,
    stage               VARCHAR(20)    NOT NULL,
    invoiced_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency            VARCHAR(3)     NOT NULL DEFAULT 'USD',
    payer               VARCHAR(20)    NOT NULL DEFAULT 'shipper',
    payment_timing      VARCHAR(30)    NOT NULL DEFAULT 'collect',
    variance_reason     TEXT,
    recorded_by_user_id BIGINT,
    recorded_at         TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_booking_actual_charge PRIMARY KEY (id),
    CONSTRAINT fk_actual_charge_booking FOREIGN KEY (booking_id)
        REFERENCES booking (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_actual_charge_snapshot FOREIGN KEY (snapshot_id)
        REFERENCES booking_charge_snapshot (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT fk_actual_charge_user FOREIGN KEY (recorded_by_user_id)
        REFERENCES user_account (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT ck_actual_charge_stage CHECK (stage IN ('origin', 'ocean', 'destination')),
    CONSTRAINT ck_actual_charge_payer CHECK (payer IN ('shipper', 'consignee')),
    CONSTRAINT ck_actual_charge_timing CHECK (payment_timing IN ('prepaid', 'collect', 'upon_delivery', 'at_terminal')),
    CONSTRAINT ck_actual_charge_amount CHECK (invoiced_amount >= 0)
);

-- ============================================================================
-- 7. INDEXES
-- Optimize charge lookups by listing, booking, stage, and payer.
-- Note: standard_charge_type.code is uniquely indexed by uq_standard_charge_type_code.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_listing_charge_item_listing
    ON listing_charge_item (listing_id);

CREATE INDEX IF NOT EXISTS idx_listing_charge_item_stage
    ON listing_charge_item (listing_id, stage);

CREATE INDEX IF NOT EXISTS idx_booking_charge_snapshot_booking
    ON booking_charge_snapshot (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_charge_snapshot_payer
    ON booking_charge_snapshot (booking_id, payer);

CREATE INDEX IF NOT EXISTS idx_booking_actual_charge_booking
    ON booking_actual_charge (booking_id);

-- ============================================================================
-- 8. READ-OPTIMIZED VIEW: v_booking_itemised_cost
-- Provides a clean breakdown of prepaid shipper charges vs collect consignee charges.
-- Correctly falls back to booking.total_price for legacy bookings while setting
-- unverified itemised category totals to zero.
-- ============================================================================
CREATE OR REPLACE VIEW v_booking_itemised_cost AS
SELECT
    b.id AS booking_id,
    b.listing_id,
    b.trader_id,
    b.booked_cbm,
    b.booked_weight,
    b.total_price AS legacy_total_price,
    b.status AS booking_status,
    CASE
        WHEN COUNT(s.id) = 0 THEN b.total_price
        ELSE COALESCE(SUM(s.calculated_amount) FILTER (WHERE s.treatment = 'charged'), 0.00)
    END AS total_all_in_cost,
    CASE
        WHEN COUNT(s.id) = 0 THEN 0.00
        ELSE COALESCE(SUM(s.calculated_amount) FILTER (WHERE s.treatment = 'charged' AND s.payer = 'shipper'), 0.00)
    END AS total_shipper_prepaid,
    CASE
        WHEN COUNT(s.id) = 0 THEN 0.00
        ELSE COALESCE(SUM(s.calculated_amount) FILTER (WHERE s.treatment = 'charged' AND s.payer = 'consignee'), 0.00)
    END AS total_consignee_collect,
    CASE
        WHEN COUNT(s.id) = 0 THEN 0.00
        ELSE COALESCE(SUM(s.calculated_amount) FILTER (WHERE s.treatment = 'charged' AND s.stage = 'origin'), 0.00)
    END AS origin_charges,
    CASE
        WHEN COUNT(s.id) = 0 THEN 0.00
        ELSE COALESCE(SUM(s.calculated_amount) FILTER (WHERE s.treatment = 'charged' AND s.stage = 'ocean'), 0.00)
    END AS ocean_charges,
    CASE
        WHEN COUNT(s.id) = 0 THEN 0.00
        ELSE COALESCE(SUM(s.calculated_amount) FILTER (WHERE s.treatment = 'charged' AND s.stage = 'destination'), 0.00)
    END AS destination_charges,
    COUNT(s.id) AS itemised_charge_count,
    CASE WHEN COUNT(s.id) = 0 THEN TRUE ELSE FALSE END AS is_legacy_booking
FROM booking b
LEFT JOIN booking_charge_snapshot s ON b.id = s.booking_id
GROUP BY b.id, b.listing_id, b.trader_id, b.booked_cbm, b.booked_weight, b.total_price, b.status;

COMMIT;
