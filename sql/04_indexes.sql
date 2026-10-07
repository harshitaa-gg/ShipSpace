-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 04_indexes.sql
-- Description: Performance optimization indexes.
-- Purpose: Defines B-tree and composite indexes supporting trader capacity searches,
--          foreign key joins, date-range filtering, and status lookups.
-- ============================================================================

SET search_path TO shipspace, public;
