-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 04_indexes.sql
-- Description: Phase 6C: Performance Optimization Indexes
-- Purpose: Defines targeted B-tree, composite, and partial indexes supporting
--          trader capacity searches, foreign key joins, booking lookups,
--          date-range schedule filtering, and audit history queries.
-- Dialect: PostgreSQL (14+)
-- Schema: shipspace
--
-- Optimization Principles:
--   1. Foreign Key Join Acceleration: Every child FK column that is frequently
--      joined or cascaded gets an index to avoid sequential scans.
--   2. Multi-Constraint Search Acceleration: Partial & composite indexes on
--      capacity_listing specifically tuned for the 6-parameter trader search query.
--   3. Uniqueness Enforcement: Avoid redundant indexes where a UNIQUE or PK
--      constraint already built an underlying index.
--   4. Idempotent DDL: Uses CREATE INDEX IF NOT EXISTS throughout.
-- ============================================================================

SET search_path TO shipspace, public;

-- ============================================================================
-- 1. CAPACITY_LISTING INDEXES
-- Core table queried during capacity discovery, booking validation, and utilization.
-- ============================================================================

-- 1.1 Trader Capacity Search Composite & Partial Index
-- Accelerates Section 1 search queries:
--   WHERE route_id = ... AND status = 'open' AND cutoff_date >= CURRENT_DATE
-- Includes available capacity and pricing to support index-assisted scans.
CREATE INDEX IF NOT EXISTS idx_capacity_listing_search_open
    ON capacity_listing (route_id, departure_date, cutoff_date)
    WHERE status = 'open';

-- 1.2 Foreign Key Index: Provider Listings Lookup
-- Supports provider dashboard joins (v_provider_listing_utilization) and FK integrity checks.
CREATE INDEX IF NOT EXISTS idx_capacity_listing_provider_id
    ON capacity_listing (provider_id);

-- 1.3 Route Index
-- Supports joins from route to capacity listings in network-wide aggregates.
CREATE INDEX IF NOT EXISTS idx_capacity_listing_route_id
    ON capacity_listing (route_id);

-- 1.4 Schedule Date Ranges
-- Supports temporal queries, past-cutoff management, and departure window filters.
CREATE INDEX IF NOT EXISTS idx_capacity_listing_dates
    ON capacity_listing (departure_date, arrival_date);


-- ============================================================================
-- 2. BOOKING INDEXES
-- High-throughput transaction table queried by traders, providers, and audit triggers.
-- ============================================================================

-- 2.1 Foreign Key Index: Trader Bookings Lookup
-- Supports trader dashboards (v_trader_bookings) and shipper order history.
CREATE INDEX IF NOT EXISTS idx_booking_trader_id
    ON booking (trader_id);

-- 2.2 Foreign Key & Status Index: Listing Active Reservations
-- Accelerates capacity recalculations, reconciliation checks, and trigger checks:
--   WHERE listing_id = ... AND status IN ('confirmed', 'completed')
CREATE INDEX IF NOT EXISTS idx_booking_listing_status
    ON booking (listing_id, status);

-- 2.3 Foreign Key Index: Cargo Classification on Bookings
-- Supports cargo volume reporting and FK cascade/restrict checks.
CREATE INDEX IF NOT EXISTS idx_booking_cargo_type_id
    ON booking (cargo_type_id);

-- 2.4 Composite Foreign Key Index: Listing Cargo Permitted Association
-- Supports FK constraint fk_booking_listing_cargo (listing_id, cargo_type_id).
CREATE INDEX IF NOT EXISTS idx_booking_listing_cargo
    ON booking (listing_id, cargo_type_id);

-- 2.5 Temporal Booking Index: Booking Creation & Recency
-- Supports operational chronological filtering and recent reservation metrics.
CREATE INDEX IF NOT EXISTS idx_booking_booking_time
    ON booking (booking_time);


-- ============================================================================
-- 3. ROUTE & PORT INDEXES
-- Navigational reference tables for port pairs and shipping lanes.
-- Note: uq_route_ports UNIQUE (origin_port_id, destination_port_id) already creates
-- an index covering origin_port_id. An index on destination_port_id is required
-- for reverse lookups and destination FK checks.
-- ============================================================================

-- 3.1 Destination Port FK Index
CREATE INDEX IF NOT EXISTS idx_route_destination_port_id
    ON route (destination_port_id);


-- ============================================================================
-- 4. LISTING_CARGO JUNCTION INDEXES
-- Resolves M:N associations between capacity listings and allowed cargo types.
-- Note: pk_listing_cargo PRIMARY KEY (listing_id, cargo_type_id) already covers listing_id.
-- ============================================================================

-- 4.1 Cargo Type Reverse Lookup Index
-- Accelerates searches filtering by cargo type:
--   JOIN listing_cargo lc ON lc.listing_id = l.id WHERE lc.cargo_type_id = ...
CREATE INDEX IF NOT EXISTS idx_listing_cargo_cargo_type_id
    ON listing_cargo (cargo_type_id);


-- ============================================================================
-- 5. BOOKING_STATUS_HISTORY AUDIT INDEXES
-- Immutable audit log for lifecycle status transitions.
-- ============================================================================

-- 5.1 Booking Lifecycle History Lookup
-- Accelerates retrieval of audit trails for a specific booking.
CREATE INDEX IF NOT EXISTS idx_booking_history_booking_id
    ON booking_status_history (booking_id);

-- 5.2 User Attribution Audit Lookup
-- Accelerates compliance audits querying actions performed by a user/admin.
CREATE INDEX IF NOT EXISTS idx_booking_history_changed_by
    ON booking_status_history (changed_by_user_id);

-- 5.3 Chronological Audit Index
CREATE INDEX IF NOT EXISTS idx_booking_history_changed_at
    ON booking_status_history (changed_at);


-- ============================================================================
-- 6. ADMINISTRATIVE JUNCTION TABLE INDEXES
-- Covers secondary foreign keys in admin management junction tables.
-- Primary keys already index (admin_id, <entity>_id).
-- ============================================================================

-- 6.1 Admin Port Secondary FK Index
CREATE INDEX IF NOT EXISTS idx_admin_port_port_id
    ON admin_port (port_id);

-- 6.2 Admin Route Secondary FK Index
CREATE INDEX IF NOT EXISTS idx_admin_route_route_id
    ON admin_route (route_id);

-- 6.3 Admin Cargo Type Secondary FK Index
CREATE INDEX IF NOT EXISTS idx_admin_cargo_type_cargo_type_id
    ON admin_cargo_type (cargo_type_id);
