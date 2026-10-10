-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 03_views.sql
-- Description: Database views for trader, provider, and administrator workflows.
-- Purpose: Provides abstractions for available capacity searches, provider listing
--          utilization dashboards, trader booking summaries, and platform reports.
-- Dialect: PostgreSQL (14+)
-- Schema: shipspace
-- ============================================================================

SET search_path TO shipspace, public;

-- ============================================================================
-- 1. TRADER VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- View: v_trader_available_capacity
-- Purpose: Primary search catalog for traders discovering open LCL capacity.
-- Features:
--   - Filters strictly for 'open' listings whose cutoff date has not passed.
--   - Connects route, origin seaport, and destination seaport with UN/LOCODEs.
--   - Aggregates permitted cargo types into a formatted list and an array,
--     preventing duplicate listing rows caused by the 1:M listing_cargo join.
--   - Excludes sensitive provider tax and personal account details.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_trader_available_capacity AS
SELECT
    l.id AS listing_id,
    l.provider_id,
    p.company_name AS provider_name,
    p.contact_phone AS provider_contact_phone,
    r.id AS route_id,
    orig.name AS origin_port,
    orig.country AS origin_country,
    orig.un_locode AS origin_un_locode,
    dest.name AS destination_port,
    dest.country AS destination_country,
    dest.un_locode AS destination_un_locode,
    r.typical_transit_days,
    l.cutoff_date,
    l.departure_date,
    l.arrival_date,
    l.available_cbm,
    l.available_weight,
    l.total_cbm,
    l.total_weight,
    l.price_per_cbm,
    l.price_per_tonne,
    l.minimum_charge,
    l.status AS listing_status,
    COUNT(DISTINCT lc.cargo_type_id) AS permitted_cargo_count,
    string_agg(ct.name, ', ' ORDER BY ct.name) AS permitted_cargo_types,
    array_agg(ct.name ORDER BY ct.name) AS permitted_cargo_types_array
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
JOIN listing_cargo lc ON lc.listing_id = l.id
JOIN cargo_type ct ON lc.cargo_type_id = ct.id
WHERE l.status = 'open'
  AND l.cutoff_date >= CURRENT_DATE
GROUP BY
    l.id,
    l.provider_id,
    p.company_name,
    p.contact_phone,
    r.id,
    orig.name,
    orig.country,
    orig.un_locode,
    dest.name,
    dest.country,
    dest.un_locode,
    r.typical_transit_days,
    l.cutoff_date,
    l.departure_date,
    l.arrival_date,
    l.available_cbm,
    l.available_weight,
    l.total_cbm,
    l.total_weight,
    l.price_per_cbm,
    l.price_per_tonne,
    l.minimum_charge,
    l.status;

COMMENT ON VIEW v_trader_available_capacity IS
'Searchable open LCL capacity listings for traders with route, schedule, remaining volume/weight, pricing, and permitted cargo types.';


-- ----------------------------------------------------------------------------
-- View: v_trader_bookings
-- Purpose: Trader shipment dashboard summarizing individual cargo bookings.
-- Features:
--   - Provides shipment details: trader company, booking quantities, total price,
--     status, listing schedule, route ports, and carrier name.
--   - Exactly 1 row per booking reservation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_trader_bookings AS
SELECT
    b.id AS booking_id,
    b.trader_id,
    t.company_name AS trader_company_name,
    b.listing_id,
    p.id AS provider_id,
    p.company_name AS provider_company_name,
    p.contact_phone AS provider_contact_phone,
    r.id AS route_id,
    orig.name AS origin_port,
    orig.un_locode AS origin_un_locode,
    dest.name AS destination_port,
    dest.un_locode AS destination_un_locode,
    r.typical_transit_days,
    l.cutoff_date,
    l.departure_date,
    l.arrival_date,
    ct.id AS cargo_type_id,
    ct.name AS cargo_type_name,
    b.booked_cbm,
    b.booked_weight,
    b.total_price,
    b.status AS booking_status,
    b.booking_time,
    b.updated_at AS booking_updated_at
FROM booking b
JOIN trader t ON b.trader_id = t.id
JOIN capacity_listing l ON b.listing_id = l.id
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
JOIN cargo_type ct ON b.cargo_type_id = ct.id;

COMMENT ON VIEW v_trader_bookings IS
'Complete booking summary for traders detailing carrier, route, reserved quantities, agreed price snapshot, and booking status.';


-- ============================================================================
-- 2. PROVIDER VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- View: v_provider_listing_utilization
-- Purpose: Provider capacity management dashboard.
-- Features:
--   - Detailed listing-level breakdown of published, consumed, and remaining capacity.
--   - Computes both CBM and Weight utilization percentages.
--   - Aggregates active confirmed and completed bookings per listing.
--   - Aggregates booked revenue committed and realized per listing.
--   - Cancelled bookings are excluded from active capacity deductions and revenue,
--     reflecting exact trigger and capacity restoration logic.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_provider_listing_utilization AS
WITH listing_active_bookings AS (
    SELECT
        listing_id,
        COUNT(id) FILTER (WHERE status IN ('confirmed', 'completed')) AS active_booking_count,
        COUNT(id) FILTER (WHERE status = 'confirmed') AS confirmed_booking_count,
        COUNT(id) FILTER (WHERE status = 'completed') AS completed_booking_count,
        COUNT(id) FILTER (WHERE status = 'cancelled') AS cancelled_booking_count,
        COALESCE(SUM(total_price) FILTER (WHERE status IN ('confirmed', 'completed')), 0.00) AS total_active_revenue
    FROM booking
    GROUP BY listing_id
)
SELECT
    l.id AS listing_id,
    l.provider_id,
    p.company_name AS provider_company_name,
    r.id AS route_id,
    orig.un_locode || ' -> ' || dest.un_locode AS route_code,
    orig.name AS origin_port,
    dest.name AS destination_port,
    l.cutoff_date,
    l.departure_date,
    l.arrival_date,
    l.status AS listing_status,
    l.total_cbm,
    l.available_cbm,
    ROUND(l.total_cbm - l.available_cbm, 2) AS booked_cbm,
    CASE
        WHEN l.total_cbm > 0 THEN
            ROUND(((l.total_cbm - l.available_cbm) / l.total_cbm) * 100.0, 2)
        ELSE 0.00
    END AS cbm_utilization_pct,
    l.total_weight,
    l.available_weight,
    ROUND(l.total_weight - l.available_weight, 2) AS booked_weight,
    CASE
        WHEN l.total_weight > 0 THEN
            ROUND(((l.total_weight - l.available_weight) / l.total_weight) * 100.0, 2)
        ELSE 0.00
    END AS weight_utilization_pct,
    l.price_per_cbm,
    l.price_per_tonne,
    l.minimum_charge,
    COALESCE(lab.active_booking_count, 0) AS active_booking_count,
    COALESCE(lab.confirmed_booking_count, 0) AS confirmed_booking_count,
    COALESCE(lab.completed_booking_count, 0) AS completed_booking_count,
    COALESCE(lab.cancelled_booking_count, 0) AS cancelled_booking_count,
    COALESCE(lab.total_active_revenue, 0.00) AS total_active_revenue
FROM capacity_listing l
JOIN provider p ON l.provider_id = p.id
JOIN route r ON l.route_id = r.id
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
LEFT JOIN listing_active_bookings lab ON lab.listing_id = l.id;

COMMENT ON VIEW v_provider_listing_utilization IS
'Listing-level capacity utilization and booking breakdown for logistics providers.';


-- ============================================================================
-- 3. ADMINISTRATOR VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- View: v_admin_capacity_overview
-- Purpose: Platform-wide route-level and network-level capacity monitoring.
-- Features:
--   - Aggregates published, available, and consumed volume and weight per route.
--   - Pre-aggregates listing and booking counts separately to avoid join multiplication.
--   - Provides platform oversight of supply, demand, and freight volume across all lanes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_admin_capacity_overview AS
WITH route_listings AS (
    SELECT
        route_id,
        COUNT(id) AS total_listings,
        COUNT(id) FILTER (WHERE status = 'open') AS open_listings,
        COUNT(id) FILTER (WHERE status = 'full') AS full_listings,
        COUNT(id) FILTER (WHERE status = 'closed') AS closed_listings,
        COUNT(id) FILTER (WHERE status = 'cancelled') AS cancelled_listings,
        COALESCE(SUM(total_cbm), 0.00) AS total_published_cbm,
        COALESCE(SUM(available_cbm), 0.00) AS total_available_cbm,
        COALESCE(SUM(total_weight), 0.00) AS total_published_weight,
        COALESCE(SUM(available_weight), 0.00) AS total_available_weight,
        ROUND(AVG(price_per_cbm), 2) AS avg_price_per_cbm,
        ROUND(AVG(price_per_tonne), 2) AS avg_price_per_tonne
    FROM capacity_listing
    GROUP BY route_id
),
route_bookings AS (
    SELECT
        l.route_id,
        COUNT(b.id) FILTER (WHERE b.status IN ('confirmed', 'completed')) AS total_active_bookings,
        COUNT(b.id) FILTER (WHERE b.status = 'confirmed') AS confirmed_bookings,
        COUNT(b.id) FILTER (WHERE b.status = 'completed') AS completed_bookings,
        COUNT(b.id) FILTER (WHERE b.status = 'cancelled') AS cancelled_bookings,
        COALESCE(SUM(b.booked_cbm) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00) AS total_booked_cbm,
        COALESCE(SUM(b.booked_weight) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00) AS total_booked_weight,
        COALESCE(SUM(b.total_price) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00) AS total_active_revenue
    FROM capacity_listing l
    JOIN booking b ON b.listing_id = l.id
    GROUP BY l.route_id
)
SELECT
    r.id AS route_id,
    orig.un_locode || ' -> ' || dest.un_locode AS route_code,
    orig.name AS origin_port,
    orig.country AS origin_country,
    dest.name AS destination_port,
    dest.country AS destination_country,
    r.typical_transit_days,
    COALESCE(rl.total_listings, 0) AS total_listings_count,
    COALESCE(rl.open_listings, 0) AS open_listings_count,
    COALESCE(rl.full_listings, 0) AS full_listings_count,
    COALESCE(rl.closed_listings, 0) AS closed_listings_count,
    COALESCE(rl.total_published_cbm, 0.00) AS total_published_cbm,
    COALESCE(rl.total_available_cbm, 0.00) AS total_available_cbm,
    COALESCE(rb.total_booked_cbm, 0.00) AS total_booked_cbm,
    CASE
        WHEN COALESCE(rl.total_published_cbm, 0.00) > 0 THEN
            ROUND((COALESCE(rb.total_booked_cbm, 0.00) / rl.total_published_cbm) * 100.0, 2)
        ELSE 0.00
    END AS route_cbm_utilization_pct,
    COALESCE(rl.total_published_weight, 0.00) AS total_published_weight,
    COALESCE(rl.total_available_weight, 0.00) AS total_available_weight,
    COALESCE(rb.total_booked_weight, 0.00) AS total_booked_weight,
    CASE
        WHEN COALESCE(rl.total_published_weight, 0.00) > 0 THEN
            ROUND((COALESCE(rb.total_booked_weight, 0.00) / rl.total_published_weight) * 100.0, 2)
        ELSE 0.00
    END AS route_weight_utilization_pct,
    COALESCE(rb.total_active_bookings, 0) AS total_active_bookings,
    COALESCE(rb.confirmed_bookings, 0) AS confirmed_bookings,
    COALESCE(rb.completed_bookings, 0) AS completed_bookings,
    COALESCE(rb.cancelled_bookings, 0) AS cancelled_bookings,
    COALESCE(rb.total_active_revenue, 0.00) AS total_active_revenue,
    rl.avg_price_per_cbm,
    rl.avg_price_per_tonne
FROM route r
JOIN port orig ON r.origin_port_id = orig.id
JOIN port dest ON r.destination_port_id = dest.id
LEFT JOIN route_listings rl ON rl.route_id = r.id
LEFT JOIN route_bookings rb ON rb.route_id = r.id
ORDER BY total_active_bookings DESC, route_code ASC;

COMMENT ON VIEW v_admin_capacity_overview IS
'Platform administrator route-level capacity monitoring, booking throughput, and market rate overview.';


-- ----------------------------------------------------------------------------
-- View: v_admin_platform_summary
-- Purpose: Executive platform-wide metric summary.
-- Features:
--   - Single-row executive KPI snapshot aggregating user adoption, active listings,
--     total booked volume/weight, capacity utilization, and total revenue.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_admin_platform_summary AS
SELECT
    (SELECT COUNT(*) FROM provider) AS total_providers_count,
    (SELECT COUNT(*) FROM trader) AS total_traders_count,
    (SELECT COUNT(*) FROM port) AS total_ports_count,
    (SELECT COUNT(*) FROM route) AS total_routes_count,
    (SELECT COUNT(*) FROM capacity_listing) AS total_listings_count,
    (SELECT COUNT(*) FROM capacity_listing WHERE status = 'open') AS open_listings_count,
    (SELECT COUNT(*) FROM capacity_listing WHERE status = 'full') AS full_listings_count,
    (SELECT COUNT(*) FROM capacity_listing WHERE status = 'closed') AS closed_listings_count,
    (SELECT COALESCE(SUM(total_cbm), 0.00) FROM capacity_listing) AS platform_total_published_cbm,
    (SELECT COALESCE(SUM(available_cbm), 0.00) FROM capacity_listing) AS platform_total_available_cbm,
    (SELECT COALESCE(SUM(total_weight), 0.00) FROM capacity_listing) AS platform_total_published_weight,
    (SELECT COALESCE(SUM(available_weight), 0.00) FROM capacity_listing) AS platform_total_available_weight,
    (SELECT COUNT(*) FROM booking WHERE status IN ('confirmed', 'completed')) AS total_active_bookings_count,
    (SELECT COUNT(*) FROM booking WHERE status = 'confirmed') AS confirmed_bookings_count,
    (SELECT COUNT(*) FROM booking WHERE status = 'completed') AS completed_bookings_count,
    (SELECT COUNT(*) FROM booking WHERE status = 'cancelled') AS cancelled_bookings_count,
    (SELECT COALESCE(SUM(booked_cbm), 0.00) FROM booking WHERE status IN ('confirmed', 'completed')) AS platform_active_booked_cbm,
    (SELECT COALESCE(SUM(booked_weight), 0.00) FROM booking WHERE status IN ('confirmed', 'completed')) AS platform_active_booked_weight,
    ROUND(
        (
            (SELECT COALESCE(SUM(booked_cbm), 0.00) FROM booking WHERE status IN ('confirmed', 'completed'))
            / NULLIF((SELECT SUM(total_cbm) FROM capacity_listing), 0)
        ) * 100.0,
        2
    ) AS platform_cbm_utilization_pct,
    (SELECT COALESCE(SUM(total_price), 0.00) FROM booking WHERE status = 'completed') AS realized_platform_revenue,
    (SELECT COALESCE(SUM(total_price), 0.00) FROM booking WHERE status = 'confirmed') AS committed_pipeline_revenue,
    (SELECT COALESCE(SUM(total_price), 0.00) FROM booking WHERE status IN ('confirmed', 'completed')) AS total_active_platform_revenue,
    (SELECT COALESCE(SUM(total_price), 0.00) FROM booking WHERE status = 'cancelled') AS lost_cancelled_revenue;

COMMENT ON VIEW v_admin_platform_summary IS
'Executive platform KPI summary showing overall marketplace adoption, volume, utilization, and financial revenue.';
