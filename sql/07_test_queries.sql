-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 07_test_queries.sql
-- Description: Automated verification test suite for constraints and triggers.
-- Compatible with: psql -v ON_ERROR_STOP=1 -f sql/07_test_queries.sql
-- Dialect: PostgreSQL (14+)
-- ============================================================================

SET search_path TO shipspace, public;
SET client_min_messages TO notice;

BEGIN;

-- ============================================================================
-- TEST HARNESS RESULT REPOSITORY
-- ============================================================================
CREATE TEMP TABLE IF NOT EXISTS test_results (
    id        SERIAL PRIMARY KEY,
    test_id   VARCHAR(20) NOT NULL,
    test_desc VARCHAR(100) NOT NULL,
    status    VARCHAR(10) NOT NULL, -- 'PASS', 'FAIL', 'ERROR'
    details   TEXT
) ON COMMIT DROP;

-- ============================================================================
-- 1. TEST DATA SETUP
-- Inserts deterministic reference records required for the test suite.
-- ============================================================================

-- Provider User Account + Profile
INSERT INTO user_account (name, email, password_hash, role)
VALUES ('Apex Logistics Ltd', 'apex.provider@shipspace.test', 'scrypt$dummy_hash_1', 'provider');

INSERT INTO provider (id, role, company_name, gst_tax_id, contact_phone)
VALUES (
    (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test'),
    'provider',
    'Apex Logistics Ltd',
    '27AAPCA1234F1Z5',
    '+91-9876543210'
);

-- Trader User Account + Profile
INSERT INTO user_account (name, email, password_hash, role)
VALUES ('Global Traders SME', 'global.trader@shipspace.test', 'scrypt$dummy_hash_2', 'trader');

INSERT INTO trader (id, role, company_name, gst_tax_id, contact_phone)
VALUES (
    (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
    'trader',
    'Global Traders SME',
    '27AABCG5678H1Z2',
    '+91-9123456789'
);

-- Admin User Account + Profile
INSERT INTO user_account (name, email, password_hash, role)
VALUES ('System Administrator', 'admin.portal@shipspace.test', 'scrypt$dummy_hash_3', 'admin');

INSERT INTO admin (id, role)
VALUES (
    (SELECT id FROM user_account WHERE email = 'admin.portal@shipspace.test'),
    'admin'
);

-- Ports (Unique test-suite UN/LOCODEs and names to avoid colliding with seed data)
INSERT INTO port (name, country, un_locode) VALUES ('Test Origin Port Alpha', 'India', 'INZZ1');
INSERT INTO port (name, country, un_locode) VALUES ('Test Destination Port Beta', 'Singapore', 'SGZZ2');
INSERT INTO port (name, country, un_locode) VALUES ('Test Transit Port Gamma', 'Netherlands', 'NLZZ3');

-- Route (INZZ1 -> SGZZ2)
INSERT INTO route (origin_port_id, destination_port_id, typical_transit_days)
VALUES (
    (SELECT id FROM port WHERE un_locode = 'INZZ1'),
    (SELECT id FROM port WHERE un_locode = 'SGZZ2'),
    7
);

-- Cargo Types
INSERT INTO cargo_type (name, description) VALUES ('General Cargo', 'Standard palletized dry non-hazardous merchandise');
INSERT INTO cargo_type (name, description) VALUES ('Hazardous Chemicals', 'IMO class regulated hazardous substances');

-- Valid Capacity Listing: 50 CBM, 25 Tonnes, Cutoff in 5 days, Departure in 10 days
INSERT INTO capacity_listing (
    provider_id, route_id, departure_date, arrival_date, cutoff_date,
    total_cbm, available_cbm, total_weight, available_weight,
    price_per_cbm, price_per_tonne, minimum_charge, status
) VALUES (
    (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test'),
    (SELECT r.id FROM route r
     JOIN port p1 ON r.origin_port_id = p1.id
     JOIN port p2 ON r.destination_port_id = p2.id
     WHERE p1.un_locode = 'INZZ1' AND p2.un_locode = 'SGZZ2'),
    CURRENT_DATE + INTERVAL '10 days',
    CURRENT_DATE + INTERVAL '17 days',
    CURRENT_DATE + INTERVAL '5 days',
    50.00, 50.00, 25.00, 25.00,
    120.00, 150.00, 250.00, 'open'
);

-- Listing Cargo Junction: Allow ONLY General Cargo on this test listing
INSERT INTO listing_cargo (listing_id, cargo_type_id)
VALUES (
    (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
    (SELECT id FROM cargo_type WHERE name = 'General Cargo')
);


-- ============================================================================
-- 2. NEGATIVE TESTS (17 ASSERTIONS)
-- Uses subtransaction exception catching to test constraints without aborting.
-- ============================================================================

-- TEST 1 - Route origin equals destination
DO $$
BEGIN
    INSERT INTO route (origin_port_id, destination_port_id, typical_transit_days)
    VALUES (
        (SELECT id FROM port WHERE un_locode = 'INZZ1'),
        (SELECT id FROM port WHERE un_locode = 'INZZ1'),
        3
    );
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 1', 'Route origin equals destination', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 1 - Route origin equals destination: FAIL';
EXCEPTION WHEN check_violation THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 1', 'Route origin equals destination', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 1 - Route origin equals destination: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 1', 'Route origin equals destination', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 1 - Route origin equals destination: ERROR (%)', SQLERRM;
END $$;


-- TEST 2 - Duplicate email
DO $$
BEGIN
    INSERT INTO user_account (name, email, password_hash, role)
    VALUES ('Duplicate User', 'apex.provider@shipspace.test', 'hash_test_dup', 'provider');
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 2', 'Duplicate email', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 2 - Duplicate email: FAIL';
EXCEPTION WHEN unique_violation THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 2', 'Duplicate email', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 2 - Duplicate email: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 2', 'Duplicate email', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 2 - Duplicate email: ERROR (%)', SQLERRM;
END $$;


-- TEST 3A - Zero CBM
DO $$
BEGIN
    INSERT INTO capacity_listing (
        provider_id, route_id, departure_date, arrival_date, cutoff_date,
        total_cbm, available_cbm, total_weight, available_weight,
        price_per_cbm, price_per_tonne, minimum_charge, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test'),
        (SELECT id FROM route LIMIT 1),
        CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '17 days', CURRENT_DATE + INTERVAL '5 days',
        0.00, 0.00, 20.00, 20.00,
        100.00, 100.00, 200.00, 'open'
    );
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 3A', 'Zero CBM', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 3A - Zero CBM: FAIL';
EXCEPTION WHEN check_violation THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 3A', 'Zero CBM', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 3A - Zero CBM: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 3A', 'Zero CBM', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 3A - Zero CBM: ERROR (%)', SQLERRM;
END $$;


-- TEST 3B - Available CBM exceeds total CBM
DO $$
BEGIN
    INSERT INTO capacity_listing (
        provider_id, route_id, departure_date, arrival_date, cutoff_date,
        total_cbm, available_cbm, total_weight, available_weight,
        price_per_cbm, price_per_tonne, minimum_charge, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test'),
        (SELECT id FROM route LIMIT 1),
        CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '17 days', CURRENT_DATE + INTERVAL '5 days',
        40.00, 50.00, 20.00, 20.00,
        100.00, 100.00, 200.00, 'open'
    );
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 3B', 'Available CBM exceeds total CBM', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 3B - Available CBM exceeds total CBM: FAIL';
EXCEPTION WHEN check_violation THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 3B', 'Available CBM exceeds total CBM', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 3B - Available CBM exceeds total CBM: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 3B', 'Available CBM exceeds total CBM', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 3B - Available CBM exceeds total CBM: ERROR (%)', SQLERRM;
END $$;


-- TEST 4A - Arrival date before departure date
DO $$
BEGIN
    INSERT INTO capacity_listing (
        provider_id, route_id, departure_date, arrival_date, cutoff_date,
        total_cbm, available_cbm, total_weight, available_weight,
        price_per_cbm, price_per_tonne, minimum_charge, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test'),
        (SELECT id FROM route LIMIT 1),
        CURRENT_DATE + INTERVAL '15 days',
        CURRENT_DATE + INTERVAL '10 days',
        CURRENT_DATE + INTERVAL '5 days',
        40.00, 40.00, 20.00, 20.00,
        100.00, 100.00, 200.00, 'open'
    );
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 4A', 'Arrival date before departure date', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 4A - Arrival date before departure date: FAIL';
EXCEPTION WHEN check_violation THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 4A', 'Arrival date before departure date', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 4A - Arrival date before departure date: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 4A', 'Arrival date before departure date', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 4A - Arrival date before departure date: ERROR (%)', SQLERRM;
END $$;


-- TEST 4B - Cutoff date after departure date
DO $$
BEGIN
    INSERT INTO capacity_listing (
        provider_id, route_id, departure_date, arrival_date, cutoff_date,
        total_cbm, available_cbm, total_weight, available_weight,
        price_per_cbm, price_per_tonne, minimum_charge, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test'),
        (SELECT id FROM route LIMIT 1),
        CURRENT_DATE + INTERVAL '10 days',
        CURRENT_DATE + INTERVAL '15 days',
        CURRENT_DATE + INTERVAL '12 days',
        40.00, 40.00, 20.00, 20.00,
        100.00, 100.00, 200.00, 'open'
    );
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 4B', 'Cutoff date after departure date', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 4B - Cutoff date after departure date: FAIL';
EXCEPTION WHEN check_violation THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 4B', 'Cutoff date after departure date', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 4B - Cutoff date after departure date: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 4B', 'Cutoff date after departure date', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 4B - Cutoff date after departure date: ERROR (%)', SQLERRM;
END $$;


-- TEST 5 - Non-existent listing booking
DO $$
BEGIN
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        99999999,
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        5.00, 2.50, 600.00, 'confirmed'
    );
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 5', 'Non-existent listing booking', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 5 - Non-existent listing booking: FAIL';
EXCEPTION WHEN foreign_key_violation OR raise_exception THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 5', 'Non-existent listing booking', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 5 - Non-existent listing booking: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 5', 'Non-existent listing booking', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 5 - Non-existent listing booking: ERROR (%)', SQLERRM;
END $$;


-- TEST 6 - Exceed available CBM
DO $$
BEGIN
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        999.00,
        5.00,
        0.00,
        'confirmed'
    );
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 6', 'Exceed available CBM', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 6 - Exceed available CBM: FAIL';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%Insufficient available CBM%' THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('TEST 6', 'Exceed available CBM', 'PASS', SQLERRM);
        RAISE NOTICE 'TEST 6 - Exceed available CBM: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('TEST 6', 'Exceed available CBM', 'ERROR', SQLERRM);
        RAISE WARNING 'TEST 6 - Exceed available CBM: ERROR (%)', SQLERRM;
    END IF;
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 6', 'Exceed available CBM', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 6 - Exceed available CBM: ERROR (%)', SQLERRM;
END $$;


-- TEST 7 - Exceed available weight
DO $$
BEGIN
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        5.00,
        999.00,
        0.00,
        'confirmed'
    );
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 7', 'Exceed available weight', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 7 - Exceed available weight: FAIL';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%Insufficient available weight%' THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('TEST 7', 'Exceed available weight', 'PASS', SQLERRM);
        RAISE NOTICE 'TEST 7 - Exceed available weight: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('TEST 7', 'Exceed available weight', 'ERROR', SQLERRM);
        RAISE WARNING 'TEST 7 - Exceed available weight: ERROR (%)', SQLERRM;
    END IF;
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 7', 'Exceed available weight', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 7 - Exceed available weight: ERROR (%)', SQLERRM;
END $$;


-- TEST 8 - Disallowed cargo type
DO $$
BEGIN
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
        (SELECT id FROM cargo_type WHERE name = 'Hazardous Chemicals'),
        5.00,
        2.00,
        0.00,
        'confirmed'
    );
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 8', 'Disallowed cargo type', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 8 - Disallowed cargo type: FAIL';
EXCEPTION WHEN raise_exception OR foreign_key_violation THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 8', 'Disallowed cargo type', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 8 - Disallowed cargo type: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 8', 'Disallowed cargo type', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 8 - Disallowed cargo type: ERROR (%)', SQLERRM;
END $$;


-- TEST 9 - Booking after cutoff date
DO $$
BEGIN
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status, booking_time
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        5.00,
        2.00,
        0.00,
        'confirmed',
        CURRENT_TIMESTAMP + INTERVAL '6 days'
    );
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 9', 'Booking after cutoff date', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 9 - Booking after cutoff date: FAIL';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%cutoff%' THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('TEST 9', 'Booking after cutoff date', 'PASS', SQLERRM);
        RAISE NOTICE 'TEST 9 - Booking after cutoff date: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('TEST 9', 'Booking after cutoff date', 'ERROR', SQLERRM);
        RAISE WARNING 'TEST 9 - Booking after cutoff date: ERROR (%)', SQLERRM;
    END IF;
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 9', 'Booking after cutoff date', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 9 - Booking after cutoff date: ERROR (%)', SQLERRM;
END $$;


-- TEST 10 - Booking closed / full listing
DO $$
DECLARE
    v_closed_listing_id BIGINT;
BEGIN
    INSERT INTO capacity_listing (
        provider_id, route_id, departure_date, arrival_date, cutoff_date,
        total_cbm, available_cbm, total_weight, available_weight,
        price_per_cbm, price_per_tonne, minimum_charge, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test'),
        (SELECT id FROM route LIMIT 1),
        CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '17 days', CURRENT_DATE + INTERVAL '5 days',
        30.00, 30.00, 15.00, 15.00,
        100.00, 100.00, 200.00, 'closed'
    ) RETURNING id INTO v_closed_listing_id;

    INSERT INTO listing_cargo (listing_id, cargo_type_id)
    VALUES (v_closed_listing_id, (SELECT id FROM cargo_type WHERE name = 'General Cargo'));

    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        v_closed_listing_id,
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        5.00, 2.00, 0.00, 'confirmed'
    );

    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 10', 'Booking closed / full listing', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 10 - Booking closed / full listing: FAIL';
EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%not open%' THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('TEST 10', 'Booking closed / full listing', 'PASS', SQLERRM);
        RAISE NOTICE 'TEST 10 - Booking closed / full listing: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('TEST 10', 'Booking closed / full listing', 'ERROR', SQLERRM);
        RAISE WARNING 'TEST 10 - Booking closed / full listing: ERROR (%)', SQLERRM;
    END IF;
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 10', 'Booking closed / full listing', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 10 - Booking closed / full listing: ERROR (%)', SQLERRM;
END $$;


-- TEST 11B - Transition cancelled to confirmed
DO $$
DECLARE
    v_b_id BIGINT;
BEGIN
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        5.00, 2.00, 0.00, 'confirmed'
    ) RETURNING id INTO v_b_id;

    UPDATE booking SET status = 'cancelled' WHERE id = v_b_id;

    UPDATE booking SET status = 'confirmed' WHERE id = v_b_id;

    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 11B', 'Transition cancelled to confirmed', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 11B - Transition cancelled to confirmed: FAIL';
EXCEPTION WHEN raise_exception THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 11B', 'Transition cancelled to confirmed', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 11B - Transition cancelled to confirmed: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 11B', 'Transition cancelled to confirmed', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 11B - Transition cancelled to confirmed: ERROR (%)', SQLERRM;
END $$;


-- TEST 11C - Transition cancelled to completed
DO $$
DECLARE
    v_b_id BIGINT;
BEGIN
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        5.00, 2.00, 0.00, 'confirmed'
    ) RETURNING id INTO v_b_id;

    UPDATE booking SET status = 'cancelled' WHERE id = v_b_id;

    UPDATE booking SET status = 'completed' WHERE id = v_b_id;

    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 11C', 'Transition cancelled to completed', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 11C - Transition cancelled to completed: FAIL';
EXCEPTION WHEN raise_exception THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 11C', 'Transition cancelled to completed', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 11C - Transition cancelled to completed: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 11C', 'Transition cancelled to completed', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 11C - Transition cancelled to completed: ERROR (%)', SQLERRM;
END $$;


-- TEST 12A - Altering booked_cbm on active booking
DO $$
DECLARE
    v_b_id BIGINT;
BEGIN
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        5.00, 2.00, 0.00, 'confirmed'
    ) RETURNING id INTO v_b_id;

    UPDATE booking SET booked_cbm = 8.00 WHERE id = v_b_id;

    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 12A', 'Altering booked_cbm on active booking', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 12A - Altering booked_cbm on active booking: FAIL';
EXCEPTION WHEN raise_exception THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 12A', 'Altering booked_cbm on active booking', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 12A - Altering booked_cbm on active booking: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 12A', 'Altering booked_cbm on active booking', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 12A - Altering booked_cbm on active booking: ERROR (%)', SQLERRM;
END $$;


-- TEST 12B - Altering total_price on active booking
DO $$
DECLARE
    v_b_id BIGINT;
BEGIN
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        5.00, 2.00, 0.00, 'confirmed'
    ) RETURNING id INTO v_b_id;

    UPDATE booking SET total_price = 50.00 WHERE id = v_b_id;

    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 12B', 'Altering total_price on active booking', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 12B - Altering total_price on active booking: FAIL';
EXCEPTION WHEN raise_exception THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 12B', 'Altering total_price on active booking', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 12B - Altering total_price on active booking: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 12B', 'Altering total_price on active booking', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 12B - Altering total_price on active booking: ERROR (%)', SQLERRM;
END $$;


-- TEST 12C - Altering listing_id on active booking
DO $$
DECLARE
    v_b_id BIGINT;
BEGIN
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        5.00, 2.00, 0.00, 'confirmed'
    ) RETURNING id INTO v_b_id;

    UPDATE booking SET listing_id = 99999 WHERE id = v_b_id;

    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 12C', 'Altering listing_id on active booking', 'FAIL', 'Unexpectedly succeeded');
    RAISE WARNING 'TEST 12C - Altering listing_id on active booking: FAIL';
EXCEPTION WHEN raise_exception OR foreign_key_violation THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 12C', 'Altering listing_id on active booking', 'PASS', SQLERRM);
    RAISE NOTICE 'TEST 12C - Altering listing_id on active booking: PASS';
WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('TEST 12C', 'Altering listing_id on active booking', 'ERROR', SQLERRM);
    RAISE WARNING 'TEST 12C - Altering listing_id on active booking: ERROR (%)', SQLERRM;
END $$;


-- ============================================================================
-- 3. POSITIVE TESTS (9 ASSERTIONS)
-- Verifies state correctness, trigger executions, pricing, and audit records.
-- ============================================================================

-- POSITIVE TEST 1: Valid booking creation & price calculation snapshot
DO $$
DECLARE
    v_b_id BIGINT;
    v_price NUMERIC(12, 2);
BEGIN
    -- Rates: CBM 120, Weight 150, Min 250
    -- Booking: 10 CBM, 5 Tonnes
    -- GREATEST(10*120=1200, 5*150=750, 250) = 1200.00
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        (SELECT id FROM capacity_listing WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test') ORDER BY id DESC LIMIT 1),
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        10.00, 5.00, 0.00, 'confirmed'
    ) RETURNING id, total_price INTO v_b_id, v_price;

    IF v_price = 1200.00 THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 1', 'Valid booking creation & price snapshot', 'PASS', 'Calculated price: ' || v_price);
        RAISE NOTICE 'POSITIVE TEST 1 - Valid booking creation & price snapshot: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 1', 'Valid booking creation & price snapshot', 'FAIL', 'Expected 1200.00 but got ' || v_price);
        RAISE WARNING 'POSITIVE TEST 1 - Valid booking creation & price snapshot: FAIL';
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO test_results (test_id, test_desc, status, details)
    VALUES ('POSITIVE TEST 1', 'Valid booking creation & price snapshot', 'ERROR', SQLERRM);
    RAISE WARNING 'POSITIVE TEST 1 - Valid booking creation & price snapshot: ERROR (%)', SQLERRM;
END $$;


-- POSITIVE TEST 2: Capacity CBM decrement
DO $$
DECLARE
    v_cbm NUMERIC(10, 2);
BEGIN
    SELECT available_cbm INTO v_cbm
    FROM capacity_listing
    WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test')
    ORDER BY id DESC LIMIT 1;

    IF v_cbm = 40.00 THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 2', 'Available CBM decremented exactly', 'PASS', 'Remaining CBM: 40.00');
        RAISE NOTICE 'POSITIVE TEST 2 - Available CBM decremented exactly: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 2', 'Available CBM decremented exactly', 'FAIL', 'Expected 40.00 but got ' || v_cbm);
        RAISE WARNING 'POSITIVE TEST 2 - Available CBM decremented exactly: FAIL';
    END IF;
END $$;


-- POSITIVE TEST 3: Capacity weight decrement
DO $$
DECLARE
    v_wt NUMERIC(10, 2);
BEGIN
    SELECT available_weight INTO v_wt
    FROM capacity_listing
    WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test')
    ORDER BY id DESC LIMIT 1;

    IF v_wt = 20.00 THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 3', 'Available weight decremented exactly', 'PASS', 'Remaining weight: 20.00');
        RAISE NOTICE 'POSITIVE TEST 3 - Available weight decremented exactly: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 3', 'Available weight decremented exactly', 'FAIL', 'Expected 20.00 but got ' || v_wt);
        RAISE WARNING 'POSITIVE TEST 3 - Available weight decremented exactly: FAIL';
    END IF;
END $$;


-- POSITIVE TEST 4: Initial booking status history record
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count
    FROM booking_status_history
    WHERE booking_id = (
        SELECT b.id FROM booking b
        JOIN capacity_listing l ON b.listing_id = l.id
        WHERE l.provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test')
        ORDER BY b.id DESC LIMIT 1
    )
      AND old_status IS NULL
      AND new_status = 'confirmed';

    IF v_count = 1 THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 4', 'Initial status history record logged', 'PASS', 'Confirmed record found');
        RAISE NOTICE 'POSITIVE TEST 4 - Initial status history record logged: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 4', 'Initial status history record logged', 'FAIL', 'Record count: ' || v_count);
        RAISE WARNING 'POSITIVE TEST 4 - Initial status history record logged: FAIL';
    END IF;
END $$;


-- POSITIVE TEST 5: Capacity exhaustion (status -> 'full')
DO $$
DECLARE
    v_status VARCHAR(20);
    v_cbm NUMERIC(10, 2);
    v_wt NUMERIC(10, 2);
    v_test_listing_id BIGINT;
BEGIN
    SELECT id INTO v_test_listing_id
    FROM capacity_listing
    WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test')
    ORDER BY id DESC LIMIT 1;

    -- Book remaining 40 CBM & 20 Tonnes
    INSERT INTO booking (
        trader_id, listing_id, cargo_type_id,
        booked_cbm, booked_weight, total_price, status
    ) VALUES (
        (SELECT id FROM user_account WHERE email = 'global.trader@shipspace.test'),
        v_test_listing_id,
        (SELECT id FROM cargo_type WHERE name = 'General Cargo'),
        40.00, 20.00, 0.00, 'confirmed'
    );

    SELECT status, available_cbm, available_weight INTO v_status, v_cbm, v_wt
    FROM capacity_listing
    WHERE id = v_test_listing_id;

    IF v_status = 'full' AND v_cbm = 0 AND v_wt = 0 THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 5', 'Listing status becomes full at zero capacity', 'PASS', 'Status is full');
        RAISE NOTICE 'POSITIVE TEST 5 - Listing status becomes full at zero capacity: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 5', 'Listing status becomes full at zero capacity', 'FAIL', 'Status: ' || v_status || ', CBM: ' || v_cbm);
        RAISE WARNING 'POSITIVE TEST 5 - Listing status becomes full at zero capacity: FAIL';
    END IF;
END $$;


-- POSITIVE TEST 6: Exact capacity restoration on cancellation
-- POSITIVE TEST 7: Listing status reopened to 'open'
DO $$
DECLARE
    v_cbm NUMERIC(10, 2);
    v_wt NUMERIC(10, 2);
    v_status VARCHAR(20);
    v_test_listing_id BIGINT;
    v_first_booking_id BIGINT;
BEGIN
    SELECT id INTO v_test_listing_id
    FROM capacity_listing
    WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test')
    ORDER BY id DESC LIMIT 1;

    -- First booking on this test listing was 10 CBM, 5 Tonnes
    SELECT b.id INTO v_first_booking_id
    FROM booking b
    WHERE b.listing_id = v_test_listing_id
      AND b.booked_cbm = 10.00 AND b.booked_weight = 5.00
    ORDER BY b.id ASC LIMIT 1;

    -- Cancel first booking (10 CBM, 5 Tonnes)
    UPDATE booking
    SET status = 'cancelled'
    WHERE id = v_first_booking_id;

    SELECT available_cbm, available_weight, status INTO v_cbm, v_wt, v_status
    FROM capacity_listing
    WHERE id = v_test_listing_id;

    -- Test 6 check
    IF v_cbm = 10.00 AND v_wt = 5.00 THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 6', 'Exact capacity restoration on cancel', 'PASS', 'Restored 10 CBM and 5 Tonnes');
        RAISE NOTICE 'POSITIVE TEST 6 - Exact capacity restoration on cancel: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 6', 'Exact capacity restoration on cancel', 'FAIL', 'CBM: ' || v_cbm || ', Wt: ' || v_wt);
        RAISE WARNING 'POSITIVE TEST 6 - Exact capacity restoration on cancel: FAIL';
    END IF;

    -- Test 7 check
    IF v_status = 'open' THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 7', 'Listing status reopened to open', 'PASS', 'Status is open');
        RAISE NOTICE 'POSITIVE TEST 7 - Listing status reopened to open: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 7', 'Listing status reopened to open', 'FAIL', 'Status: ' || v_status);
        RAISE WARNING 'POSITIVE TEST 7 - Listing status reopened to open: FAIL';
    END IF;
END $$;


-- POSITIVE TEST 8: Cancellation audit history record logged
DO $$
DECLARE
    v_count INT;
    v_test_listing_id BIGINT;
    v_first_booking_id BIGINT;
BEGIN
    SELECT id INTO v_test_listing_id
    FROM capacity_listing
    WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test')
    ORDER BY id DESC LIMIT 1;

    SELECT b.id INTO v_first_booking_id
    FROM booking b
    WHERE b.listing_id = v_test_listing_id
      AND b.booked_cbm = 10.00 AND b.booked_weight = 5.00
    ORDER BY b.id ASC LIMIT 1;

    SELECT count(*) INTO v_count
    FROM booking_status_history
    WHERE booking_id = v_first_booking_id
      AND old_status = 'confirmed'
      AND new_status = 'cancelled';

    IF v_count = 1 THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 8', 'Cancellation audit history logged', 'PASS', 'Transition record found');
        RAISE NOTICE 'POSITIVE TEST 8 - Cancellation audit history logged: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 8', 'Cancellation audit history logged', 'FAIL', 'Record count: ' || v_count);
        RAISE WARNING 'POSITIVE TEST 8 - Cancellation audit history logged: FAIL';
    END IF;
END $$;


-- POSITIVE TEST 9: Historical price snapshot remains unchanged
DO $$
DECLARE
    v_price NUMERIC(12, 2);
    v_test_listing_id BIGINT;
    v_first_booking_id BIGINT;
BEGIN
    SELECT id INTO v_test_listing_id
    FROM capacity_listing
    WHERE provider_id = (SELECT id FROM user_account WHERE email = 'apex.provider@shipspace.test')
    ORDER BY id DESC LIMIT 1;

    SELECT b.id INTO v_first_booking_id
    FROM booking b
    WHERE b.listing_id = v_test_listing_id
      AND b.booked_cbm = 10.00 AND b.booked_weight = 5.00
    ORDER BY b.id ASC LIMIT 1;

    -- Update rates on listing
    UPDATE capacity_listing
    SET price_per_cbm = 999.00, price_per_tonne = 999.00
    WHERE id = v_test_listing_id;

    SELECT total_price INTO v_price
    FROM booking
    WHERE id = v_first_booking_id;

    IF v_price = 1200.00 THEN
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 9', 'Total price frozen across price updates', 'PASS', 'Price preserved at 1200.00');
        RAISE NOTICE 'POSITIVE TEST 9 - Total price frozen across price updates: PASS';
    ELSE
        INSERT INTO test_results (test_id, test_desc, status, details)
        VALUES ('POSITIVE TEST 9', 'Total price frozen across price updates', 'FAIL', 'Price changed to ' || v_price);
        RAISE WARNING 'POSITIVE TEST 9 - Total price frozen across price updates: FAIL';
    END IF;
END $$;


-- ============================================================================
-- 4. TEST SUITE SUMMARY & AGGREGATE VERIFICATION
-- ============================================================================
SELECT
    test_id AS "Test ID",
    test_desc AS "Description",
    status AS "Status",
    details AS "Details"
FROM test_results
ORDER BY id;

DO $$
DECLARE
    v_total INT;
    v_passed INT;
    v_failed INT;
    v_errors INT;
BEGIN
    SELECT count(*),
           count(*) FILTER (WHERE status = 'PASS'),
           count(*) FILTER (WHERE status = 'FAIL'),
           count(*) FILTER (WHERE status = 'ERROR')
    INTO v_total, v_passed, v_failed, v_errors
    FROM test_results;

    RAISE NOTICE '==================================================';
    RAISE NOTICE 'TEST SUITE SUMMARY: Total: %, Passed: %, Failed: %, Errors: %',
        v_total, v_passed, v_failed, v_errors;
    RAISE NOTICE '==================================================';

    IF v_failed > 0 OR v_errors > 0 THEN
        RAISE EXCEPTION 'Test suite encountered % failure(s) and % error(s)', v_failed, v_errors;
    END IF;
END $$;

-- Clean rollback leaves database in its original state
ROLLBACK;
