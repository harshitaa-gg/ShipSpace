-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: test_concurrency_session1.sql
-- Description: Phase 6E - Concurrency Test: Session 1
-- Attempts to book 2.00 CBM, locks the row, sleeps 5s, then commits.
-- Dialect: PostgreSQL (14+)
-- ============================================================================

\set ON_ERROR_STOP on
SET search_path TO shipspace, public;

\echo '========================================================'
\echo '[SESSION 1] Starting transaction...'
\echo '========================================================'

BEGIN;

DO $$
DECLARE
    v_listing_id BIGINT;
    v_trader_id  BIGINT;
    v_cargo_id   BIGINT;
    v_booking_id BIGINT;
BEGIN
    SELECT id INTO v_listing_id
    FROM capacity_listing
    WHERE departure_date = CURRENT_DATE + INTERVAL '99 days';

    IF v_listing_id IS NULL THEN
        RAISE EXCEPTION 'Test listing not found! Run test_concurrency_setup.sql first.';
    END IF;

    SELECT id INTO v_trader_id FROM trader ORDER BY id ASC LIMIT 1;
    SELECT cargo_type_id INTO v_cargo_id FROM listing_cargo WHERE listing_id = v_listing_id LIMIT 1;

    RAISE NOTICE '[SESSION 1] Requesting 2.00 CBM via sp_create_booking on listing %...', v_listing_id;
    CALL sp_create_booking(v_trader_id, v_listing_id, v_cargo_id, 2.00, 1.00, v_booking_id);
    RAISE NOTICE '[SESSION 1] SUCCESS: Booking ID % created under row lock.', v_booking_id;
    RAISE NOTICE '[SESSION 1] Holding lock for 5 seconds to demonstrate concurrency serialization...';
END $$;

-- Hold lock so Session 2 contends and waits
SELECT pg_sleep(5);

COMMIT;

\echo '========================================================'
\echo '[SESSION 1] Committed successfully.'
\echo '========================================================'
