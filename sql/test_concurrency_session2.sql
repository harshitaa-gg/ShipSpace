-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: test_concurrency_session2.sql
-- Description: Phase 6E - Concurrency Test: Session 2
--
-- Session 2 Workflow:
--  1. Reads uniquely registered fixture from shipspace.test_concurrency_fixture
--  2. Captures pre-lock MVCC snapshot (status & available_cbm before acquiring lock)
--  3. Simultaneously requests 2.00 CBM on the exact same listing
--  4. Contends on the row-level exclusive lock held by Session 1
--  5. When Session 1 commits, Session 2 unblocks and re-evaluates the committed row
--  6. Since Session 1 committed 2.00 CBM (setting available_cbm = 0.00 and status = 'full'),
--     Session 2 is rejected under lock with SQLSTATE 'P0001' because the listing is now
--     'full' ("Listing <id> is not open for booking (current status: full)") or has
--     insufficient available CBM ("Insufficient available CBM on listing <id>: ...")
--  7. Control flow isolates the call: unexpected success is evaluated OUTSIDE
--     the exception-catching block so it cannot trigger a false PASS
--  8. Verifies PostgreSQL SQLSTATE 'P0001' and genuine fixture-specific rejection message
--  9. Persists independent proof of Session 2 rejection (outcome, SQLSTATE, error) in registry
--
-- Target Database: shipspace_test_phase5 (NEVER shipspace_db)
-- Dialect: PostgreSQL (14+)
-- ============================================================================

\set ON_ERROR_STOP on
SET search_path TO shipspace, public;

\echo '===================================================================='
\echo '[SESSION 2] STARTING CONCURRENT BOOKING ATTEMPT'
\echo '===================================================================='

DO $$
DECLARE
    v_listing_id      BIGINT;
    v_trader2_id      BIGINT;
    v_cargo_type_id   BIGINT;
    v_booking_id      BIGINT;
    v_pre_lock_status VARCHAR(20);
    v_pre_lock_cbm    NUMERIC(10, 2);
    v_wait_start      TIMESTAMPTZ;
    v_wait_ms         NUMERIC(12, 2);
    v_succeeded       BOOLEAN := false;
    v_caught_sqlstate TEXT := NULL;
    v_caught_message  TEXT := NULL;
    v_outcome         TEXT := NULL;
BEGIN
    -- 1. Uniquely identify target test fixture
    SELECT listing_id, trader2_id, cargo_type_id
    INTO v_listing_id, v_trader2_id, v_cargo_type_id
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

    -- Capture visible MVCC snapshot prior to acquiring row lock
    SELECT status, available_cbm
    INTO v_pre_lock_status, v_pre_lock_cbm
    FROM capacity_listing
    WHERE id = v_listing_id;

    RAISE NOTICE '[SESSION 2] Pre-lock visible snapshot on Listing ID %: status = %, available_cbm = %',
        v_listing_id, v_pre_lock_status, v_pre_lock_cbm;
    RAISE NOTICE '[SESSION 2] Attempting simultaneous booking for 2.00 CBM on Listing ID % (Trader ID %)...',
        v_listing_id, v_trader2_id;
    RAISE NOTICE '[SESSION 2] Contending for row lock held by Session 1 (will block until Session 1 commits)...';

    v_wait_start := clock_timestamp();

    -- 2. Attempt booking under lock in an isolated evaluation block
    BEGIN
        CALL sp_create_booking(
            v_trader2_id,
            v_listing_id,
            v_cargo_type_id,
            2.00,  -- booked_cbm
            1.00,  -- booked_weight
            v_booking_id
        );
        -- Marked ONLY if sp_create_booking returns without error
        v_succeeded := true;
    EXCEPTION
        WHEN OTHERS THEN
            v_caught_sqlstate := SQLSTATE;
            v_caught_message  := SQLERRM;
    END;

    v_wait_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_wait_start)) * 1000.0)::numeric, 2);

    -- 3. Check for unexpected success OUTSIDE the exception-catching block
    IF v_succeeded THEN
        RAISE EXCEPTION 'CRITICAL TEST FAILURE: Session 2 unexpectedly created booking ID %! Overbooking occurred!', v_booking_id;
    END IF;

    -- 4. Classify genuine database rejection for this specific fixture listing
    IF v_caught_sqlstate = 'P0001' THEN
        IF v_caught_message LIKE ('Listing ' || v_listing_id || ' is not open for booking (current status: full)%') THEN
            v_outcome := 'REJECTED_LISTING_FULL';
        ELSIF v_caught_message LIKE ('Insufficient available CBM on listing ' || v_listing_id || ':%') THEN
            v_outcome := 'REJECTED_INSUFFICIENT_CBM';
        END IF;
    END IF;

    -- 5. Verify that the caught exception specifically matches an expected capacity/full rejection
    IF v_outcome IS NULL THEN
        -- Propagate any unrelated error to terminate test with failure
        RAISE EXCEPTION 'TEST FAILURE: Session 2 failed with unexpected error: SQLSTATE % | Message: %',
            COALESCE(v_caught_sqlstate, 'NONE'), COALESCE(v_caught_message, 'NONE');
    END IF;

    -- 6. Record outcome and overlap telemetry in the registry table
    UPDATE shipspace.test_concurrency_fixture
    SET session2_result          = v_outcome,
        session2_sqlstate        = v_caught_sqlstate,
        session2_error           = v_caught_message,
        session2_pre_lock_status = v_pre_lock_status,
        session2_pre_lock_cbm    = v_pre_lock_cbm,
        session2_lock_wait_ms    = v_wait_ms
    WHERE fixture_key = 'PHASE_6E_CONCURRENCY';

    -- 7. Enforce that Session 2 genuinely overlapped and waited on Session 1's active transaction lock
    IF v_pre_lock_status <> 'open' OR v_pre_lock_cbm <> 2.00 OR v_wait_ms < 500 THEN
        RAISE EXCEPTION 'CONCURRENCY OVERLAP FAILURE: Session 2 was rejected (%), but sessions did NOT overlap! Pre-lock snapshot was status=%, available_cbm=% (expected open, 2.00) and lock wait was % ms (expected >= 500 ms while blocked by Session 1). Re-run setup, start Session 1, and start Session 2 while Session 1 is waiting.',
            v_outcome, v_pre_lock_status, v_pre_lock_cbm, v_wait_ms;
    END IF;

    RAISE NOTICE '--------------------------------------------------------------------';
    RAISE NOTICE '[SESSION 2] EXPECTED TEST OUTCOME: Booking correctly rejected under lock.';
    RAISE NOTICE '[SESSION 2] Pre-Lock Snapshot: status = %, available_cbm = % | Lock Wait: % ms',
        v_pre_lock_status, v_pre_lock_cbm, v_wait_ms;
    RAISE NOTICE '[SESSION 2] Recorded Outcome: % (SQLSTATE %)', v_outcome, v_caught_sqlstate;
    RAISE NOTICE '[SESSION 2] Database Error Caught: %', v_caught_message;
    RAISE NOTICE '[SESSION 2] CONCURRENCY OVERLAP & SAFETY VERIFIED (PASS): Overbooking prevented.';
    RAISE NOTICE '--------------------------------------------------------------------';
END $$;

\echo '===================================================================='
\echo '[SESSION 2] TEST COMPLETED: CONCURRENCY PROTECTION CONFIRMED (PASS)'
\echo '===================================================================='
