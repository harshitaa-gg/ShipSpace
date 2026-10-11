-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: test_concurrency_session1.sql
-- Description: Phase 6E - Concurrency Test: Session 1
--
-- Session 1 Workflow:
--  1. Reads uniquely registered fixture from shipspace.test_concurrency_fixture
--  2. Begins transaction and verifies initial fixture state (status = 'open', 2.00 CBM)
--  3. Invokes sp_create_booking() requesting 2.00 CBM and 1.00 tonnes
--  4. Acquires and holds the row-level exclusive lock on capacity_listing
--  5. Polls pg_locks (up to 90s) until Session 2 is actively blocked on Session 1's lock
--  6. Once Session 2 lock contention is confirmed, holds lock for 2.0s so Session 2
--     records a clear, measurable lock-wait duration, records session1_booking_id and
--     session1_saw_waiter = true in the registry, and commits
--  7. If Session 2 does not contend within 90s, raises an exception and rolls back
--     cleanly so non-overlapping runs are never accepted as passes
--
-- Target Database: shipspace_test_phase5 (NEVER shipspace_db)
-- Dialect: PostgreSQL (14+)
-- ============================================================================

\set ON_ERROR_STOP on
SET search_path TO shipspace, public;

\echo '===================================================================='
\echo '[SESSION 1] STARTING TRANSACTION & BOOKING RESERVATION'
\echo '===================================================================='

BEGIN;

DO $$
DECLARE
    v_listing_id    BIGINT;
    v_trader1_id    BIGINT;
    v_cargo_type_id BIGINT;
    v_init_status   VARCHAR(20);
    v_init_cbm      NUMERIC(10, 2);
    v_booking_id    BIGINT;
    v_saw_waiter    BOOLEAN := false;
    v_i             INT;
BEGIN
    -- 1. Uniquely identify target test fixture
    SELECT listing_id, trader1_id, cargo_type_id
    INTO v_listing_id, v_trader1_id, v_cargo_type_id
    FROM shipspace.test_concurrency_fixture
    WHERE fixture_key = 'PHASE_6E_CONCURRENCY';

    IF v_listing_id IS NULL THEN
        RAISE EXCEPTION 'Fixture "PHASE_6E_CONCURRENCY" not found in registry! Run sql/test_concurrency_setup.sql first.';
    END IF;

    -- Safety check: Ensure listing belongs to test provider
    IF NOT EXISTS (
        SELECT 1 FROM capacity_listing cl
        JOIN user_account u ON cl.provider_id = u.id
        WHERE cl.id = v_listing_id AND u.email = 'test.concurrency.provider@shipspace.test'
    ) THEN
        RAISE EXCEPTION 'Safety check failed: listing ID % is not the dedicated concurrency test fixture!', v_listing_id;
    END IF;

    -- Verify fixture is in fresh initial state before acquiring lock
    SELECT status, available_cbm
    INTO v_init_status, v_init_cbm
    FROM capacity_listing
    WHERE id = v_listing_id;

    IF v_init_status <> 'open' OR v_init_cbm <> 2.00 THEN
        RAISE EXCEPTION 'Fixture listing ID % is not in initial test state (status=%, available_cbm=%). Run sql/test_concurrency_setup.sql first to reset the fixture.',
            v_listing_id, v_init_status, v_init_cbm;
    END IF;

    RAISE NOTICE '[SESSION 1] Requesting 2.00 CBM on Listing ID % for Trader ID %...', v_listing_id, v_trader1_id;

    -- 2. Execute transactional booking (acquires SELECT ... FOR UPDATE on capacity_listing)
    CALL sp_create_booking(
        v_trader1_id,
        v_listing_id,
        v_cargo_type_id,
        2.00,  -- booked_cbm
        1.00,  -- booked_weight
        v_booking_id
    );

    IF v_booking_id IS NULL THEN
        RAISE EXCEPTION '[SESSION 1] FAILED: sp_create_booking returned null booking ID';
    END IF;

    RAISE NOTICE '--------------------------------------------------------------------';
    RAISE NOTICE '[SESSION 1] SUCCESS: Booking ID % created under exclusive row lock.', v_booking_id;
    RAISE NOTICE '[SESSION 1] Waiting (up to 90 seconds) for Session 2 to contend on the row lock...';
    RAISE NOTICE '[SESSION 1] >>> SWITCH TO TERMINAL 2 NOW, RUN session2, AND ENTER PASSWORD <<<';
    RAISE NOTICE '--------------------------------------------------------------------';

    -- 3. Poll pg_locks until Session 2 is actively blocked by this backend's lock
    FOR v_i IN 1..180 LOOP
        PERFORM pg_stat_clear_snapshot();
        IF EXISTS (
            SELECT 1
            FROM pg_locks
            WHERE NOT granted
              AND pg_backend_pid() = ANY(pg_blocking_pids(pid))
        ) THEN
            v_saw_waiter := true;
            RAISE NOTICE '[SESSION 1] Lock contention confirmed after % s: Session 2 is actively blocked on our row lock!',
                ROUND((v_i * 0.5)::numeric, 1);
            RAISE NOTICE '[SESSION 1] Holding lock for 2.0 more seconds to ensure measurable lock-wait duration...';
            PERFORM pg_sleep(2.0);
            EXIT;
        END IF;
        PERFORM pg_sleep(0.5);
    END LOOP;

    IF NOT v_saw_waiter THEN
        RAISE EXCEPTION '[SESSION 1] CONCURRENCY OVERLAP FAILURE: Session 2 did not contend on the row lock within 90 seconds! Rolling back Session 1 so the fixture remains untouched (2.00 CBM open). Please start Session 2 in Terminal 2 while Session 1 is waiting.';
    END IF;

    -- 4. Record session1_booking_id and overlap proof in fixture registry
    UPDATE shipspace.test_concurrency_fixture
    SET session1_booking_id = v_booking_id,
        session1_saw_waiter = true
    WHERE fixture_key = 'PHASE_6E_CONCURRENCY';
END $$;

-- 5. Commit transaction (releases row lock so Session 2 unblocks)
COMMIT;

\echo '===================================================================='
\echo '[SESSION 1] LOCK CONTENTION CONFIRMED & TRANSACTION COMMITTED'
\echo '===================================================================='
