-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: test_concurrency_verify.sql
-- Description: Phase 6E - Concurrency Test Verification & Safe Teardown
--
-- Verification Checklist:
--  1. Asserts target fixture uniquely resolves to exactly one capacity listing
--  2. Asserts available_cbm is exactly 0.00 and never negative (>= 0)
--  3. Asserts available_weight is exactly 4.00 (5.00 - 1.00) and never negative
--  4. Asserts listing status transitioned to 'full'
--  5. Loads session1_booking_id from registry and asserts the only booking on the
--     fixture listing has exactly that ID, belongs to trader1_id, and has the
--     expected status ('confirmed') and quantities (2.00 CBM / 1.00 t)
--  6. Asserts confirmed booking belongs strictly to Session 1 trader (trader1_id)
--  7. Asserts booking status is 'confirmed' with reserved quantities 2.00 CBM / 1.00 t
--  8. Asserts booking lifecycle status history recorded initial confirmation
--  9. Independently proves Session 2 rejection: validates persisted error outcome
--     (session2_result IN ('REJECTED_LISTING_FULL', 'REJECTED_INSUFFICIENT_CBM'),
--     SQLSTATE 'P0001', genuine fixture error message, and 0 bookings by trader2_id)
-- 10. Asserts genuine two-session overlap & lock contention evidence:
--     session1_saw_waiter = true, session2_pre_lock_status = 'open',
--     session2_pre_lock_cbm = 2.00, and session2_lock_wait_ms >= 500
-- 11. Conditional Teardown: If ANY assertion fails, execution aborts and the
--     fixture is preserved for diagnosis. Teardown executes only after 100% pass.
-- 12. Preserves seed data: validates all entity relationships, ownership flags, and
--     unrelated dependencies before the first DELETE, deletes only verified records
--     where created_* ownership flags are true, and checks named seed entities.
--
-- Target Database: shipspace_test_phase5 (NEVER shipspace_db)
-- Dialect: PostgreSQL (14+)
-- ============================================================================

\set ON_ERROR_STOP on
SET search_path TO shipspace, public;

\echo '===================================================================='
\echo 'PHASE 6E CONCURRENCY TEST VERIFICATION & AUDIT'
\echo '===================================================================='

-- Create temporary table to collect assertion results
CREATE TEMP TABLE IF NOT EXISTS temp_concurrency_results (
    assertion_id TEXT,
    description  TEXT,
    status       TEXT,
    details      TEXT
);
TRUNCATE temp_concurrency_results;

DO $$
DECLARE
    v_rec            shipspace.test_concurrency_fixture%ROWTYPE;
    v_reg_count      INT;
    v_listing_count  INT;
    v_avail_cbm      NUMERIC(10, 2);
    v_avail_wt       NUMERIC(10, 2);
    v_listing_stat   VARCHAR(20);
    v_booking_count  INT;
    v_booking_id     BIGINT;
    v_booking_trader BIGINT;
    v_booking_stat   VARCHAR(20);
    v_booked_cbm     NUMERIC(10, 2);
    v_booked_wt      NUMERIC(10, 2);
    v_hist_count     INT;
    v_t2_bk_count    INT;
BEGIN
    -- 1. Resolve registered fixture
    SELECT count(*) INTO v_reg_count
    FROM shipspace.test_concurrency_fixture
    WHERE fixture_key = 'PHASE_6E_CONCURRENCY';

    IF v_reg_count <> 1 THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 1', 'Registry uniquely resolves to exactly one test fixture', 'FAIL', 'Found ' || v_reg_count || ' fixture records');
        RETURN;
    END IF;

    SELECT * INTO v_rec
    FROM shipspace.test_concurrency_fixture
    WHERE fixture_key = 'PHASE_6E_CONCURRENCY';

    -- Check listing existence and count
    SELECT count(*), min(available_cbm), min(available_weight), min(status)
    INTO v_listing_count, v_avail_cbm, v_avail_wt, v_listing_stat
    FROM capacity_listing
    WHERE id = v_rec.listing_id;

    IF v_listing_count = 1 THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 1', 'Registry uniquely resolves to exactly one test fixture', 'PASS', 'Resolved Listing ID ' || v_rec.listing_id);
    ELSE
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 1', 'Registry uniquely resolves to exactly one test fixture', 'FAIL', 'Found ' || v_listing_count || ' listings for ID ' || v_rec.listing_id);
    END IF;

    -- 2. Available CBM is exactly 0.00
    IF v_avail_cbm = 0.00 THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 2', 'Available CBM is exactly exhausted to 0.00 and never negative', 'PASS', 'available_cbm = 0.00 (>= 0 invariant holds)');
    ELSE
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 2', 'Available CBM is exactly exhausted to 0.00 and never negative', 'FAIL', 'available_cbm = ' || COALESCE(v_avail_cbm::text, 'NULL') || ' (Expected: 0.00)');
    END IF;

    -- 3. Available weight decremented to exactly 4.00
    IF v_avail_wt = 4.00 THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 3', 'Available weight accurately decremented to 4.00 (5.00 - 1.00)', 'PASS', 'available_weight = 4.00 (>= 0 invariant holds)');
    ELSE
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 3', 'Available weight accurately decremented to 4.00 (5.00 - 1.00)', 'FAIL', 'available_weight = ' || COALESCE(v_avail_wt::text, 'NULL') || ' (Expected: 4.00)');
    END IF;

    -- 4. Listing status transitioned to 'full'
    IF v_listing_stat = 'full' THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 4', 'Capacity listing status transitioned to "full"', 'PASS', 'status = full');
    ELSE
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 4', 'Capacity listing status transitioned to "full"', 'FAIL', 'status = ' || COALESCE(v_listing_stat, 'NULL') || ' (Expected: full)');
    END IF;

    -- Query booking state on this listing
    SELECT count(*), min(id), min(trader_id), min(status), min(booked_cbm), min(booked_weight)
    INTO v_booking_count, v_booking_id, v_booking_trader, v_booking_stat, v_booked_cbm, v_booked_wt
    FROM booking
    WHERE listing_id = v_rec.listing_id;

    -- 5. Explicit check: verify single booking matches session1_booking_id loaded from registry
    IF v_rec.session1_booking_id IS NULL THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 5', 'Loaded session1_booking_id from registry and matched single booking', 'FAIL', 'session1_booking_id is NULL in registry');
    ELSIF v_booking_count <> 1 THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 5', 'Loaded session1_booking_id from registry and matched single booking', 'FAIL', 'Found ' || v_booking_count || ' bookings (Expected exactly 1)');
    ELSIF v_booking_id <> v_rec.session1_booking_id THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 5', 'Loaded session1_booking_id from registry and matched single booking', 'FAIL', 'Booking ID ' || v_booking_id || ' does not match session1_booking_id ' || v_rec.session1_booking_id);
    ELSIF v_booking_trader <> v_rec.trader1_id THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 5', 'Loaded session1_booking_id from registry and matched single booking', 'FAIL', 'trader_id ' || v_booking_trader || ' does not match trader1_id ' || v_rec.trader1_id);
    ELSIF v_booking_stat <> 'confirmed' THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 5', 'Loaded session1_booking_id from registry and matched single booking', 'FAIL', 'status is ' || v_booking_stat || ' (Expected confirmed)');
    ELSIF v_booked_cbm <> 2.00 OR v_booked_wt <> 1.00 THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 5', 'Loaded session1_booking_id from registry and matched single booking', 'FAIL', 'quantities cbm=' || v_booked_cbm || ', wt=' || v_booked_wt || ' (Expected 2.00 / 1.00)');
    ELSE
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 5', 'Loaded session1_booking_id from registry and matched single booking', 'PASS', 'Booking ID ' || v_booking_id || ' matches session1_booking_id, trader matches trader1_id, confirmed, 2.00 CBM / 1.00 t');
    END IF;

    -- 6. Booking trader belongs strictly to Session 1 trader
    IF v_booking_trader = v_rec.trader1_id THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 6', 'Confirmed booking belongs strictly to Session 1 trader', 'PASS', 'trader_id = ' || v_booking_trader || ' (matches Session 1 trader1_id)');
    ELSE
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 6', 'Confirmed booking belongs strictly to Session 1 trader', 'FAIL', 'trader_id = ' || COALESCE(v_booking_trader::text, 'NULL') || ' (Expected Session 1: ' || v_rec.trader1_id || ')');
    END IF;

    -- 7. Booking status is 'confirmed' with 2.00 CBM / 1.00 t
    IF v_booking_stat = 'confirmed' AND v_booked_cbm = 2.00 AND v_booked_wt = 1.00 THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 7', 'Booking confirmed with exact reserved quantities (2.00 CBM / 1.00 t)', 'PASS', 'status = confirmed, booked_cbm = 2.00, booked_wt = 1.00');
    ELSE
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 7', 'Booking confirmed with exact reserved quantities (2.00 CBM / 1.00 t)', 'FAIL', 'status = ' || COALESCE(v_booking_stat, 'NULL') || ', cbm = ' || COALESCE(v_booked_cbm::text, 'NULL') || ', wt = ' || COALESCE(v_booked_wt::text, 'NULL'));
    END IF;

    -- 8. Audit history recorded initial confirmation
    SELECT count(*)
    INTO v_hist_count
    FROM booking_status_history
    WHERE booking_id = v_booking_id AND new_status = 'confirmed';

    IF v_hist_count >= 1 THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 8', 'Booking lifecycle status history recorded initial confirmation', 'PASS', 'Found ' || v_hist_count || ' audit record(s) for booking ' || v_booking_id);
    ELSE
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 8', 'Booking lifecycle status history recorded initial confirmation', 'FAIL', 'No audit history record found');
    END IF;

    -- 9. Independently prove Session 2 rejection was recorded and Trader 2 created 0 bookings
    SELECT count(*)
    INTO v_t2_bk_count
    FROM booking
    WHERE listing_id = v_rec.listing_id AND trader_id = v_rec.trader2_id;

    IF v_t2_bk_count = 0
       AND v_rec.session2_sqlstate = 'P0001'
       AND (
           (v_rec.session2_result = 'REJECTED_LISTING_FULL'
            AND v_rec.session2_error LIKE ('Listing ' || v_rec.listing_id || ' is not open for booking (current status: full)%'))
           OR
           (v_rec.session2_result = 'REJECTED_INSUFFICIENT_CBM'
            AND v_rec.session2_error LIKE ('Insufficient available CBM on listing ' || v_rec.listing_id || ':%'))
       )
    THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 9', 'Session 2 rejection independently verified from recorded outcome', 'PASS',
             'Outcome: ' || v_rec.session2_result || ' (SQLSTATE ' || v_rec.session2_sqlstate || ') | Error: ' || v_rec.session2_error);
    ELSE
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 9', 'Session 2 rejection independently verified from recorded outcome', 'FAIL',
             'Recorded outcome: ' || COALESCE(v_rec.session2_result, 'NONE') ||
             ' (SQLSTATE ' || COALESCE(v_rec.session2_sqlstate, 'NONE') ||
             ', Trader2 bookings: ' || v_t2_bk_count ||
             ', Error: ' || COALESCE(v_rec.session2_error, 'NONE') || ')');
    END IF;

    -- 10. Verify genuine two-session overlap & lock contention evidence
    IF v_rec.session1_saw_waiter IS TRUE
       AND v_rec.session2_pre_lock_status = 'open'
       AND v_rec.session2_pre_lock_cbm = 2.00
       AND v_rec.session2_lock_wait_ms >= 500
    THEN
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 10', 'Sessions overlapped concurrently under row lock (waiter & pre-lock snapshot verified)', 'PASS',
             'session1_saw_waiter = true, pre_lock = (open, 2.00 CBM), lock_wait_ms = ' || v_rec.session2_lock_wait_ms || ' ms');
    ELSE
        INSERT INTO temp_concurrency_results VALUES
            ('ASSERTION 10', 'Sessions overlapped concurrently under row lock (waiter & pre-lock snapshot verified)', 'FAIL',
             'session1_saw_waiter = ' || COALESCE(v_rec.session1_saw_waiter::text, 'NULL') ||
             ', pre_lock_status = ' || COALESCE(v_rec.session2_pre_lock_status, 'NULL') ||
             ', pre_lock_cbm = ' || COALESCE(v_rec.session2_pre_lock_cbm::text, 'NULL') ||
             ', lock_wait_ms = ' || COALESCE(v_rec.session2_lock_wait_ms::text, 'NULL') || ' ms (Expected >= 500 ms)');
    END IF;

END $$;

-- Display assertion results table
SELECT
    assertion_id AS "Assertion",
    description  AS "Test Requirement",
    status       AS "Result",
    details      AS "Details"
FROM temp_concurrency_results
ORDER BY SUBSTRING(assertion_id FROM 11)::int;

-- Guard check: Abort and preserve fixture if any assertion did not PASS
DO $$
DECLARE
    v_fail_count INT;
BEGIN
    SELECT count(*) INTO v_fail_count
    FROM temp_concurrency_results
    WHERE status <> 'PASS';

    IF v_fail_count > 0 THEN
        RAISE EXCEPTION 'CONCURRENCY VERIFICATION FAILED: % assertion(s) failed. Fixture retained for diagnosis.', v_fail_count;
    END IF;

    RAISE NOTICE '--------------------------------------------------------------------';
    RAISE NOTICE '>> ALL % CONCURRENCY ASSERTIONS PASSED SUCCESSFULLY <<',
        (SELECT count(*) FROM temp_concurrency_results);
    RAISE NOTICE '--------------------------------------------------------------------';
END $$;

-- ----------------------------------------------------------------------------
-- Safe Teardown: Executed ONLY after all assertions pass
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
    v_rec            shipspace.test_concurrency_fixture%ROWTYPE;
    v_seed_prov_cnt  INT;
    v_seed_trad_cnt  INT;
    v_seed_port_cnt  INT;
    v_seed_list_cnt  INT;
BEGIN
    SELECT * INTO v_rec
    FROM shipspace.test_concurrency_fixture
    WHERE fixture_key = 'PHASE_6E_CONCURRENCY';

    IF v_rec.listing_id IS NOT NULL THEN
        -- Validate all entity relationships, ownership flags, and unrelated dependencies BEFORE first DELETE
        IF v_rec.provider_id IS NULL OR v_rec.trader1_id IS NULL OR v_rec.trader2_id IS NULL
           OR v_rec.port_origin_id IS NULL OR v_rec.port_dest_id IS NULL
           OR v_rec.route_id IS NULL OR v_rec.cargo_type_id IS NULL
           OR v_rec.created_provider IS NULL OR v_rec.created_trader1 IS NULL
           OR v_rec.created_trader2 IS NULL OR v_rec.created_port_origin IS NULL
           OR v_rec.created_port_dest IS NULL OR v_rec.created_route IS NULL
           OR v_rec.created_listing IS NULL THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: Incomplete ownership metadata on fixture! Halting before first DELETE.';
        END IF;

        IF NOT v_rec.created_listing THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: created_listing is false for listing ID %! Refusing to delete unmanaged listing.',
                v_rec.listing_id;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM capacity_listing
            WHERE id = v_rec.listing_id AND provider_id = v_rec.provider_id AND route_id = v_rec.route_id
        ) THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: Listing ID % does not match registered provider ID % and route ID %! Halting before first DELETE.',
                v_rec.listing_id, v_rec.provider_id, v_rec.route_id;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM listing_cargo
            WHERE listing_id = v_rec.listing_id AND cargo_type_id = v_rec.cargo_type_id
        ) OR (SELECT count(*) FROM listing_cargo WHERE listing_id = v_rec.listing_id) <> 1 THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: Listing ID % cargo association does not match cargo_type_id %! Halting before first DELETE.',
                v_rec.listing_id, v_rec.cargo_type_id;
        END IF;

        IF EXISTS (
            SELECT 1 FROM booking
            WHERE listing_id = v_rec.listing_id
              AND trader_id NOT IN (v_rec.trader1_id, v_rec.trader2_id)
        ) THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: Listing ID % has bookings from an unrelated trader! Halting before first DELETE.',
                v_rec.listing_id;
        END IF;

        IF v_rec.created_route AND EXISTS (
            SELECT 1 FROM capacity_listing WHERE route_id = v_rec.route_id AND id <> v_rec.listing_id
        ) THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: Route ID % is referenced by another listing! Halting before first DELETE.',
                v_rec.route_id;
        END IF;

        IF v_rec.created_port_origin AND EXISTS (
            SELECT 1 FROM route
            WHERE (origin_port_id = v_rec.port_origin_id OR destination_port_id = v_rec.port_origin_id)
              AND id <> v_rec.route_id
        ) THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: Origin port ID % is referenced by another route! Halting before first DELETE.',
                v_rec.port_origin_id;
        END IF;

        IF v_rec.created_port_dest AND EXISTS (
            SELECT 1 FROM route
            WHERE (origin_port_id = v_rec.port_dest_id OR destination_port_id = v_rec.port_dest_id)
              AND id <> v_rec.route_id
        ) THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: Destination port ID % is referenced by another route! Halting before first DELETE.',
                v_rec.port_dest_id;
        END IF;

        IF v_rec.created_trader1 AND EXISTS (
            SELECT 1 FROM booking WHERE trader_id = v_rec.trader1_id AND listing_id <> v_rec.listing_id
        ) THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: Trader 1 (ID %) has bookings on another listing! Halting before first DELETE.',
                v_rec.trader1_id;
        END IF;

        IF v_rec.created_trader2 AND EXISTS (
            SELECT 1 FROM booking WHERE trader_id = v_rec.trader2_id AND listing_id <> v_rec.listing_id
        ) THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: Trader 2 (ID %) has bookings on another listing! Halting before first DELETE.',
                v_rec.trader2_id;
        END IF;

        IF v_rec.created_provider AND EXISTS (
            SELECT 1 FROM capacity_listing WHERE provider_id = v_rec.provider_id AND id <> v_rec.listing_id
        ) THEN
            RAISE EXCEPTION 'TEARDOWN SAFETY GUARD: Provider (ID %) owns another listing! Halting before first DELETE.',
                v_rec.provider_id;
        END IF;

        -- 1. Remove audit history for test booking
        DELETE FROM booking_status_history
        WHERE booking_id IN (SELECT id FROM booking WHERE listing_id = v_rec.listing_id);

        -- 2. Remove test booking
        DELETE FROM booking WHERE listing_id = v_rec.listing_id;

        -- 3. Remove test listing cargo association
        DELETE FROM listing_cargo WHERE listing_id = v_rec.listing_id;

        -- 4. Remove test listing
        DELETE FROM capacity_listing WHERE id = v_rec.listing_id;

        -- 5. Remove route ONLY IF created by this test
        IF v_rec.created_route THEN
            DELETE FROM route WHERE id = v_rec.route_id;
        END IF;

        -- 6. Remove origin port ONLY IF created by this test
        IF v_rec.created_port_origin THEN
            DELETE FROM port WHERE id = v_rec.port_origin_id;
        END IF;

        -- 7. Remove destination port ONLY IF created by this test
        IF v_rec.created_port_dest THEN
            DELETE FROM port WHERE id = v_rec.port_dest_id;
        END IF;

        -- 8. Remove traders ONLY IF created by this test
        IF v_rec.created_trader1 THEN
            DELETE FROM trader WHERE id = v_rec.trader1_id;
            DELETE FROM user_account WHERE id = v_rec.trader1_id;
        END IF;

        IF v_rec.created_trader2 THEN
            DELETE FROM trader WHERE id = v_rec.trader2_id;
            DELETE FROM user_account WHERE id = v_rec.trader2_id;
        END IF;

        -- 9. Remove provider ONLY IF created by this test
        IF v_rec.created_provider THEN
            DELETE FROM provider WHERE id = v_rec.provider_id;
            DELETE FROM user_account WHERE id = v_rec.provider_id;
        END IF;

        -- 10. Remove registry entry
        DELETE FROM shipspace.test_concurrency_fixture WHERE fixture_key = 'PHASE_6E_CONCURRENCY';

        RAISE NOTICE 'Teardown complete: Safely removed only verified test-created entities.';
    END IF;

    -- 11. Rigorous Seed Data Integrity Verification (Specific named entity validation)
    -- Check specific core seed providers
    SELECT count(*) INTO v_seed_prov_cnt
    FROM user_account
    WHERE email IN (
        'ops.india@maersk-lcl.com', 'bookings@msc-logistics.in',
        'lcl.sea@cma-cgm-india.com', 'capacity@hapag-ocean.de',
        'space.desk@one-line.sg', 'ocean@bluedart-global.com'
    );
    IF v_seed_prov_cnt <> 6 THEN
        RAISE EXCEPTION 'SEED DATA INTEGRITY FAILURE: Missing core seed providers (found % of 6)!', v_seed_prov_cnt;
    END IF;

    -- Check specific seed traders
    SELECT count(*) INTO v_seed_trad_cnt
    FROM user_account
    WHERE email IN (
        'shipping@aaravtextiles.in', 'logistics@bharatauto.com',
        'export@coromandelagro.com', 'dispatch@deccanpharma.in',
        'sea.logistics@starretail.in'
    );
    IF v_seed_trad_cnt <> 5 THEN
        RAISE EXCEPTION 'SEED DATA INTEGRITY FAILURE: Missing sampled seed traders (found % of 5)!', v_seed_trad_cnt;
    END IF;

    -- Check all 12 reference seaports seeded in sql/02_seed_data.sql
    SELECT count(*) INTO v_seed_port_cnt
    FROM port
    WHERE un_locode IN (
        'INNSA', 'INMUN', 'INMAA', 'INTUT', 'INCCU', 'SGSIN',
        'AEJEA', 'LKCMB', 'CNSHA', 'NLRTM', 'DEHAM', 'USLAX'
    );
    IF v_seed_port_cnt <> 12 THEN
        RAISE EXCEPTION 'SEED DATA INTEGRITY FAILURE: Missing core seed ports (found % of 12)!', v_seed_port_cnt;
    END IF;

    -- Check seed listings baseline
    SELECT count(*) INTO v_seed_list_cnt FROM capacity_listing;
    IF v_seed_list_cnt < 40 THEN
        RAISE EXCEPTION 'SEED DATA INTEGRITY FAILURE: Unexpectedly low seed listings count (%)!', v_seed_list_cnt;
    END IF;

    RAISE NOTICE 'Seed integrity check: All named seed providers (6), traders (5 sampled), ports (12), and listings (% total) verified intact.', v_seed_list_cnt;
END $$;
COMMIT;

\echo '===================================================================='
\echo 'PHASE 6E CONCURRENCY TEST: FULLY VERIFIED AND CLEANED UP'
\echo '===================================================================='
