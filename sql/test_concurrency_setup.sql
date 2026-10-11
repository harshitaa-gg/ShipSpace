-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: test_concurrency_setup.sql
-- Description: Phase 6E - Concurrency Test Fixture Setup
--
-- Robust, ownership-safe fixture initialization:
--  - Creates/manages registry table: shipspace.test_concurrency_fixture
--  - Validates every entity and relationship before attempting any deletion
--  - Verifies listing provider, route, and cargo association match the fixture
--  - Ensures each created_* ownership flag is internally consistent with recorded IDs
--  - Confirms no unrelated dependent rows exist before deleting any created entity
--  - Aborts before the first DELETE if registry ownership info is incomplete or inconsistent
--  - Refuses to silently adopt or reuse reserved entities without valid registry proof
--  - Operates completely transactionally (BEGIN ... COMMIT)
--  - Post-verifies the final fixture: 1 registry row, 1 listing, correct cargo association,
--    2.00 available CBM, 5.00 available weight, and 'open' status
--
-- Target Database: shipspace_test_phase5 (NEVER shipspace_db)
-- Dialect: PostgreSQL (14+)
-- ============================================================================

\set ON_ERROR_STOP on
SET search_path TO shipspace, public;

\echo '===================================================================='
\echo 'PHASE 6E CONCURRENCY TEST SETUP: INITIALIZING ISOLATED FIXTURE'
\echo '===================================================================='

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Create or ensure fixture registry table with ownership tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipspace.test_concurrency_fixture (
    fixture_key              VARCHAR(64) PRIMARY KEY,
    listing_id               BIGINT NOT NULL,
    provider_id              BIGINT NOT NULL,
    trader1_id               BIGINT NOT NULL,
    trader2_id               BIGINT NOT NULL,
    cargo_type_id            BIGINT NOT NULL,
    route_id                 BIGINT NOT NULL,
    port_origin_id           BIGINT NOT NULL,
    port_dest_id             BIGINT NOT NULL,
    created_provider         BOOLEAN NOT NULL DEFAULT false,
    created_trader1          BOOLEAN NOT NULL DEFAULT false,
    created_trader2          BOOLEAN NOT NULL DEFAULT false,
    created_port_origin      BOOLEAN NOT NULL DEFAULT false,
    created_port_dest        BOOLEAN NOT NULL DEFAULT false,
    created_route            BOOLEAN NOT NULL DEFAULT false,
    created_listing          BOOLEAN NOT NULL DEFAULT false,
    session1_booking_id      BIGINT,
    session1_saw_waiter      BOOLEAN,
    session2_result          VARCHAR(50),
    session2_sqlstate        VARCHAR(10),
    session2_error           TEXT,
    session2_pre_lock_status VARCHAR(20),
    session2_pre_lock_cbm    NUMERIC(10, 2),
    session2_lock_wait_ms    NUMERIC(12, 2),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure all columns exist if table predated with fewer columns
ALTER TABLE shipspace.test_concurrency_fixture
    ADD COLUMN IF NOT EXISTS route_id BIGINT,
    ADD COLUMN IF NOT EXISTS port_origin_id BIGINT,
    ADD COLUMN IF NOT EXISTS port_dest_id BIGINT,
    ADD COLUMN IF NOT EXISTS created_provider BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_trader1 BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_trader2 BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_port_origin BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_port_dest BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_route BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_listing BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS session1_booking_id BIGINT,
    ADD COLUMN IF NOT EXISTS session1_saw_waiter BOOLEAN,
    ADD COLUMN IF NOT EXISTS session2_result VARCHAR(50),
    ADD COLUMN IF NOT EXISTS session2_sqlstate VARCHAR(10),
    ADD COLUMN IF NOT EXISTS session2_error TEXT,
    ADD COLUMN IF NOT EXISTS session2_pre_lock_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS session2_pre_lock_cbm NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS session2_lock_wait_ms NUMERIC(12, 2);

-- ----------------------------------------------------------------------------
-- 2. Validate existing state & perform dependency-safe teardown (if any)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_rec               shipspace.test_concurrency_fixture%ROWTYPE;
    v_reg_count         INT;
    v_unmanaged_found   TEXT := '';
    v_dep_count         INT;
    v_route_orig        BIGINT;
    v_route_dest        BIGINT;
BEGIN
    -- Assert at most one matching fixture in registry
    SELECT count(*) INTO v_reg_count
    FROM shipspace.test_concurrency_fixture
    WHERE fixture_key = 'PHASE_6E_CONCURRENCY';

    IF v_reg_count > 1 THEN
        RAISE EXCEPTION 'AMBIGUITY GUARD: Found % fixture records for "PHASE_6E_CONCURRENCY"! Aborting.', v_reg_count;
    END IF;

    IF v_reg_count = 1 THEN
        SELECT * INTO v_rec
        FROM shipspace.test_concurrency_fixture
        WHERE fixture_key = 'PHASE_6E_CONCURRENCY';

        -- --------------------------------------------------------------------
        -- VALIDATION PHASE: Validate ALL entities and relationships BEFORE any DELETE
        -- --------------------------------------------------------------------

        -- Check 1: Incomplete or missing ownership flags
        IF v_rec.created_listing IS NULL OR v_rec.created_provider IS NULL OR
           v_rec.created_trader1 IS NULL OR v_rec.created_trader2 IS NULL OR
           v_rec.created_route IS NULL OR v_rec.created_port_origin IS NULL OR
           v_rec.created_port_dest IS NULL OR v_rec.route_id IS NULL OR
           v_rec.port_origin_id IS NULL OR v_rec.port_dest_id IS NULL OR
           v_rec.listing_id IS NULL OR v_rec.provider_id IS NULL OR
           v_rec.trader1_id IS NULL OR v_rec.trader2_id IS NULL OR
           v_rec.cargo_type_id IS NULL THEN
            RAISE EXCEPTION 'SAFETY GUARD: Older or incomplete registry record detected with missing/NULL identifiers or ownership flags! Cannot establish entity ownership automatically. Manual recovery required: Inspect and drop table shipspace.test_concurrency_fixture after verifying test entities.';
        END IF;

        -- Check 2: created_listing must be true for managed fixtures
        IF NOT v_rec.created_listing THEN
            RAISE EXCEPTION 'SAFETY GUARD: Registry record indicates created_listing = false for listing ID %! Refusing to delete listing not created by this fixture. Manual recovery required.',
                v_rec.listing_id;
        END IF;

        -- Check 3: Registered provider exists and matches dedicated test email
        IF NOT EXISTS (
            SELECT 1 FROM user_account WHERE id = v_rec.provider_id AND email = 'test.concurrency.provider@shipspace.test'
        ) THEN
            RAISE EXCEPTION 'SAFETY GUARD: Registered provider_id % does not match test.concurrency.provider@shipspace.test! Aborting before deletion.',
                v_rec.provider_id;
        END IF;

        -- Check 4: Registered trader 1 exists and matches dedicated test email
        IF NOT EXISTS (
            SELECT 1 FROM user_account WHERE id = v_rec.trader1_id AND email = 'test.concurrency.trader1@shipspace.test'
        ) THEN
            RAISE EXCEPTION 'SAFETY GUARD: Registered trader1_id % does not match test.concurrency.trader1@shipspace.test! Aborting before deletion.',
                v_rec.trader1_id;
        END IF;

        -- Check 5: Registered trader 2 exists and matches dedicated test email
        IF NOT EXISTS (
            SELECT 1 FROM user_account WHERE id = v_rec.trader2_id AND email = 'test.concurrency.trader2@shipspace.test'
        ) THEN
            RAISE EXCEPTION 'SAFETY GUARD: Registered trader2_id % does not match test.concurrency.trader2@shipspace.test! Aborting before deletion.',
                v_rec.trader2_id;
        END IF;

        -- Check 6: Registered ports exist and match UN/LOCODEs
        IF NOT EXISTS (
            SELECT 1 FROM port WHERE id = v_rec.port_origin_id AND un_locode = 'INCC1'
        ) THEN
            RAISE EXCEPTION 'SAFETY GUARD: Registered port_origin_id % does not match INCC1! Aborting before deletion.',
                v_rec.port_origin_id;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM port WHERE id = v_rec.port_dest_id AND un_locode = 'SGCC2'
        ) THEN
            RAISE EXCEPTION 'SAFETY GUARD: Registered port_dest_id % does not match SGCC2! Aborting before deletion.',
                v_rec.port_dest_id;
        END IF;

        -- Check 7: Registered route exists and connects the registered ports
        SELECT origin_port_id, destination_port_id
        INTO v_route_orig, v_route_dest
        FROM route
        WHERE id = v_rec.route_id;

        IF v_route_orig IS NULL THEN
            RAISE EXCEPTION 'SAFETY GUARD: Registered route_id % does not exist in table route! Aborting before deletion.',
                v_rec.route_id;
        END IF;

        IF v_route_orig <> v_rec.port_origin_id OR v_route_dest <> v_rec.port_dest_id THEN
            RAISE EXCEPTION 'SAFETY GUARD: Route ID % ports (% -> %) do not match registered ports (% -> %)! Inconsistent ownership flags. Aborting.',
                v_rec.route_id, v_route_orig, v_route_dest, v_rec.port_origin_id, v_rec.port_dest_id;
        END IF;

        -- Check 8: Listing belongs to the registered provider
        IF NOT EXISTS (
            SELECT 1 FROM capacity_listing
            WHERE id = v_rec.listing_id AND provider_id = v_rec.provider_id
        ) THEN
            RAISE EXCEPTION 'SAFETY GUARD: Listing ID % does NOT belong to registered provider ID %! Aborting before deletion.',
                v_rec.listing_id, v_rec.provider_id;
        END IF;

        -- Check 9: Listing belongs to the registered route
        IF NOT EXISTS (
            SELECT 1 FROM capacity_listing
            WHERE id = v_rec.listing_id AND route_id = v_rec.route_id
        ) THEN
            RAISE EXCEPTION 'SAFETY GUARD: Listing ID % route does NOT match registered route ID %! Aborting before deletion.',
                v_rec.listing_id, v_rec.route_id;
        END IF;

        -- Check 10: Listing cargo association matches registered cargo_type_id
        IF NOT EXISTS (
            SELECT 1 FROM listing_cargo
            WHERE listing_id = v_rec.listing_id AND cargo_type_id = v_rec.cargo_type_id
        ) THEN
            RAISE EXCEPTION 'SAFETY GUARD: Listing ID % cargo association does NOT match registered cargo_type_id %! Aborting before deletion.',
                v_rec.listing_id, v_rec.cargo_type_id;
        END IF;

        -- Check 11: Dependency safety - Ensure no unrelated bookings exist on this listing
        SELECT count(*) INTO v_dep_count
        FROM booking
        WHERE listing_id = v_rec.listing_id
          AND trader_id NOT IN (v_rec.trader1_id, v_rec.trader2_id);

        IF v_dep_count > 0 THEN
            RAISE EXCEPTION 'DEPENDENCY GUARD: Found % booking(s) on listing ID % from unrelated traders! Aborting deletion.',
                v_dep_count, v_rec.listing_id;
        END IF;

        -- Check 12: Dependency safety - If deleting route, ensure no other listings depend on it
        IF v_rec.created_route THEN
            SELECT count(*) INTO v_dep_count
            FROM capacity_listing
            WHERE route_id = v_rec.route_id AND id <> v_rec.listing_id;

            IF v_dep_count > 0 THEN
                RAISE EXCEPTION 'DEPENDENCY GUARD: Found % other listing(s) depending on route ID %! Route cannot be deleted.',
                    v_dep_count, v_rec.route_id;
            END IF;
        END IF;

        -- Check 13: Dependency safety - If deleting origin port, ensure no other routes depend on it
        IF v_rec.created_port_origin THEN
            SELECT count(*) INTO v_dep_count
            FROM route
            WHERE (origin_port_id = v_rec.port_origin_id OR destination_port_id = v_rec.port_origin_id)
              AND id <> v_rec.route_id;

            IF v_dep_count > 0 THEN
                RAISE EXCEPTION 'DEPENDENCY GUARD: Found % other route(s) depending on origin port ID %! Port cannot be deleted.',
                    v_dep_count, v_rec.port_origin_id;
            END IF;
        END IF;

        -- Check 14: Dependency safety - If deleting destination port, ensure no other routes depend on it
        IF v_rec.created_port_dest THEN
            SELECT count(*) INTO v_dep_count
            FROM route
            WHERE (origin_port_id = v_rec.port_dest_id OR destination_port_id = v_rec.port_dest_id)
              AND id <> v_rec.route_id;

            IF v_dep_count > 0 THEN
                RAISE EXCEPTION 'DEPENDENCY GUARD: Found % other route(s) depending on dest port ID %! Port cannot be deleted.',
                    v_dep_count, v_rec.port_dest_id;
            END IF;
        END IF;

        -- Check 15: Dependency safety - If deleting provider, ensure no other listings depend on it
        IF v_rec.created_provider THEN
            SELECT count(*) INTO v_dep_count
            FROM capacity_listing
            WHERE provider_id = v_rec.provider_id AND id <> v_rec.listing_id;

            IF v_dep_count > 0 THEN
                RAISE EXCEPTION 'DEPENDENCY GUARD: Found % other listing(s) depending on provider ID %! Provider cannot be deleted.',
                    v_dep_count, v_rec.provider_id;
            END IF;
        END IF;

        -- Check 16: Dependency safety - If deleting trader1, ensure no other bookings depend on it
        IF v_rec.created_trader1 THEN
            SELECT count(*) INTO v_dep_count
            FROM booking
            WHERE trader_id = v_rec.trader1_id AND listing_id <> v_rec.listing_id;

            IF v_dep_count > 0 THEN
                RAISE EXCEPTION 'DEPENDENCY GUARD: Found % other booking(s) depending on trader1 ID %! Trader cannot be deleted.',
                    v_dep_count, v_rec.trader1_id;
            END IF;
        END IF;

        -- Check 17: Dependency safety - If deleting trader2, ensure no other bookings depend on it
        IF v_rec.created_trader2 THEN
            SELECT count(*) INTO v_dep_count
            FROM booking
            WHERE trader_id = v_rec.trader2_id AND listing_id <> v_rec.listing_id;

            IF v_dep_count > 0 THEN
                RAISE EXCEPTION 'DEPENDENCY GUARD: Found % other booking(s) depending on trader2 ID %! Trader cannot be deleted.',
                    v_dep_count, v_rec.trader2_id;
            END IF;
        END IF;

        -- --------------------------------------------------------------------
        -- EXECUTION PHASE: All checks passed. Safely tear down verified fixture entities.
        -- --------------------------------------------------------------------
        DELETE FROM booking_status_history WHERE booking_id IN (SELECT id FROM booking WHERE listing_id = v_rec.listing_id);
        DELETE FROM booking WHERE listing_id = v_rec.listing_id;
        DELETE FROM listing_cargo WHERE listing_id = v_rec.listing_id;
        DELETE FROM capacity_listing WHERE id = v_rec.listing_id;

        IF v_rec.created_route AND v_rec.route_id IS NOT NULL THEN
            DELETE FROM route WHERE id = v_rec.route_id;
        END IF;

        IF v_rec.created_port_origin AND v_rec.port_origin_id IS NOT NULL THEN
            DELETE FROM port WHERE id = v_rec.port_origin_id;
        END IF;

        IF v_rec.created_port_dest AND v_rec.port_dest_id IS NOT NULL THEN
            DELETE FROM port WHERE id = v_rec.port_dest_id;
        END IF;

        IF v_rec.created_trader1 THEN
            DELETE FROM trader WHERE id = v_rec.trader1_id;
            DELETE FROM user_account WHERE id = v_rec.trader1_id;
        END IF;

        IF v_rec.created_trader2 THEN
            DELETE FROM trader WHERE id = v_rec.trader2_id;
            DELETE FROM user_account WHERE id = v_rec.trader2_id;
        END IF;

        IF v_rec.created_provider THEN
            DELETE FROM provider WHERE id = v_rec.provider_id;
            DELETE FROM user_account WHERE id = v_rec.provider_id;
        END IF;

        DELETE FROM shipspace.test_concurrency_fixture WHERE fixture_key = 'PHASE_6E_CONCURRENCY';
        RAISE NOTICE 'Safe cleanup: Successfully cleaned up registered fixture ID % and verified records.', v_rec.listing_id;

    ELSE
        -- No registry entry exists. Verify that NO reserved test entities exist without registry proof!
        IF EXISTS (SELECT 1 FROM user_account WHERE email = 'test.concurrency.provider@shipspace.test') THEN
            v_unmanaged_found := v_unmanaged_found || ' [user test.concurrency.provider@shipspace.test]';
        END IF;
        IF EXISTS (SELECT 1 FROM user_account WHERE email = 'test.concurrency.trader1@shipspace.test') THEN
            v_unmanaged_found := v_unmanaged_found || ' [user test.concurrency.trader1@shipspace.test]';
        END IF;
        IF EXISTS (SELECT 1 FROM user_account WHERE email = 'test.concurrency.trader2@shipspace.test') THEN
            v_unmanaged_found := v_unmanaged_found || ' [user test.concurrency.trader2@shipspace.test]';
        END IF;
        IF EXISTS (SELECT 1 FROM port WHERE un_locode = 'INCC1') THEN
            v_unmanaged_found := v_unmanaged_found || ' [port INCC1]';
        END IF;
        IF EXISTS (SELECT 1 FROM port WHERE un_locode = 'SGCC2') THEN
            v_unmanaged_found := v_unmanaged_found || ' [port SGCC2]';
        END IF;

        IF v_unmanaged_found <> '' THEN
            RAISE EXCEPTION 'SAFETY GUARD: Reserved test entity already exists without a matching registry record:% Cannot silently adopt unmanaged entities. Manual recovery required: inspect unmanaged rows and remove them if they are stale test artifacts.', v_unmanaged_found;
        END IF;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Create dedicated test entities and record explicit ownership
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_orig_port_id   BIGINT;
    v_dest_port_id   BIGINT;
    v_route_id       BIGINT;
    v_provider_id    BIGINT;
    v_trader1_id     BIGINT;
    v_trader2_id     BIGINT;
    v_cargo_type_id  BIGINT;
    v_listing_id     BIGINT;
BEGIN
    -- Assert that reserved entities do NOT already exist before insertion
    IF EXISTS (SELECT 1 FROM port WHERE un_locode = 'INCC1') THEN
        RAISE EXCEPTION 'SAFETY GUARD: Port INCC1 unexpectedly exists without ownership proof! Aborting.';
    END IF;
    IF EXISTS (SELECT 1 FROM port WHERE un_locode = 'SGCC2') THEN
        RAISE EXCEPTION 'SAFETY GUARD: Port SGCC2 unexpectedly exists without ownership proof! Aborting.';
    END IF;
    IF EXISTS (SELECT 1 FROM user_account WHERE email = 'test.concurrency.provider@shipspace.test') THEN
        RAISE EXCEPTION 'SAFETY GUARD: Provider account unexpectedly exists without ownership proof! Aborting.';
    END IF;
    IF EXISTS (SELECT 1 FROM user_account WHERE email = 'test.concurrency.trader1@shipspace.test') THEN
        RAISE EXCEPTION 'SAFETY GUARD: Trader 1 account unexpectedly exists without ownership proof! Aborting.';
    END IF;
    IF EXISTS (SELECT 1 FROM user_account WHERE email = 'test.concurrency.trader2@shipspace.test') THEN
        RAISE EXCEPTION 'SAFETY GUARD: Trader 2 account unexpectedly exists without ownership proof! Aborting.';
    END IF;

    -- 3.1 Dedicated test ports (INCC1, SGCC2)
    INSERT INTO port (name, country, un_locode)
    VALUES ('Concurrency Test Origin Port', 'India', 'INCC1')
    RETURNING id INTO v_orig_port_id;

    INSERT INTO port (name, country, un_locode)
    VALUES ('Concurrency Test Destination Port', 'Singapore', 'SGCC2')
    RETURNING id INTO v_dest_port_id;

    -- 3.2 Dedicated test route (INCC1 -> SGCC2)
    INSERT INTO route (origin_port_id, destination_port_id, typical_transit_days)
    VALUES (v_orig_port_id, v_dest_port_id, 7)
    RETURNING id INTO v_route_id;

    -- 3.3 Dedicated Provider
    INSERT INTO user_account (name, email, password_hash, role)
    VALUES ('Concurrency Test Provider', 'test.concurrency.provider@shipspace.test', 'scrypt$hash$conc_p1', 'provider')
    RETURNING id INTO v_provider_id;

    INSERT INTO provider (id, role, company_name, gst_tax_id, contact_phone)
    VALUES (v_provider_id, 'provider', 'Concurrency Test Provider LLC', '27AAACP9999C1Z1', '+91-9999900001');

    -- 3.4 Dedicated Trader 1
    INSERT INTO user_account (name, email, password_hash, role)
    VALUES ('Concurrency Trader One', 'test.concurrency.trader1@shipspace.test', 'scrypt$hash$conc_t1', 'trader')
    RETURNING id INTO v_trader1_id;

    INSERT INTO trader (id, role, company_name, gst_tax_id, contact_phone)
    VALUES (v_trader1_id, 'trader', 'Concurrency Trader One Ltd', '27AAACT9991T1Z1', '+91-9999900002');

    -- 3.5 Dedicated Trader 2
    INSERT INTO user_account (name, email, password_hash, role)
    VALUES ('Concurrency Trader Two', 'test.concurrency.trader2@shipspace.test', 'scrypt$hash$conc_t2', 'trader')
    RETURNING id INTO v_trader2_id;

    INSERT INTO trader (id, role, company_name, gst_tax_id, contact_phone)
    VALUES (v_trader2_id, 'trader', 'Concurrency Trader Two Ltd', '27AAACT9992T2Z2', '+91-9999900003');

    -- 3.6 Resolve cargo type
    SELECT id INTO v_cargo_type_id FROM cargo_type WHERE name = 'General Cargo';
    IF v_cargo_type_id IS NULL THEN
        SELECT id INTO v_cargo_type_id FROM cargo_type ORDER BY id ASC LIMIT 1;
    END IF;

    -- 3.7 Insert capacity listing with exactly 2.00 CBM available, 5.00 weight available, status 'open'
    INSERT INTO capacity_listing (
        provider_id, route_id, departure_date, arrival_date, cutoff_date,
        total_cbm, available_cbm, total_weight, available_weight,
        price_per_cbm, price_per_tonne, minimum_charge, status
    ) VALUES (
        v_provider_id,
        v_route_id,
        CURRENT_DATE + INTERVAL '60 days',
        CURRENT_DATE + INTERVAL '67 days',
        CURRENT_DATE + INTERVAL '50 days',
        20.00,  -- total CBM
        2.00,   -- available CBM (exactly 2 CBM remaining for test contention)
        10.00,  -- total weight
        5.00,   -- available weight (ample weight for either 1.00t booking)
        100.00, -- price per CBM
        120.00, -- price per tonne
        200.00, -- minimum charge
        'open'
    ) RETURNING id INTO v_listing_id;

    -- Associate cargo type
    INSERT INTO listing_cargo (listing_id, cargo_type_id)
    VALUES (v_listing_id, v_cargo_type_id);

    -- 3.8 Register fixture in tracking table with explicit true ownership flags
    INSERT INTO shipspace.test_concurrency_fixture (
        fixture_key, listing_id, provider_id, trader1_id, trader2_id, cargo_type_id,
        route_id, port_origin_id, port_dest_id,
        created_provider, created_trader1, created_trader2,
        created_port_origin, created_port_dest, created_route, created_listing
    ) VALUES (
        'PHASE_6E_CONCURRENCY', v_listing_id, v_provider_id, v_trader1_id, v_trader2_id, v_cargo_type_id,
        v_route_id, v_orig_port_id, v_dest_port_id,
        true, true, true,
        true, true, true, true
    );

    RAISE NOTICE 'Fixture initialized: Listing ID %, Route ID % (INCC1 -> SGCC2), Available CBM: 2.00, Available Wt: 5.00',
        v_listing_id, v_route_id;
END $$;

-- ----------------------------------------------------------------------------
-- 4. In-Transaction Final Verification: Ensure fixture meets all criteria
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_rec            shipspace.test_concurrency_fixture%ROWTYPE;
    v_reg_count      INT;
    v_listing_count  INT;
    v_avail_cbm      NUMERIC(10, 2);
    v_avail_wt       NUMERIC(10, 2);
    v_status         VARCHAR(20);
    v_has_cargo      BOOLEAN;
BEGIN
    -- Exactly 1 registry row
    SELECT count(*) INTO v_reg_count
    FROM shipspace.test_concurrency_fixture
    WHERE fixture_key = 'PHASE_6E_CONCURRENCY';

    IF v_reg_count <> 1 THEN
        RAISE EXCEPTION 'SETUP POST-CHECK FAILED: Expected exactly 1 registry row, found %!', v_reg_count;
    END IF;

    SELECT * INTO v_rec
    FROM shipspace.test_concurrency_fixture
    WHERE fixture_key = 'PHASE_6E_CONCURRENCY';

    -- Exactly 1 test listing matching registered ID
    SELECT count(*), min(available_cbm), min(available_weight), min(status)
    INTO v_listing_count, v_avail_cbm, v_avail_wt, v_status
    FROM capacity_listing
    WHERE id = v_rec.listing_id;

    IF v_listing_count <> 1 THEN
        RAISE EXCEPTION 'SETUP POST-CHECK FAILED: Expected exactly 1 listing for ID %, found %!',
            v_rec.listing_id, v_listing_count;
    END IF;

    -- Verify capacity bounds and status
    IF v_avail_cbm <> 2.00 THEN
        RAISE EXCEPTION 'SETUP POST-CHECK FAILED: Expected available_cbm = 2.00, found %!', v_avail_cbm;
    END IF;

    IF v_avail_wt <> 5.00 THEN
        RAISE EXCEPTION 'SETUP POST-CHECK FAILED: Expected available_weight = 5.00, found %!', v_avail_wt;
    END IF;

    IF v_status <> 'open' THEN
        RAISE EXCEPTION 'SETUP POST-CHECK FAILED: Expected listing status "open", found "%"!', v_status;
    END IF;

    -- Verify intended cargo association
    SELECT EXISTS (
        SELECT 1 FROM listing_cargo
        WHERE listing_id = v_rec.listing_id AND cargo_type_id = v_rec.cargo_type_id
    ) INTO v_has_cargo;

    IF NOT v_has_cargo THEN
        RAISE EXCEPTION 'SETUP POST-CHECK FAILED: Listing ID % is missing intended cargo association for cargo_type_id %!',
            v_rec.listing_id, v_rec.cargo_type_id;
    END IF;

    RAISE NOTICE 'Setup post-check PASS: 1 registry row, 1 listing, correct cargo association, 2.00 CBM, 5.00 wt, status open.';
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- 5. Display active fixture registration
-- ----------------------------------------------------------------------------
SELECT
    f.fixture_key,
    f.listing_id,
    cl.available_cbm,
    cl.total_cbm,
    cl.available_weight,
    cl.total_weight,
    cl.status,
    u_prov.email AS provider_email,
    u_t1.email   AS trader1_email,
    u_t2.email   AS trader2_email,
    f.created_provider,
    f.created_trader1,
    f.created_trader2,
    f.created_route,
    f.created_listing
FROM shipspace.test_concurrency_fixture f
JOIN capacity_listing cl ON f.listing_id = cl.id
JOIN user_account u_prov ON f.provider_id = u_prov.id
JOIN user_account u_t1   ON f.trader1_id = u_t1.id
JOIN user_account u_t2   ON f.trader2_id = u_t2.id
WHERE f.fixture_key = 'PHASE_6E_CONCURRENCY';

\echo '===================================================================='
\echo 'PHASE 6E CONCURRENCY FIXTURE READY: PROCEED WITH SESSION 1 & 2'
\echo '===================================================================='
