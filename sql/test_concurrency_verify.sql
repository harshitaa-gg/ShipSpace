-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: test_concurrency_verify.sql
-- Description: Phase 6E - Concurrency Test Verification & Teardown
-- Asserts that exactly 1 booking succeeded, capacity is exactly 0.00 (not negative),
-- status became 'full', and cleans up test fixtures.
-- Dialect: PostgreSQL (14+)
-- ============================================================================

\set ON_ERROR_STOP on
SET search_path TO shipspace, public;

\echo '========================================================'
\echo 'PHASE 6E CONCURRENCY TEST VERIFICATION'
\echo '========================================================'

-- 1. Inspect capacity listing state
SELECT
    id AS listing_id,
    departure_date,
    total_cbm,
    available_cbm,
    total_weight,
    available_weight,
    status
FROM capacity_listing
WHERE departure_date = CURRENT_DATE + INTERVAL '99 days';

-- 2. Inspect created bookings
SELECT
    b.id AS booking_id,
    b.listing_id,
    b.trader_id,
    b.booked_cbm,
    b.booked_weight,
    b.total_price,
    b.status
FROM booking b
JOIN capacity_listing cl ON b.listing_id = cl.id
WHERE cl.departure_date = CURRENT_DATE + INTERVAL '99 days';

-- 3. Assertions
DO $$
DECLARE
    v_listing_id   BIGINT;
    v_avail_cbm    NUMERIC(10, 2);
    v_status       VARCHAR(20);
    v_booking_cnt  INT;
BEGIN
    SELECT id, available_cbm, status
    INTO v_listing_id, v_avail_cbm, v_status
    FROM capacity_listing
    WHERE departure_date = CURRENT_DATE + INTERVAL '99 days';

    IF v_listing_id IS NULL THEN
        RAISE EXCEPTION 'Test listing not found!';
    END IF;

    SELECT count(*) INTO v_booking_cnt
    FROM booking
    WHERE listing_id = v_listing_id;

    RAISE NOTICE '--------------------------------------------------';
    RAISE NOTICE 'VERIFICATION RESULTS:';
    RAISE NOTICE 'Listing ID: %', v_listing_id;
    RAISE NOTICE 'Available CBM: % (Expected: 0.00, Never Negative)', v_avail_cbm;
    RAISE NOTICE 'Listing Status: % (Expected: full)', v_status;
    RAISE NOTICE 'Confirmed Bookings: % (Expected: 1)', v_booking_cnt;
    RAISE NOTICE '--------------------------------------------------';

    IF v_avail_cbm < 0 THEN
        RAISE EXCEPTION 'FAIL: available_cbm is negative (%)! Overbooking occurred!', v_avail_cbm;
    END IF;

    IF v_avail_cbm <> 0.00 THEN
        RAISE EXCEPTION 'FAIL: available_cbm expected 0.00, found %', v_avail_cbm;
    END IF;

    IF v_booking_cnt <> 1 THEN
        RAISE EXCEPTION 'FAIL: booking count expected 1, found %', v_booking_cnt;
    END IF;

    IF v_status <> 'full' THEN
        RAISE EXCEPTION 'FAIL: listing status expected "full", found %', v_status;
    END IF;

    RAISE NOTICE '>> CONCURRENCY SAFETY VERIFIED: EXACTLY ONE BOOKING SUCCEEDED, NO OVERBOOKING! <<';
END $$;

-- 4. Teardown test fixtures
BEGIN;
DO $$
DECLARE
    v_test_listing_id BIGINT;
BEGIN
    SELECT id INTO v_test_listing_id
    FROM capacity_listing
    WHERE departure_date = CURRENT_DATE + INTERVAL '99 days';

    IF v_test_listing_id IS NOT NULL THEN
        DELETE FROM booking_status_history WHERE booking_id IN (SELECT id FROM booking WHERE listing_id = v_test_listing_id);
        DELETE FROM booking WHERE listing_id = v_test_listing_id;
        DELETE FROM listing_cargo WHERE listing_id = v_test_listing_id;
        DELETE FROM capacity_listing WHERE id = v_test_listing_id;
        RAISE NOTICE 'Cleaned up test listing ID % and all associated test records.', v_test_listing_id;
    END IF;
END $$;
COMMIT;
