-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 05_functions_triggers.sql
-- Description: Stored procedures, functions, and database triggers.
-- Purpose: Implements atomic booking transactions, concurrency-safe capacity
--          decrement/restoration, automatic listing status updates (open/full/closed),
--          booking cutoff validation, and booking status change audit logging.
-- ============================================================================

SET search_path TO shipspace, public;
