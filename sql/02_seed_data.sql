-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 02_seed_data.sql
-- Description: Realistic sample data insertion script.
-- Purpose: Seeds sample providers, traders, administrators, reference ports,
--          shipping routes, cargo types, capacity listings, allowed cargo junctions,
--          active/cancelled bookings, and status history including edge cases.
-- ============================================================================

SET search_path TO shipspace, public;
