-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: test_concurrency_session2.sql
-- Description: Phase 6E - Concurrency Test: Session 2
-- Simultaneously attempts to book 2.00 CBM on the same listing.
-- Blocks on Session 1's lock, wakes up upon commit, and fails due to 0 CBM.
-- Dialect: PostgreSQL (14+)
-- ============================================================================

\set ON_ERROR_STOP on
SET search_path TO shipspace, public;

\echo '========================================================'
\echo '[SESSION 2] Starting transaction...'
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

    -- Use a different trader
    SELECT id INTO v_trader_id FROM trader ORDER BY id DESC LIMIT 1;
    SELECT cargo_type_id INTO v_cargo_id FROM listing_cargo WHERE listing_id = v_listing_id LIMIT 1;

    RAISE NOTICE '[SESSION 2] Requesting 2.00 CBM via sp_create_booking on listing %...', v_listing_id;
    RAISE NOTICE '[SESSION 2] Waiting for exclusive lock on listing %...', v_listing_id;
    CALL sp_create_booking(v_trader_id, v_listing_id, v_cargo_id, 2.00, 1.00, v_booking_id);
    RAISE NOTICE '[SESSION 2] UNEXPECTED: Booking ID % created!', v_booking_id;
END $$;

COMMIT;

\echo '========================================================'
\echo '[SESSION 2] Finished.'
\echo '========================================================'
