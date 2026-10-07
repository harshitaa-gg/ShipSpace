-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 00_reset.sql
-- Description: Safely resets the ShipSpace database environment for a clean
--              rebuild from scratch.
-- Dialect: PostgreSQL (14+)
-- ============================================================================

-- Drop the project schema and all dependent objects (tables, views, functions, triggers, etc.)
DROP SCHEMA IF EXISTS shipspace CASCADE;

-- Recreate the project schema
CREATE SCHEMA shipspace;

-- Add descriptive comment
COMMENT ON SCHEMA shipspace IS 'ShipSpace LCL Marketplace schema containing all core tables, views, and business logic';

-- Set search_path so subsequent scripts execute cleanly within the shipspace schema
SET search_path TO shipspace, public;

-- Optional alternative if running directly in PostgreSQL default public schema:
-- (Uncomment below if deploying to public schema instead of a dedicated named schema):
-- DROP SCHEMA IF EXISTS public CASCADE;
-- CREATE SCHEMA public;
-- GRANT ALL ON SCHEMA public TO postgres, public;
-- SET search_path TO public;
