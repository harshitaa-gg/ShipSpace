-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: test_concurrency_setup.sql
-- Description: Phase 6E - Concurrency Test Fixture Setup
-- Prepares an isolated test listing with exactly 2.00 CBM available.
-- Dialect: PostgreSQL (14+)
-- ============================================================================

\set ON_ERROR_STOP on
SET search_path TO shipspace, public;

BEGIN;

-- 1. Clean up any existing test records from previous runs
DO $$
DECLARE
    v_old_listing_id BIGINT;
BEGIN
    SELECT id INTO v_old_listing_id
    FROM capacity_listing
    WHERE departure_date = CURRENT_DATE + INTERVAL '99 days';

    IF v_old_listing_id IS NOT NULL THEN
        DELETE FROM booking_status_history WHERE booking_id IN (SELECT id FROM booking WHERE listing_id = v_old_listing_id);
        DELETE FROM booking WHERE listing_id = v_old_listing_id;
        DELETE FROM listing_cargo WHERE listing_id = v_old_listing_id;
        DELETE FROM capacity_listing WHERE id = v_old_listing_id;
        RAISE NOTICE 'Cleaned up previous test listing ID %', v_old_listing_id;
    END IF;
END $$;

-- 2. Insert test listing with exactly 2.00 CBM available
INSERT INTO capacity_listing (
    provider_id, route_id, departure_date, arrival_date, cutoff_date,
    total_cbm, available_cbm, total_weight, available_weight,
    price_per_cbm, price_per_tonne, minimum_charge, status
) VALUES (
    (SELECT id FROM user_account WHERE role = 'provider' ORDER BY id ASC LIMIT 1),
    (SELECT id FROM route ORDER BY id ASC LIMIT 1),
    CURRENT_DATE + INTERVAL '99 days',
    CURRENT_DATE + INTERVAL '105 days',
    CURRENT_DATE + INTERVAL '90 days',
    20.00,  -- total CBM
    2.00,   -- available CBM (Starting state: exactly 2 CBM remaining)
    10.00,  -- total weight
    5.00,   -- available weight
    100.00, -- price per cbm
    120.00, -- price per tonne
    200.00, -- minimum charge
    'open'  -- status
);

-- 3. Associate with General Cargo (or first cargo type)
INSERT INTO listing_cargo (listing_id, cargo_type_id)
VALUES (
    (SELECT id FROM capacity_listing WHERE departure_date = CURRENT_DATE + INTERVAL '99 days'),
    (SELECT id FROM cargo_type ORDER BY id ASC LIMIT 1)
);

COMMIT;

-- 4. Display starting test listing state
SELECT
    id AS test_listing_id,
    departure_date,
    total_cbm,
    available_cbm,
    total_weight,
    available_weight,
    status
FROM capacity_listing
WHERE departure_date = CURRENT_DATE + INTERVAL '99 days';
