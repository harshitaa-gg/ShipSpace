-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 08_core_queries.sql
-- Description: Phase 6A: Core SQL Queries Implementation (Refined)
-- Dialect: PostgreSQL (14+)
-- Schema: shipspace
--
-- This script contains production-grade, highly structured SQL queries covering:
--   1. Multi-Constraint Matching Capacity Search
--      - Explicitly documents and models all 6 trader search parameters
--      - Implements both Strategy A (Price-First) and Strategy B (Departure-First)
--      - Validated test cases for returning matches vs. zero results (cargo restriction, capacity, cutoff)
--   2. Join-Heavy Listing Discovery (Consolidating Routes, Ports, Providers, Cargo)
--   3. Business Metric Aggregations
--      - Provider Capacity Utilization % (Distinguishing Lifetime Consumed vs. Currently Committed)
--      - Realized, Committed Pipeline, and Total Active Revenue per Provider
--      - Route Volume, Booking Counts, and Lane Revenue (Isolated from join multiplication)
--      - Average, Minimum, and Maximum Freight Rates per Route
--   4. Subqueries with Clearly Defined Scopes
--      - Below-Average Listings (Explicitly partitioned by open/future listings)
--      - Multi-Provider Traders
--      - Distinguishing Listings with Zero Bookings Ever vs. Listings with Zero Active Bookings
--   5. CTEs & Window Functions
--      - Provider Route Pricing Competitiveness & Market Best-Price Spreads
--
-- Note on Data Safety:
--   All queries in this file are strictly read-only.
--   No schema modifications, updates, or deletions are performed.
-- ============================================================================

SET search_path TO shipspace, public;

-- ============================================================================
-- SECTION 1: MULTI-CONSTRAINT MATCHING CAPACITY SEARCH
-- ============================================================================
-- Business Context:
--   A shipper/trader needs to discover open LCL capacity matching their cargo requirements.
--
-- The Six Core Search Inputs:
--   1. Origin Port:       p_origin_locode    (UN/LOCODE, e.g. 'INNSA' - Nhava Sheva)
--   2. Destination Port:  p_dest_locode      (UN/LOCODE, e.g. 'AEJEA' - Jebel Ali)
--   3. Required Volume:   p_req_cbm          (NUMERIC(10, 2), e.g. 3.50 CBM)
--   4. Required Weight:   p_req_weight       (NUMERIC(10, 2), e.g. 2.00 Tonnes)
--   5. Cargo Type:        p_cargo_type_name  (VARCHAR, e.g. 'Standard Dry Merchandise')
--   6. Cargo Ready Date:  p_cargo_ready_date (DATE, e.g. CURRENT_DATE + INTERVAL '2 days')
--
-- Business Rules & Constraints Enforced:
--   - Exact Route:        orig.un_locode = p_origin_locode AND dest.un_locode = p_dest_locode
--   - Listing Status:     l.status = 'open'
--   - Cutoff Validity:    l.cutoff_date >= CURRENT_DATE (booking window has not closed today)
--   - Ready Date Cutoff:  l.cutoff_date >= p_cargo_ready_date (shipper can deliver before cutoff)
--   - Departure Timing:   l.departure_date > p_cargo_ready_date (vessel departs strictly after ready date)
--   - Volume Sufficiency: l.available_cbm >= p_req_cbm
--   - Weight Sufficiency: l.available_weight >= p_req_weight
--   - Cargo Acceptance:   EXISTS in listing_cargo for the requested cargo type
--
-- Ordering Strategies:
--   - Strategy A (Price-First): Orders by lowest calculated freight price first, then earliest departure.
--   - Strategy B (Departure-First): Orders by earliest departure date first, then lowest calculated price.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 Strategy A: Price-First Ordering (Lowest Estimated Total Freight Cost)
-- Inputs:
--   Origin: 'INNSA' | Destination: 'AEJEA' | CBM: 3.50 | Weight: 2.00 t
--   Cargo: 'Standard Dry Merchandise' | Ready Date: CURRENT_DATE + 2
-- ----------------------------------------------------------------------------
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
    -- Pricing Formula (Rule R7): GREATEST(cbm * rate_cbm, weight * rate_tonne, min_charge)
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


-- ----------------------------------------------------------------------------
-- 1.2 Strategy B: Departure-First Ordering (Earliest Departure for Urgent Cargo)
-- Inputs: Same six parameters as 1.1
-- ----------------------------------------------------------------------------
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
ORDER BY l.departure_date ASC, estimated_total_price ASC;


-- ----------------------------------------------------------------------------
-- 1.3 Valid Search Example: Route INNSA -> SGSIN (Expected: Matches Returned)
-- Inputs:
--   Origin: 'INNSA' | Destination: 'SGSIN' | CBM: 4.00 | Weight: 2.50 t
--   Cargo: 'Textiles & Apparel Goods' | Ready Date: CURRENT_DATE + 3
-- ----------------------------------------------------------------------------
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    orig.un_locode || ' -> ' || dest.un_locode AS route_code,
    l.departure_date,
    l.cutoff_date,
    l.available_cbm,
    l.available_weight,
    l.price_per_cbm,
    GREATEST(
        ROUND(4.00 * l.price_per_cbm, 2),
        ROUND(2.50 * l.price_per_tonne, 2),
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
  AND dest.un_locode = 'SGSIN'
  AND l.status = 'open'
  AND l.cutoff_date >= CURRENT_DATE
  AND l.cutoff_date >= (CURRENT_DATE + 3)
  AND l.departure_date > (CURRENT_DATE + 3)
  AND l.available_cbm >= 4.00
  AND l.available_weight >= 2.50
  AND ct.name = 'Textiles & Apparel Goods'
ORDER BY estimated_total_price ASC;


-- ----------------------------------------------------------------------------
-- 1.4 Zero-Result Validation Scenarios (Confirmed Against Actual Seed Data)
-- ----------------------------------------------------------------------------

-- Scenario 1.4A: Cargo Restriction Mismatch (Returns EXACTLY 0 rows)
-- Attempting to ship 'Hazardous Regulated Goods (IMO/DG)' on Route INMAA -> LKCMB.
-- Seed Verification: In seed data, the only open listings on INMAA -> LKCMB are L11 (restricted
-- exclusively to 'Perishable Food & Produce') and L36 (general goods: dry, mach, tex, auto, cera).
-- Neither listing permits Hazardous cargo.
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    orig.un_locode || ' -> ' || dest.un_locode AS route_code,
    l.departure_date,
    l.available_cbm
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
JOIN listing_cargo lc ON lc.listing_id = l.id
JOIN cargo_type ct ON lc.cargo_type_id = ct.id
WHERE orig.un_locode = 'INMAA'
  AND dest.un_locode = 'LKCMB'
  AND l.status = 'open'
  AND ct.name = 'Hazardous Regulated Goods (IMO/DG)';

-- Scenario 1.4B: Capacity Exceeded (Returns EXACTLY 0 rows)
-- Requesting 80.00 CBM on Route INNSA -> AEJEA.
-- Seed Verification: The highest total capacity listing on this route is 45.00 CBM.
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    l.available_cbm
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
WHERE orig.un_locode = 'INNSA'
  AND dest.un_locode = 'AEJEA'
  AND l.status = 'open'
  AND l.available_cbm >= 80.00;

-- Scenario 1.4C: Ready Date After Cutoff (Returns EXACTLY 0 rows)
-- Cargo ready date is set 60 days in the future (CURRENT_DATE + 60).
-- Seed Verification: All active seed listings depart within 35 days (max cutoff is 25 days).
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    l.departure_date,
    l.cutoff_date
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
WHERE orig.un_locode = 'INNSA'
  AND dest.un_locode = 'AEJEA'
  AND l.status = 'open'
  AND l.cutoff_date >= (CURRENT_DATE + 60);


-- ============================================================================
-- SECTION 2: JOIN-HEAVY LISTING DISCOVERY QUERY
-- ============================================================================
-- Business Context:
--   A comprehensive multi-table catalog view connecting listings with routes,
--   origin/destination ports, provider corporate details, and permitted cargo types.
--
-- Features:
--   - Joins 6 tables without row multiplication.
--   - Uses string_agg to group all permitted cargo types into a single formatted list.
--   - Preserves exactly 1 row per capacity listing.
-- ============================================================================
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    p.contact_phone AS provider_phone,
    orig.un_locode AS origin_code,
    orig.name AS origin_port,
    orig.country AS origin_country,
    dest.un_locode AS destination_code,
    dest.name AS destination_port,
    dest.country AS destination_country,
    r.typical_transit_days,
    l.cutoff_date,
    l.departure_date,
    l.arrival_date,
    l.status AS listing_status,
    l.total_cbm,
    l.available_cbm,
    ROUND(l.total_cbm - l.available_cbm, 2) AS booked_cbm,
    l.total_weight,
    l.available_weight,
    ROUND(l.total_weight - l.available_weight, 2) AS booked_weight,
    l.price_per_cbm,
    l.price_per_tonne,
    l.minimum_charge,
    count(DISTINCT lc.cargo_type_id) AS permitted_cargo_type_count,
    string_agg(ct.name, ', ' ORDER BY ct.name) AS permitted_cargo_types
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
JOIN listing_cargo lc ON lc.listing_id = l.id
JOIN cargo_type ct ON lc.cargo_type_id = ct.id
GROUP BY
    l.id,
    p.company_name,
    p.contact_phone,
    orig.un_locode,
    orig.name,
    orig.country,
    dest.un_locode,
    dest.name,
    dest.country,
    r.typical_transit_days,
    l.cutoff_date,
    l.departure_date,
    l.arrival_date,
    l.status,
    l.total_cbm,
    l.available_cbm,
    l.total_weight,
    l.available_weight,
    l.price_per_cbm,
    l.price_per_tonne,
    l.minimum_charge
ORDER BY l.id ASC;


-- ============================================================================
-- SECTION 3: AGGREGATE BUSINESS METRIC QUERIES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 Provider Capacity Utilization Percentage
--
-- Metric Definition:
--   Distinguishes two vital capacity metrics:
--   1. Currently Committed Utilization (Active Utilization):
--      Calculated directly from the listing's current available capacity:
--      (total_capacity - available_capacity) / total_capacity * 100
--      Reflects capacity currently occupied by 'confirmed' and 'completed' bookings.
--      Cancelled bookings are NOT included because their cancellation restored available capacity.
--   2. Lifetime Historical Consumed Volume:
--      Calculated by aggregating all bookings ever created (confirmed + completed),
--      illustrating cumulative demand throughput over time.
--
-- Aggregation Structure:
--   Refactored into two independent CTEs:
--     - provider_listing_totals: aggregates published listings, total and available CBM/weight
--       directly from capacity_listing per provider.
--     - provider_booking_totals: aggregates active booked volume/weight and lifetime gross
--       booked volume per provider.
--   Both CTEs are joined separately to provider via LEFT JOIN, ensuring clean structure,
--   independent verification, and preserving providers with zero listings or zero bookings.
-- ----------------------------------------------------------------------------
WITH provider_listing_totals AS (
    SELECT
        provider_id,
        count(id) AS total_published_listings,
        SUM(total_cbm) AS total_published_cbm,
        SUM(available_cbm) AS current_available_cbm,
        SUM(total_weight) AS total_published_weight,
        SUM(available_weight) AS current_available_weight
    FROM capacity_listing
    GROUP BY provider_id
),
provider_booking_totals AS (
    SELECT
        l.provider_id,
        COALESCE(SUM(b.booked_cbm) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00) AS active_booked_cbm,
        COALESCE(SUM(b.booked_weight) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00) AS active_booked_weight,
        COALESCE(SUM(b.booked_cbm), 0.00) AS lifetime_total_booked_cbm
    FROM capacity_listing l
    JOIN booking b ON b.listing_id = l.id
    GROUP BY l.provider_id
)
SELECT
    p.id AS provider_id,
    p.company_name,
    COALESCE(plt.total_published_listings, 0) AS total_published_listings,
    COALESCE(plt.total_published_cbm, 0.00) AS total_published_cbm,
    COALESCE(plt.current_available_cbm, 0.00) AS current_available_cbm,
    COALESCE(pbt.active_booked_cbm, 0.00) AS active_committed_cbm,
    CASE
        WHEN COALESCE(plt.total_published_cbm, 0.00) > 0 THEN
            ROUND((COALESCE(pbt.active_booked_cbm, 0.00) / plt.total_published_cbm) * 100.0, 2)
        ELSE 0.00
    END AS active_cbm_utilization_pct,
    COALESCE(plt.total_published_weight, 0.00) AS total_published_weight,
    COALESCE(plt.current_available_weight, 0.00) AS current_available_weight,
    COALESCE(pbt.active_booked_weight, 0.00) AS active_committed_weight,
    CASE
        WHEN COALESCE(plt.total_published_weight, 0.00) > 0 THEN
            ROUND((COALESCE(pbt.active_booked_weight, 0.00) / plt.total_published_weight) * 100.0, 2)
        ELSE 0.00
    END AS active_weight_utilization_pct,
    COALESCE(pbt.lifetime_total_booked_cbm, 0.00) AS lifetime_gross_booked_cbm
FROM provider p
LEFT JOIN provider_listing_totals plt ON plt.provider_id = p.id
LEFT JOIN provider_booking_totals pbt ON pbt.provider_id = p.id
ORDER BY active_cbm_utilization_pct DESC, p.company_name ASC;


-- ----------------------------------------------------------------------------
-- 3.2 Realized, Committed Pipeline, and Total Active Revenue per Provider
--
-- Metric Definition:
--   - Realized Revenue: Value of shipments that have completed transit (status = 'completed').
--   - Committed Pipeline: Value of currently confirmed future bookings (status = 'confirmed').
--   - Total Active Revenue: Realized + Committed Pipeline revenue.
--   - Cancelled Bookings: Excluded from active revenue, tracked as lost revenue.
--
-- Join Safety:
--   Aggregates bookings by listing_id first, avoiding duplicate rows if other tables are joined.
-- ----------------------------------------------------------------------------
WITH provider_listing_revenue AS (
    SELECT
        l.provider_id,
        count(b.id) FILTER (WHERE b.status = 'completed') AS completed_count,
        count(b.id) FILTER (WHERE b.status = 'confirmed') AS confirmed_count,
        count(b.id) FILTER (WHERE b.status = 'cancelled') AS cancelled_count,
        COALESCE(SUM(b.total_price) FILTER (WHERE b.status = 'completed'), 0.00) AS realized_rev,
        COALESCE(SUM(b.total_price) FILTER (WHERE b.status = 'confirmed'), 0.00) AS committed_rev,
        COALESCE(SUM(b.total_price) FILTER (WHERE b.status = 'cancelled'), 0.00) AS lost_rev
    FROM capacity_listing l
    LEFT JOIN booking b ON b.listing_id = l.id
    GROUP BY l.provider_id
)
SELECT
    p.id AS provider_id,
    p.company_name,
    COALESCE(plr.completed_count, 0) AS completed_bookings,
    COALESCE(plr.confirmed_count, 0) AS confirmed_bookings,
    (COALESCE(plr.completed_count, 0) + COALESCE(plr.confirmed_count, 0)) AS total_active_bookings,
    COALESCE(plr.cancelled_count, 0) AS cancelled_bookings,
    COALESCE(plr.realized_rev, 0.00) AS realized_revenue,
    COALESCE(plr.committed_rev, 0.00) AS committed_pipeline_revenue,
    (COALESCE(plr.realized_rev, 0.00) + COALESCE(plr.committed_rev, 0.00)) AS total_active_revenue,
    COALESCE(plr.lost_rev, 0.00) AS lost_cancelled_revenue
FROM provider p
LEFT JOIN provider_listing_revenue plr ON plr.provider_id = p.id
ORDER BY total_active_revenue DESC, p.company_name ASC;


-- ----------------------------------------------------------------------------
-- 3.3 Bookings per Route and Busiest Routes
--
-- Metric Definition:
--   Tracks cargo throughput (active bookings, total CBM moved, total tonnes moved, total revenue)
--   across all 24 shipping routes.
--
-- Join Multiplication Prevention:
--   Pre-aggregates listings and bookings separately in CTEs before joining to route.
-- ----------------------------------------------------------------------------
WITH route_listing_counts AS (
    SELECT
        route_id,
        count(id) AS listings_published
    FROM capacity_listing
    GROUP BY route_id
),
route_booking_metrics AS (
    SELECT
        l.route_id,
        count(b.id) FILTER (WHERE b.status IN ('confirmed', 'completed')) AS active_booking_count,
        COALESCE(SUM(b.booked_cbm) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00) AS total_cbm_moved,
        COALESCE(SUM(b.booked_weight) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00) AS total_tonnes_moved,
        COALESCE(SUM(b.total_price) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00) AS total_revenue
    FROM capacity_listing l
    LEFT JOIN booking b ON b.listing_id = l.id
    GROUP BY l.route_id
)
SELECT
    r.id AS route_id,
    orig.un_locode || ' -> ' || dest.un_locode AS route_code,
    orig.name AS origin_port,
    dest.name AS destination_port,
    r.typical_transit_days,
    COALESCE(rlc.listings_published, 0) AS total_listings_published,
    COALESCE(rbm.active_booking_count, 0) AS active_booking_count,
    COALESCE(rbm.total_cbm_moved, 0.00) AS total_cbm_moved,
    COALESCE(rbm.total_tonnes_moved, 0.00) AS total_tonnes_moved,
    COALESCE(rbm.total_revenue, 0.00) AS total_route_revenue
FROM route r
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
LEFT JOIN route_listing_counts rlc ON rlc.route_id = r.id
LEFT JOIN route_booking_metrics rbm ON rbm.route_id = r.id
ORDER BY active_booking_count DESC, total_cbm_moved DESC;


-- ----------------------------------------------------------------------------
-- 3.4 Average Price per CBM and per Tonne per Route
--
-- Metric Definition:
--   Evaluates market rate benchmarks for published listings on each route.
-- ----------------------------------------------------------------------------
SELECT
    r.id AS route_id,
    orig.un_locode || ' -> ' || dest.un_locode AS route_code,
    orig.name AS origin_port,
    dest.name AS destination_port,
    count(l.id) AS published_listing_count,
    ROUND(AVG(l.price_per_cbm), 2) AS avg_price_per_cbm,
    ROUND(MIN(l.price_per_cbm), 2) AS min_price_per_cbm,
    ROUND(MAX(l.price_per_cbm), 2) AS max_price_per_cbm,
    ROUND(AVG(l.price_per_tonne), 2) AS avg_price_per_tonne,
    ROUND(AVG(l.minimum_charge), 2) AS avg_minimum_charge
FROM route r
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
JOIN capacity_listing l ON l.route_id = r.id
GROUP BY r.id, orig.un_locode, dest.un_locode, orig.name, dest.name
ORDER BY published_listing_count DESC, avg_price_per_cbm ASC;


-- ============================================================================
-- SECTION 4: SUBQUERY FILTERING
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 Listings Priced Strictly Below Their Route's Average Price
--
-- Scope Definition:
--   Scoped strictly to currently active and bookable listings (`status = 'open'`
--   and `cutoff_date >= CURRENT_DATE`). This provides actionable deal discovery
--   for traders rather than skewing averages with historical closed voyages.
-- ----------------------------------------------------------------------------
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    orig.un_locode || ' -> ' || dest.un_locode AS route_code,
    l.departure_date,
    l.status AS listing_status,
    l.price_per_cbm,
    route_stats.avg_active_route_cbm_price,
    ROUND(route_stats.avg_active_route_cbm_price - l.price_per_cbm, 2) AS discount_per_cbm
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
JOIN (
    SELECT
        route_id,
        ROUND(AVG(price_per_cbm), 2) AS avg_active_route_cbm_price
    FROM capacity_listing
    WHERE status = 'open' AND cutoff_date >= CURRENT_DATE
    GROUP BY route_id
) route_stats ON l.route_id = route_stats.route_id
WHERE l.status = 'open'
  AND l.cutoff_date >= CURRENT_DATE
  AND l.price_per_cbm < route_stats.avg_active_route_cbm_price
ORDER BY discount_per_cbm DESC;


-- ----------------------------------------------------------------------------
-- 4.2 Traders Who Have Booked With Multiple Distinct Providers
--
-- Scope Definition:
--   Identifies multi-carrier SME traders with bookings across > 1 distinct provider.
--   Filters out cancelled bookings so only active trade relationships count.
-- ----------------------------------------------------------------------------
SELECT
    t.id AS trader_id,
    t.company_name AS trader_company,
    u.email AS trader_email,
    provider_counts.distinct_providers_booked,
    provider_counts.total_active_bookings
FROM trader t
JOIN user_account u ON t.id = u.id
JOIN (
    SELECT
        b.trader_id,
        count(DISTINCT l.provider_id) AS distinct_providers_booked,
        count(b.id) AS total_active_bookings
    FROM booking b
    JOIN capacity_listing l ON b.listing_id = l.id
    WHERE b.status IN ('confirmed', 'completed')
    GROUP BY b.trader_id
    HAVING count(DISTINCT l.provider_id) > 1
) provider_counts ON t.id = provider_counts.trader_id
ORDER BY provider_counts.distinct_providers_booked DESC, provider_counts.total_active_bookings DESC;


-- ----------------------------------------------------------------------------
-- 4.3A Capacity Listings With Zero Bookings Ever
--
-- Scope Definition:
--   Listings that have NEVER had a booking inserted into the database.
--   Matches the 4 Blue Dart listings (L42, L43, L44, L45) created for Edge Case 8.
-- ----------------------------------------------------------------------------
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    orig.un_locode || ' -> ' || dest.un_locode AS route_code,
    l.cutoff_date,
    l.departure_date,
    l.total_cbm,
    l.available_cbm,
    l.price_per_cbm,
    l.status AS listing_status
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
WHERE NOT EXISTS (
    SELECT 1
    FROM booking b
    WHERE b.listing_id = l.id
)
ORDER BY l.id ASC;


-- ----------------------------------------------------------------------------
-- 4.3B Capacity Listings With Zero Currently Active Bookings
--
-- Scope Definition:
--   Listings with no active ('confirmed' or 'completed') bookings.
--   This includes listings with zero bookings ever (4.3A) PLUS listings whose
--   bookings were all cancelled (e.g. unfulfilled inventory).
--
-- Seed Data Note:
--   In the current seed data, every listing that experienced a cancellation
--   either retains another active booking (L12, L15) or received a confirmed
--   rebooking (L07). Because no listing currently has ONLY cancelled bookings,
--   this query returns the same four never-booked Blue Dart listings (L42–L45)
--   as Section 4.3A, each reporting cancelled_booking_count = 0.
--   The query is intentionally structured to generalize across future datasets
--   where all bookings on a listing might be cancelled.
-- ----------------------------------------------------------------------------
SELECT
    l.id AS listing_id,
    p.company_name AS provider_name,
    orig.un_locode || ' -> ' || dest.un_locode AS route_code,
    l.cutoff_date,
    l.departure_date,
    l.total_cbm,
    l.available_cbm,
    l.price_per_cbm,
    l.status AS listing_status,
    (SELECT count(*) FROM booking b WHERE b.listing_id = l.id AND b.status = 'cancelled') AS cancelled_booking_count
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
WHERE NOT EXISTS (
    SELECT 1
    FROM booking b
    WHERE b.listing_id = l.id
      AND b.status IN ('confirmed', 'completed')
)
ORDER BY l.id ASC;


-- ============================================================================
-- SECTION 5: CTE & WINDOW FUNCTIONS — PROVIDER ROUTE PRICING COMPETITIVENESS
-- ============================================================================
-- Business Context:
--   Market intelligence ranking providers by price on competitive shipping routes.
--
-- Scope & Definition:
--   Ranks currently bookable listings (`status = 'open'` and `cutoff_date >= CURRENT_DATE`).
--   Calculates:
--     - DENSE_RANK() OVER (PARTITION BY route_id ORDER BY price_per_cbm ASC):
--       Price rank on the lane (1 = cheapest available provider).
--     - AVG(price_per_cbm) OVER (PARTITION BY route_id): Active route benchmark average.
--     - MIN(price_per_cbm) OVER (PARTITION BY route_id): Active route lowest published rate.
--     - spread_from_best_price: Premium above the best published price on that lane.
-- ============================================================================
WITH active_route_competition AS (
    SELECT
        l.id AS listing_id,
        p.id AS provider_id,
        p.company_name AS provider_name,
        r.id AS route_id,
        orig.un_locode AS origin_code,
        dest.un_locode AS destination_code,
        orig.un_locode || ' -> ' || dest.un_locode AS route_code,
        l.departure_date,
        l.cutoff_date,
        l.price_per_cbm,
        l.price_per_tonne,
        l.minimum_charge,
        l.available_cbm,
        l.status AS listing_status,
        -- Window function: Rank providers by CBM price on this lane (1 = most affordable)
        DENSE_RANK() OVER (
            PARTITION BY l.route_id
            ORDER BY l.price_per_cbm ASC
        ) AS price_rank_on_route,
        -- Window function: Route benchmark average rate
        ROUND(AVG(l.price_per_cbm) OVER (PARTITION BY l.route_id), 2) AS route_avg_cbm_price,
        -- Window function: Route lowest published rate
        MIN(l.price_per_cbm) OVER (PARTITION BY l.route_id) AS route_min_cbm_price,
        -- Window function: Count of competing active listings on this lane
        COUNT(*) OVER (PARTITION BY l.route_id) AS active_listings_on_route
    FROM capacity_listing l
    JOIN provider p ON l.provider_id = p.id
    JOIN route r ON l.route_id = r.id
    JOIN port orig ON r.origin_port_id = orig.id
    JOIN port dest ON r.destination_port_id = dest.id
    WHERE l.status = 'open'
      AND l.cutoff_date >= CURRENT_DATE
)
SELECT
    listing_id,
    route_code,
    provider_name,
    departure_date,
    price_per_cbm,
    price_rank_on_route,
    route_avg_cbm_price,
    route_min_cbm_price,
    ROUND(price_per_cbm - route_min_cbm_price, 2) AS spread_from_best_price,
    active_listings_on_route,
    listing_status
FROM active_route_competition
ORDER BY route_code ASC, price_rank_on_route ASC, departure_date ASC;

