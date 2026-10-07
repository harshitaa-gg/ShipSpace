-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 07_test_queries.sql
-- Description: Verification, testing, and reconciliation test suite.
-- Purpose: Contains search queries, negative test cases (violating business rules),
--          concurrency test instructions (row-locking verification), and
--          reconciliation checks comparing stored availability against active bookings.
-- ============================================================================

SET search_path TO shipspace, public;
