-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 06_roles.sql
-- Description: Role-Based Access Control (RBAC) and permissions.
-- Purpose: Defines PostgreSQL database roles (admin, provider, trader, anonymous)
--          and assigns appropriate schema, table, and sequence privileges.
-- ============================================================================

SET search_path TO shipspace, public;
