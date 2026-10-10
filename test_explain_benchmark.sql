-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: test_explain_benchmark.sql
-- Description: Phase 6C Index Performance Evidence & Query Plan Benchmark
-- Purpose: Captures exact EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS) query plans
--          for Phase 6A core search queries to evaluate the impact of indexes.
--
-- Safety Guarantees:
--   - Designed to run safely against 'shipspace_test_phase5'.
--   - Never touches or modifies 'shipspace_db'.
--   - Evaluates:
--       Test A: Transaction-safe drop-and-rollback test on current seed dataset (45 listings).
--               Demonstrates optimizer behavior on small tables (sequential vs. index scan cost model).
--       Test B: Forced-index test on seed dataset (SET enable_seqscan = off) to inspect
--               index scan execution path and buffer reads.
--       Test C: Scaled volume benchmark (temporary synthetic uncommitted dataset of 20,000 listings)
--               to demonstrate query plan shift on realistic production volumes without
--               contaminating real test data.
-- ============================================================================

\pset pager off
SET search_path TO shipspace, public;

\echo '========================================================================'
\echo 'TEST 1: EXPLAIN PLAN ON CURRENT SEED DATASET WITH INDEXES ACTIVE'
\echo 'Query: Trader Multi-Constraint Capacity Search (INNSA -> AEJEA, 3.5 CBM, Dry Goods)'
\echo '========================================================================'

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS)
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    orig.name AS origin_port,
    orig.un_locode AS origin_code,
    dest.name AS destination_port,
    dest.un_locode AS destination_code,
    l.cutoff_date,
    l.departure_date,
    l.arrival_date,
    r.typical_transit_days,
    l.available_cbm,
    l.available_weight,
    l.price_per_cbm,
    l.price_per_tonne,
    l.minimum_charge,
    GREATEST(
        ROUND(3.50 * l.price_per_cbm, 2),
        ROUND(2.00 * l.price_per_tonne, 2),
        l.minimum_charge
    ) AS estimated_total_price
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
JOIN listing_cargo lc ON lc.listing_id = l.id
JOIN cargo_type ct ON lc.cargo_type_id = ct.id
WHERE orig.un_locode = 'INNSA'
  AND dest.un_locode = 'AEJEA'
  AND l.status = 'open'
  AND l.cutoff_date >= CURRENT_DATE
  AND l.cutoff_date >= (CURRENT_DATE + 2)
  AND l.departure_date > (CURRENT_DATE + 2)
  AND l.available_cbm >= 3.50
  AND l.available_weight >= 2.00
  AND ct.name = 'Standard Dry Merchandise'
ORDER BY estimated_total_price ASC, l.departure_date ASC;


\echo '========================================================================'
\echo 'TEST 2: FORCED INDEX SCAN TEST (SET enable_seqscan = off) ON SEED DATASET'
\echo 'Shows buffer reads and index scan mechanics when planner is directed to use idx_*'
\echo '========================================================================'

SET enable_seqscan = off;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS)
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    orig.name AS origin_port,
    orig.un_locode AS origin_code,
    dest.name AS destination_port,
    dest.un_locode AS destination_code,
    l.cutoff_date,
    l.departure_date,
    l.arrival_date,
    r.typical_transit_days,
    l.available_cbm,
    l.available_weight,
    l.price_per_cbm,
    l.price_per_tonne,
    l.minimum_charge,
    GREATEST(
        ROUND(3.50 * l.price_per_cbm, 2),
        ROUND(2.00 * l.price_per_tonne, 2),
        l.minimum_charge
    ) AS estimated_total_price
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
JOIN listing_cargo lc ON lc.listing_id = l.id
JOIN cargo_type ct ON lc.cargo_type_id = ct.id
WHERE orig.un_locode = 'INNSA'
  AND dest.un_locode = 'AEJEA'
  AND l.status = 'open'
  AND l.cutoff_date >= CURRENT_DATE
  AND l.cutoff_date >= (CURRENT_DATE + 2)
  AND l.departure_date > (CURRENT_DATE + 2)
  AND l.available_cbm >= 3.50
  AND l.available_weight >= 2.00
  AND ct.name = 'Standard Dry Merchandise'
ORDER BY estimated_total_price ASC, l.departure_date ASC;

SET enable_seqscan = on;


\echo '========================================================================'
\echo 'TEST 3: TRANSACTION-SAFE BEFORE-INDEX TEST (INDEXES DROPPED INSIDE ROLLBACK)'
\echo 'Drops idx_* inside a transaction block, captures plan, and ROLLS BACK.'
\echo 'Leaves the database completely intact.'
\echo '========================================================================'

BEGIN;

-- Temporarily drop the relevant Phase 6C search indexes inside the transaction
DROP INDEX IF EXISTS idx_capacity_listing_search_open;
DROP INDEX IF EXISTS idx_capacity_listing_route_id;
DROP INDEX IF EXISTS idx_listing_cargo_cargo_type_id;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS)
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    orig.name AS origin_port,
    orig.un_locode AS origin_code,
    dest.name AS destination_port,
    dest.un_locode AS destination_code,
    l.cutoff_date,
    l.departure_date,
    l.arrival_date,
    r.typical_transit_days,
    l.available_cbm,
    l.available_weight,
    l.price_per_cbm,
    l.price_per_tonne,
    l.minimum_charge,
    GREATEST(
        ROUND(3.50 * l.price_per_cbm, 2),
        ROUND(2.00 * l.price_per_tonne, 2),
        l.minimum_charge
    ) AS estimated_total_price
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
JOIN listing_cargo lc ON lc.listing_id = l.id
JOIN cargo_type ct ON lc.cargo_type_id = ct.id
WHERE orig.un_locode = 'INNSA'
  AND dest.un_locode = 'AEJEA'
  AND l.status = 'open'
  AND l.cutoff_date >= CURRENT_DATE
  AND l.cutoff_date >= (CURRENT_DATE + 2)
  AND l.departure_date > (CURRENT_DATE + 2)
  AND l.available_cbm >= 3.50
  AND l.available_weight >= 2.00
  AND ct.name = 'Standard Dry Merchandise'
ORDER BY estimated_total_price ASC, l.departure_date ASC;

-- Rollback immediately restores all dropped indexes!
ROLLBACK;


\echo '========================================================================'
\echo 'TEST 4: PRODUCTION-SCALE BENCHMARK (TEMP SYNTHETIC DATASET, ZERO DISK PERSISTENCE)'
\echo 'Evaluates plan difference on a simulated 20,000-listing catalog inside a transaction.'
\echo 'Rolls back completely so zero synthetic rows are persisted.'
\echo '========================================================================'

BEGIN;

-- Create an unlogged isolated staging table for synthetic scale benchmark
CREATE TEMP TABLE temp_scaled_listings (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_id      BIGINT NOT NULL,
    route_id         BIGINT NOT NULL,
    departure_date   DATE NOT NULL,
    arrival_date     DATE NOT NULL,
    cutoff_date      DATE NOT NULL,
    total_cbm        NUMERIC(10, 2) NOT NULL,
    available_cbm    NUMERIC(10, 2) NOT NULL,
    total_weight     NUMERIC(10, 2) NOT NULL,
    available_weight NUMERIC(10, 2) NOT NULL,
    price_per_cbm    NUMERIC(12, 2) NOT NULL,
    price_per_tonne  NUMERIC(12, 2) NOT NULL,
    minimum_charge   NUMERIC(12, 2) NOT NULL,
    status           VARCHAR(20) NOT NULL
) ON COMMIT DROP;

-- Insert 20,000 synthetic listings distributed across routes
INSERT INTO temp_scaled_listings (
    provider_id, route_id, departure_date, arrival_date, cutoff_date,
    total_cbm, available_cbm, total_weight, available_weight,
    price_per_cbm, price_per_tonne, minimum_charge, status
)
SELECT
    (SELECT id FROM provider LIMIT 1),
    ((i % 24) + 1),
    CURRENT_DATE + ((i % 60) + 10),
    CURRENT_DATE + ((i % 60) + 20),
    CURRENT_DATE + ((i % 60) + 5),
    40.00,
    CASE WHEN i % 5 = 0 THEN 0.00 ELSE 25.00 END,
    25.00,
    CASE WHEN i % 5 = 0 THEN 0.00 ELSE 15.00 END,
    85.00 + (i % 50),
    110.00 + (i % 50),
    200.00,
    CASE WHEN i % 5 = 0 THEN 'full' WHEN i % 20 = 0 THEN 'closed' ELSE 'open' END
FROM generate_series(1, 20000) s(i);

ANALYZE temp_scaled_listings;

\echo '--- Plan A (Without Index on Scaled Table: 20,000 Rows) ---'
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT id, price_per_cbm, available_cbm
FROM temp_scaled_listings
WHERE route_id = 1
  AND status = 'open'
  AND cutoff_date >= CURRENT_DATE
  AND departure_date > CURRENT_DATE + 2
  AND available_cbm >= 3.50;

\echo '--- Creating Partial Composite Index on Scaled Table ---'
CREATE INDEX idx_temp_search_open
    ON temp_scaled_listings (route_id, departure_date, cutoff_date)
    WHERE status = 'open';

ANALYZE temp_scaled_listings;

\echo '--- Plan B (With Partial Composite Index on Scaled Table: 20,000 Rows) ---'
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT id, price_per_cbm, available_cbm
FROM temp_scaled_listings
WHERE route_id = 1
  AND status = 'open'
  AND cutoff_date >= CURRENT_DATE
  AND departure_date > CURRENT_DATE + 2
  AND available_cbm >= 3.50;

ROLLBACK;

\echo '========================================================================'
\echo 'BENCHMARK RUN COMPLETED. ALL INDEXES AND DATA REMAIN EXACTLY INTACT.'
\echo '========================================================================'
