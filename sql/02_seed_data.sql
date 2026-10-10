-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 02_seed_data.sql
-- Description: Realistic, production-grade sample seed data script.
-- Execution Order:
--   00_reset.sql -> 01_schema.sql -> 05_functions_triggers.sql -> 02_seed_data.sql
-- Dialect: PostgreSQL (14+)
-- ============================================================================

\set ON_ERROR_STOP on
SET search_path TO shipspace, public;

BEGIN;

-- ============================================================================
-- 0. TRIGGER & PROCEDURAL INFRASTRUCTURE PRE-FLIGHT GUARD
-- Verifies that all required triggers, functions, and procedures from
-- 05_functions_triggers.sql exist and are enabled before modifying data.
-- ============================================================================
DO $$
DECLARE
    v_missing_items TEXT := '';
BEGIN
    -- 1. Check triggers on booking
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'shipspace' AND c.relname = 'booking'
          AND t.tgname = 'trg_validate_and_reserve_booking' AND t.tgenabled = 'O'
    ) THEN
        v_missing_items := v_missing_items || ' [trigger trg_validate_and_reserve_booking on booking]';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'shipspace' AND c.relname = 'booking'
          AND t.tgname = 'trg_validate_booking_status_transition' AND t.tgenabled = 'O'
    ) THEN
        v_missing_items := v_missing_items || ' [trigger trg_validate_booking_status_transition on booking]';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'shipspace' AND c.relname = 'booking'
          AND t.tgname = 'trg_restore_capacity_on_cancellation' AND t.tgenabled = 'O'
    ) THEN
        v_missing_items := v_missing_items || ' [trigger trg_restore_capacity_on_cancellation on booking]';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'shipspace' AND c.relname = 'booking'
          AND t.tgname = 'trg_record_booking_status_history' AND t.tgenabled = 'O'
    ) THEN
        v_missing_items := v_missing_items || ' [trigger trg_record_booking_status_history on booking]';
    END IF;

    -- 2. Check procedure sp_cancel_booking
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'shipspace' AND p.proname = 'sp_cancel_booking'
    ) THEN
        v_missing_items := v_missing_items || ' [procedure sp_cancel_booking]';
    END IF;

    IF v_missing_items <> '' THEN
        RAISE EXCEPTION 'Pre-flight check failed! Required triggers/functions missing or disabled:% Ensure 05_functions_triggers.sql is executed before 02_seed_data.sql.',
            v_missing_items;
    END IF;

    RAISE NOTICE 'Pre-flight check passed: all required booking triggers and procedures are present and active.';
END $$;


-- ============================================================================
-- 1. USER ACCOUNTS & SUBTYPE PROFILES
-- Target: 6 Providers, 20 Traders, 2 Admins (Total: 28 user accounts).
-- Enforces Table-per-Subclass hierarchy: user_account -> (provider | trader | admin).
-- ============================================================================

-- 1.1 Providers (6)
INSERT INTO user_account (name, email, password_hash, role) VALUES
('Maersk LCL Consolidation India', 'ops.india@maersk-lcl.com', 'scrypt$hash$p1', 'provider'),
('MSC Mediterranean Line Logistics', 'bookings@msc-logistics.in', 'scrypt$hash$p2', 'provider'),
('CMA CGM Consolidation Services', 'lcl.sea@cma-cgm-india.com', 'scrypt$hash$p3', 'provider'),
('Hapag-Lloyd Ocean Express', 'capacity@hapag-ocean.de', 'scrypt$hash$p4', 'provider'),
('Ocean Network Express (ONE) LCL', 'space.desk@one-line.sg', 'scrypt$hash$p5', 'provider'),
('Blue Dart Global Ocean Freight', 'ocean@bluedart-global.com', 'scrypt$hash$p6', 'provider');

INSERT INTO provider (id, role, company_name, gst_tax_id, contact_phone) VALUES
((SELECT id FROM user_account WHERE email = 'ops.india@maersk-lcl.com'), 'provider', 'Maersk Logistics India Pvt Ltd', '27AAACM1234F1Z1', '+91-22-67891001'),
((SELECT id FROM user_account WHERE email = 'bookings@msc-logistics.in'), 'provider', 'MSC Mediterranean Shipping Co India', '27AAACM5678G2Z2', '+91-22-67891002'),
((SELECT id FROM user_account WHERE email = 'lcl.sea@cma-cgm-india.com'), 'provider', 'CMA CGM Agencies India Pvt Ltd', '27AAACC9012H3Z3', '+91-22-67891003'),
((SELECT id FROM user_account WHERE email = 'capacity@hapag-ocean.de'), 'provider', 'Hapag-Lloyd Global Logistics GmbH', '27AAACH3456J4Z4', '+49-40-30012004'),
((SELECT id FROM user_account WHERE email = 'space.desk@one-line.sg'), 'provider', 'Ocean Network Express Pte Ltd', '27AAACO7890K5Z5', '+65-6899-1005'),
((SELECT id FROM user_account WHERE email = 'ocean@bluedart-global.com'), 'provider', 'Blue Dart Express Freight Ltd', '27AAACB2345L6Z6', '+91-22-67891006');

-- 1.2 Traders (20)
INSERT INTO user_account (name, email, password_hash, role) VALUES
('Aarav Textiles Export House', 'shipping@aaravtextiles.in', 'scrypt$hash$t1', 'trader'),
('Bharat Auto Components Ltd', 'logistics@bharatauto.com', 'scrypt$hash$t2', 'trader'),
('Coromandel Agro & Spice Traders', 'export@coromandelagro.com', 'scrypt$hash$t3', 'trader'),
('Deccan Pharma Formulations', 'dispatch@deccanpharma.in', 'scrypt$hash$t4', 'trader'),
('Eastern Handicrafts & Coir', 'ops@easternhandicrafts.org', 'scrypt$hash$t5', 'trader'),
('Falcon Fasteners & Engineering', 'cargo@falconfasteners.com', 'scrypt$hash$t6', 'trader'),
('Gujarat Polymers & Chemical Co', 'supplychain@gujaratpolymers.in', 'scrypt$hash$t7', 'trader'),
('Himalayan Organic Tea Exports', 'trade@himalayantea.com', 'scrypt$hash$t8', 'trader'),
('Indus Electronic Systems LLP', 'freight@induselectronics.co.in', 'scrypt$hash$t9', 'trader'),
('Jaipur Ceramic & Stoneware', 'sales@jaipurceramics.in', 'scrypt$hash$t10', 'trader'),
('Kalinga Iron & Metal Forgings', 'export@kalingametal.com', 'scrypt$hash$t11', 'trader'),
('Lotus Herbal Beauty Products', 'dispatch@lotusbeauty.in', 'scrypt$hash$t12', 'trader'),
('Malabar Marine & Frozen Foods', 'coldchain@malabarmarine.com', 'scrypt$hash$t13', 'trader'),
('Navkar Synthetic Leather Goods', 'traffic@navkarleather.com', 'scrypt$hash$t14', 'trader'),
('Omkar Solar Energy Modules', 'shipments@omkarsolar.in', 'scrypt$hash$t15', 'trader'),
('Precision Surgical Instruments', 'logistics@precisionsurgical.com', 'scrypt$hash$t16', 'trader'),
('Quantum Hardware & Tools Ltd', 'trade@quantumhardware.com', 'scrypt$hash$t17', 'trader'),
('Royal Silks & Silk Garments', 'cargo@royalsilks.in', 'scrypt$hash$t18', 'trader'),
('Sundaram Paper & Board Mills', 'export@sundarampaper.com', 'scrypt$hash$t19', 'trader'),
('Tata Star Retail Logistics', 'sea.logistics@starretail.in', 'scrypt$hash$t20', 'trader');

INSERT INTO trader (id, role, company_name, gst_tax_id, contact_phone) VALUES
((SELECT id FROM user_account WHERE email = 'shipping@aaravtextiles.in'), 'trader', 'Aarav Textiles Export House', '33AAACT1001A1Z1', '+91-44-24560001'),
((SELECT id FROM user_account WHERE email = 'logistics@bharatauto.com'), 'trader', 'Bharat Auto Components Ltd', '27AAACB2002B1Z2', '+91-20-27120002'),
((SELECT id FROM user_account WHERE email = 'export@coromandelagro.com'), 'trader', 'Coromandel Agro & Spice Traders', '32AAACC3003C1Z3', '+91-484-2660003'),
((SELECT id FROM user_account WHERE email = 'dispatch@deccanpharma.in'), 'trader', 'Deccan Pharma Formulations', '36AAACD4004D1Z4', '+91-40-23780004'),
((SELECT id FROM user_account WHERE email = 'ops@easternhandicrafts.org'), 'trader', 'Eastern Handicrafts & Coir Export', '19AAACE5005E1Z5', '+91-33-22890005'),
((SELECT id FROM user_account WHERE email = 'cargo@falconfasteners.com'), 'trader', 'Falcon Fasteners & Engineering', '03AAACF6006F1Z6', '+91-161-2890006'),
((SELECT id FROM user_account WHERE email = 'supplychain@gujaratpolymers.in'), 'trader', 'Gujarat Polymers & Chemical Co', '24AAACG7007G1Z7', '+91-265-2340007'),
((SELECT id FROM user_account WHERE email = 'trade@himalayantea.com'), 'trader', 'Himalayan Organic Tea Exports', '19AAACH8008H1Z8', '+91-353-2560008'),
((SELECT id FROM user_account WHERE email = 'freight@induselectronics.co.in'), 'trader', 'Indus Electronic Systems LLP', '29AAACI9009I1Z9', '+91-80-41230009'),
((SELECT id FROM user_account WHERE email = 'sales@jaipurceramics.in'), 'trader', 'Jaipur Ceramic & Stoneware', '08AAACJ0101J1Z0', '+91-141-2780010'),
((SELECT id FROM user_account WHERE email = 'export@kalingametal.com'), 'trader', 'Kalinga Iron & Metal Forgings', '21AAACK1212K1Z1', '+91-674-2580011'),
((SELECT id FROM user_account WHERE email = 'dispatch@lotusbeauty.in'), 'trader', 'Lotus Herbal Beauty Products', '07AAACL2323L1Z2', '+91-11-26780012'),
((SELECT id FROM user_account WHERE email = 'coldchain@malabarmarine.com'), 'trader', 'Malabar Marine & Frozen Foods', '32AAACM3434M1Z3', '+91-484-2890013'),
((SELECT id FROM user_account WHERE email = 'traffic@navkarleather.com'), 'trader', 'Navkar Synthetic Leather Goods', '33AAACN4545N1Z4', '+91-44-25670014'),
((SELECT id FROM user_account WHERE email = 'shipments@omkarsolar.in'), 'trader', 'Omkar Solar Energy Modules', '24AAACO5656O1Z5', '+91-79-26560015'),
((SELECT id FROM user_account WHERE email = 'logistics@precisionsurgical.com'), 'trader', 'Precision Surgical Instruments', '06AAACP6767P1Z6', '+91-171-2550016'),
((SELECT id FROM user_account WHERE email = 'trade@quantumhardware.com'), 'trader', 'Quantum Hardware & Tools Ltd', '27AAACQ7878Q1Z7', '+91-22-28560017'),
((SELECT id FROM user_account WHERE email = 'cargo@royalsilks.in'), 'trader', 'Royal Silks & Silk Garments', '29AAACR8989R1Z8', '+91-80-22220018'),
((SELECT id FROM user_account WHERE email = 'export@sundarampaper.com'), 'trader', 'Sundaram Paper & Board Mills', '33AAACS9090S1Z9', '+91-422-2450019'),
((SELECT id FROM user_account WHERE email = 'sea.logistics@starretail.in'), 'trader', 'Tata Star Retail Logistics', '27AAACT0123T1Z0', '+91-22-66650020');

-- 1.3 Administrators (2)
INSERT INTO user_account (name, email, password_hash, role) VALUES
('ShipSpace Chief System Admin', 'superadmin@shipspace.internal', 'scrypt$hash$adm1', 'admin'),
('Compliance & Operations Officer', 'compliance@shipspace.internal', 'scrypt$hash$adm2', 'admin');

INSERT INTO admin (id, role) VALUES
((SELECT id FROM user_account WHERE email = 'superadmin@shipspace.internal'), 'admin'),
((SELECT id FROM user_account WHERE email = 'compliance@shipspace.internal'), 'admin');


-- ============================================================================
-- 2. REFERENCE SEAPORTS (12 Ports)
-- Satisfies UN/LOCODE format: ^[A-Z]{2}[A-Z0-9]{3}$ (5 uppercase characters)
-- ============================================================================
INSERT INTO port (name, country, un_locode) VALUES
('Jawaharlal Nehru Port (Nhava Sheva)', 'India', 'INNSA'),
('Port of Mundra', 'India', 'INMUN'),
('Chennai Port', 'India', 'INMAA'),
('V.O. Chidambaranar Port (Tuticorin)', 'India', 'INTUT'),
('Syama Prasad Mookerjee Port (Kolkata)', 'India', 'INCCU'),
('Port of Singapore', 'Singapore', 'SGSIN'),
('Port of Jebel Ali (Dubai)', 'United Arab Emirates', 'AEJEA'),
('Port of Colombo', 'Sri Lanka', 'LKCMB'),
('Port of Shanghai', 'China', 'CNSHA'),
('Port of Rotterdam', 'Netherlands', 'NLRTM'),
('Port of Hamburg', 'Germany', 'DEHAM'),
('Port of Los Angeles', 'United States', 'USLAX');


-- ============================================================================
-- 3. SHIPPING ROUTES (24 Unique Directed Routes)
-- Enforces: origin <> destination, unique (origin, destination), typical_transit_days > 0
-- ============================================================================
INSERT INTO route (origin_port_id, destination_port_id, typical_transit_days) VALUES
-- From Nhava Sheva (INNSA)
((SELECT id FROM port WHERE un_locode = 'INNSA'), (SELECT id FROM port WHERE un_locode = 'AEJEA'), 4),
((SELECT id FROM port WHERE un_locode = 'INNSA'), (SELECT id FROM port WHERE un_locode = 'SGSIN'), 7),
((SELECT id FROM port WHERE un_locode = 'INNSA'), (SELECT id FROM port WHERE un_locode = 'NLRTM'), 21),
((SELECT id FROM port WHERE un_locode = 'INNSA'), (SELECT id FROM port WHERE un_locode = 'USLAX'), 28),
-- From Mundra (INMUN)
((SELECT id FROM port WHERE un_locode = 'INMUN'), (SELECT id FROM port WHERE un_locode = 'AEJEA'), 3),
((SELECT id FROM port WHERE un_locode = 'INMUN'), (SELECT id FROM port WHERE un_locode = 'SGSIN'), 8),
((SELECT id FROM port WHERE un_locode = 'INMUN'), (SELECT id FROM port WHERE un_locode = 'DEHAM'), 22),
((SELECT id FROM port WHERE un_locode = 'INMUN'), (SELECT id FROM port WHERE un_locode = 'NLRTM'), 20),
-- From Chennai (INMAA)
((SELECT id FROM port WHERE un_locode = 'INMAA'), (SELECT id FROM port WHERE un_locode = 'SGSIN'), 5),
((SELECT id FROM port WHERE un_locode = 'INMAA'), (SELECT id FROM port WHERE un_locode = 'LKCMB'), 2),
((SELECT id FROM port WHERE un_locode = 'INMAA'), (SELECT id FROM port WHERE un_locode = 'CNSHA'), 14),
-- From Tuticorin (INTUT)
((SELECT id FROM port WHERE un_locode = 'INTUT'), (SELECT id FROM port WHERE un_locode = 'LKCMB'), 1),
((SELECT id FROM port WHERE un_locode = 'INTUT'), (SELECT id FROM port WHERE un_locode = 'SGSIN'), 6),
((SELECT id FROM port WHERE un_locode = 'INTUT'), (SELECT id FROM port WHERE un_locode = 'AEJEA'), 7),
-- From Kolkata (INCCU)
((SELECT id FROM port WHERE un_locode = 'INCCU'), (SELECT id FROM port WHERE un_locode = 'SGSIN'), 6),
((SELECT id FROM port WHERE un_locode = 'INCCU'), (SELECT id FROM port WHERE un_locode = 'LKCMB'), 4),
-- From Singapore (SGSIN)
((SELECT id FROM port WHERE un_locode = 'SGSIN'), (SELECT id FROM port WHERE un_locode = 'INNSA'), 7),
((SELECT id FROM port WHERE un_locode = 'SGSIN'), (SELECT id FROM port WHERE un_locode = 'CNSHA'), 6),
((SELECT id FROM port WHERE un_locode = 'SGSIN'), (SELECT id FROM port WHERE un_locode = 'USLAX'), 18),
-- From Jebel Ali (AEJEA)
((SELECT id FROM port WHERE un_locode = 'AEJEA'), (SELECT id FROM port WHERE un_locode = 'INNSA'), 4),
((SELECT id FROM port WHERE un_locode = 'AEJEA'), (SELECT id FROM port WHERE un_locode = 'NLRTM'), 18),
-- From Colombo (LKCMB)
((SELECT id FROM port WHERE un_locode = 'LKCMB'), (SELECT id FROM port WHERE un_locode = 'INMAA'), 2),
((SELECT id FROM port WHERE un_locode = 'LKCMB'), (SELECT id FROM port WHERE un_locode = 'NLRTM'), 19),
-- From Shanghai (CNSHA)
((SELECT id FROM port WHERE un_locode = 'CNSHA'), (SELECT id FROM port WHERE un_locode = 'INNSA'), 14);


-- ============================================================================
-- 4. CARGO TYPES (10 Types)
-- Distinct classifications, avoiding 07_test_queries collisions ('General Cargo', 'Hazardous Chemicals')
-- ============================================================================
INSERT INTO cargo_type (name, description) VALUES
('Standard Dry Merchandise', 'Packaged non-perishable commercial manufactured goods and dry cartons'),
('Industrial Machinery & Spares', 'Heavy mechanical assemblies, machine components, tooling and spare hardware'),
('Textiles & Apparel Goods', 'Rolls of fabric, yarn, woven garments, and finished apparel products'),
('Electronics & Telecommunications', 'Semiconductors, sensitive PCB boards, consumer electronics, and communications kit'),
('Pharmaceuticals & Health Supplies', 'Finished medicine formulations, active pharma ingredients, and clinical diagnostic packs'),
('Perishable Food & Produce', 'Agricultural fruits, vegetables, spices, and temperature-controlled food supplies'),
('Automotive Components', 'Engines, stamped auto chassis parts, transmission systems, and aftermarket parts'),
('Chemicals (Non-Hazardous)', 'Industrial non-reactive resins, liquid polymer emulsions, and non-DG compounds'),
('Hazardous Regulated Goods (IMO/DG)', 'Certified IMO Class 3, 6.1, 8 and 9 packaged regulated chemical consignments'),
('Ceramics & Fragile Glassware', 'Vitrified building tiles, sanitaryware, ornamental ceramics, and glass articles');


-- ============================================================================
-- 5. CAPACITY LISTINGS (45 Listings)
-- Every listing is initially inserted with:
--   available_cbm = total_cbm
--   available_weight = total_weight
--   status = 'open'
-- Relative dates: cutoff_date <= departure_date < arrival_date
-- Edge cases embedded:
--   - L01: Will become FULL by CBM
--   - L02: Will become FULL by WEIGHT
--   - L03 & L04: Will become NEARLY FULL
--   - L05: Past-cutoff listing (cutoff in the past, completed voyage)
--   - L06: Past-cutoff listing (historical departure, will be closed)
--   - L07: Cancel-and-reopen showcase listing
--   - L08 & L09: Competing providers on Route INNSA -> AEJEA
--   - L10: Restricted hazardous-only listing
--   - L11: Restricted perishable-only listing
--   - Provider P6 (Blue Dart): Has listings (L42, L43, L44, L45) but ZERO bookings
-- ============================================================================
INSERT INTO capacity_listing (
    provider_id, route_id, departure_date, arrival_date, cutoff_date,
    total_cbm, available_cbm, total_weight, available_weight,
    price_per_cbm, price_per_tonne, minimum_charge, status
) VALUES
-- L01: Provider 1 (Maersk), Route INNSA -> AEJEA. Will become FULL by CBM (Total: 40 CBM, 25 t)
((SELECT id FROM user_account WHERE email = 'ops.india@maersk-lcl.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'AEJEA'),
 CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '5 days',
 40.00, 40.00, 25.00, 25.00, 85.00, 110.00, 200.00, 'open'),

-- L02: Provider 2 (MSC), Route INMUN -> AEJEA. Will become FULL by WEIGHT (Total: 30 CBM, 15 t)
((SELECT id FROM user_account WHERE email = 'bookings@msc-logistics.in'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMUN' AND d.un_locode = 'AEJEA'),
 CURRENT_DATE + INTERVAL '12 days', CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE + INTERVAL '7 days',
 30.00, 30.00, 15.00, 15.00, 80.00, 105.00, 180.00, 'open'),

-- L03: Provider 3 (CMA CGM), Route INNSA -> SGSIN. Will become NEARLY FULL (0.50 CBM remaining)
((SELECT id FROM user_account WHERE email = 'lcl.sea@cma-cgm-india.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '21 days', CURRENT_DATE + INTERVAL '8 days',
 50.00, 50.00, 30.00, 30.00, 110.00, 140.00, 250.00, 'open'),

-- L04: Provider 4 (Hapag), Route INMAA -> SGSIN. Will become NEARLY FULL (0.10 tonnes remaining)
((SELECT id FROM user_account WHERE email = 'capacity@hapag-ocean.de'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMAA' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE + INTERVAL '20 days', CURRENT_DATE + INTERVAL '9 days',
 45.00, 45.00, 20.00, 20.00, 100.00, 130.00, 220.00, 'open'),

-- L05: Provider 1 (Maersk), Route INNSA -> SGSIN. Past-cutoff & Past arrival (Past Completed Voyage)
((SELECT id FROM user_account WHERE email = 'ops.india@maersk-lcl.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE - INTERVAL '8 days', CURRENT_DATE - INTERVAL '20 days',
 60.00, 60.00, 35.00, 35.00, 105.00, 135.00, 240.00, 'open'),

-- L06: Provider 2 (MSC), Route INMUN -> NLRTM. Past-cutoff listing to be closed after bookings
((SELECT id FROM user_account WHERE email = 'bookings@msc-logistics.in'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMUN' AND d.un_locode = 'NLRTM'),
 CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE - INTERVAL '10 days',
 50.00, 50.00, 30.00, 30.00, 160.00, 210.00, 400.00, 'open'),

-- L07: Provider 5 (ONE), Route SGSIN -> INNSA. Cancel & Reopen Showcase Listing (Total: 25 CBM, 15 t)
((SELECT id FROM user_account WHERE email = 'space.desk@one-line.sg'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'SGSIN' AND d.un_locode = 'INNSA'),
 CURRENT_DATE + INTERVAL '16 days', CURRENT_DATE + INTERVAL '23 days', CURRENT_DATE + INTERVAL '10 days',
 25.00, 25.00, 15.00, 15.00, 115.00, 145.00, 250.00, 'open'),

-- L08: Competing 1 - Provider 1 (Maersk), Route INNSA -> AEJEA (Rate: $90/cbm)
((SELECT id FROM user_account WHERE email = 'ops.india@maersk-lcl.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'AEJEA'),
 CURRENT_DATE + INTERVAL '18 days', CURRENT_DATE + INTERVAL '22 days', CURRENT_DATE + INTERVAL '12 days',
 40.00, 40.00, 25.00, 25.00, 90.00, 120.00, 200.00, 'open'),

-- L09: Competing 2 - Provider 3 (CMA CGM), Route INNSA -> AEJEA (Rate: $75/cbm)
((SELECT id FROM user_account WHERE email = 'lcl.sea@cma-cgm-india.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'AEJEA'),
 CURRENT_DATE + INTERVAL '19 days', CURRENT_DATE + INTERVAL '23 days', CURRENT_DATE + INTERVAL '13 days',
 45.00, 45.00, 28.00, 28.00, 75.00, 105.00, 175.00, 'open'),

-- L10: Restricted Cargo Listing (Hazardous Regulated Goods Only) - Provider 4 (Hapag)
((SELECT id FROM user_account WHERE email = 'capacity@hapag-ocean.de'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'NLRTM'),
 CURRENT_DATE + INTERVAL '25 days', CURRENT_DATE + INTERVAL '46 days', CURRENT_DATE + INTERVAL '18 days',
 35.00, 35.00, 20.00, 20.00, 220.00, 280.00, 500.00, 'open'),

-- L11: Restricted Cargo Listing (Perishable Food & Produce Only) - Provider 5 (ONE)
((SELECT id FROM user_account WHERE email = 'space.desk@one-line.sg'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMAA' AND d.un_locode = 'LKCMB'),
 CURRENT_DATE + INTERVAL '8 days', CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '4 days',
 30.00, 30.00, 18.00, 18.00, 130.00, 160.00, 300.00, 'open'),

-- L12 to L41: General active listings across various routes and providers (30 listings)
-- L12
((SELECT id FROM user_account WHERE email = 'ops.india@maersk-lcl.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'USLAX'),
 CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE + INTERVAL '58 days', CURRENT_DATE + INTERVAL '22 days',
 60.00, 60.00, 35.00, 35.00, 210.00, 260.00, 450.00, 'open'),
-- L13
((SELECT id FROM user_account WHERE email = 'bookings@msc-logistics.in'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMUN' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '20 days', CURRENT_DATE + INTERVAL '28 days', CURRENT_DATE + INTERVAL '14 days',
 40.00, 40.00, 25.00, 25.00, 115.00, 145.00, 240.00, 'open'),
-- L14
((SELECT id FROM user_account WHERE email = 'lcl.sea@cma-cgm-india.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMUN' AND d.un_locode = 'DEHAM'),
 CURRENT_DATE + INTERVAL '24 days', CURRENT_DATE + INTERVAL '46 days', CURRENT_DATE + INTERVAL '16 days',
 55.00, 55.00, 32.00, 32.00, 175.00, 220.00, 380.00, 'open'),
-- L15
((SELECT id FROM user_account WHERE email = 'capacity@hapag-ocean.de'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMAA' AND d.un_locode = 'CNSHA'),
 CURRENT_DATE + INTERVAL '22 days', CURRENT_DATE + INTERVAL '36 days', CURRENT_DATE + INTERVAL '15 days',
 50.00, 50.00, 30.00, 30.00, 130.00, 165.00, 280.00, 'open'),
-- L16
((SELECT id FROM user_account WHERE email = 'space.desk@one-line.sg'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INTUT' AND d.un_locode = 'LKCMB'),
 CURRENT_DATE + INTERVAL '11 days', CURRENT_DATE + INTERVAL '12 days', CURRENT_DATE + INTERVAL '6 days',
 35.00, 35.00, 20.00, 20.00, 70.00, 95.00, 150.00, 'open'),
-- L17
((SELECT id FROM user_account WHERE email = 'ops.india@maersk-lcl.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INTUT' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '18 days', CURRENT_DATE + INTERVAL '24 days', CURRENT_DATE + INTERVAL '12 days',
 45.00, 45.00, 25.00, 25.00, 105.00, 135.00, 230.00, 'open'),
-- L18
((SELECT id FROM user_account WHERE email = 'bookings@msc-logistics.in'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INTUT' AND d.un_locode = 'AEJEA'),
 CURRENT_DATE + INTERVAL '21 days', CURRENT_DATE + INTERVAL '28 days', CURRENT_DATE + INTERVAL '14 days',
 40.00, 40.00, 22.00, 22.00, 95.00, 125.00, 210.00, 'open'),
-- L19
((SELECT id FROM user_account WHERE email = 'lcl.sea@cma-cgm-india.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INCCU' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '17 days', CURRENT_DATE + INTERVAL '23 days', CURRENT_DATE + INTERVAL '11 days',
 40.00, 40.00, 24.00, 24.00, 110.00, 140.00, 240.00, 'open'),
-- L20
((SELECT id FROM user_account WHERE email = 'capacity@hapag-ocean.de'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INCCU' AND d.un_locode = 'LKCMB'),
 CURRENT_DATE + INTERVAL '13 days', CURRENT_DATE + INTERVAL '17 days', CURRENT_DATE + INTERVAL '7 days',
 35.00, 35.00, 20.00, 20.00, 85.00, 115.00, 180.00, 'open'),
-- L21
((SELECT id FROM user_account WHERE email = 'space.desk@one-line.sg'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'SGSIN' AND d.un_locode = 'CNSHA'),
 CURRENT_DATE + INTERVAL '20 days', CURRENT_DATE + INTERVAL '26 days', CURRENT_DATE + INTERVAL '13 days',
 50.00, 50.00, 30.00, 30.00, 95.00, 125.00, 200.00, 'open'),
-- L22
((SELECT id FROM user_account WHERE email = 'ops.india@maersk-lcl.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'SGSIN' AND d.un_locode = 'USLAX'),
 CURRENT_DATE + INTERVAL '28 days', CURRENT_DATE + INTERVAL '46 days', CURRENT_DATE + INTERVAL '20 days',
 65.00, 65.00, 40.00, 40.00, 190.00, 240.00, 420.00, 'open'),
-- L23
((SELECT id FROM user_account WHERE email = 'bookings@msc-logistics.in'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'AEJEA' AND d.un_locode = 'INNSA'),
 CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE + INTERVAL '19 days', CURRENT_DATE + INTERVAL '9 days',
 45.00, 45.00, 25.00, 25.00, 85.00, 110.00, 190.00, 'open'),
-- L24
((SELECT id FROM user_account WHERE email = 'lcl.sea@cma-cgm-india.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'AEJEA' AND d.un_locode = 'NLRTM'),
 CURRENT_DATE + INTERVAL '26 days', CURRENT_DATE + INTERVAL '44 days', CURRENT_DATE + INTERVAL '17 days',
 50.00, 50.00, 30.00, 30.00, 160.00, 205.00, 350.00, 'open'),
-- L25
((SELECT id FROM user_account WHERE email = 'capacity@hapag-ocean.de'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'LKCMB' AND d.un_locode = 'INMAA'),
 CURRENT_DATE + INTERVAL '12 days', CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '6 days',
 30.00, 30.00, 18.00, 18.00, 65.00, 90.00, 140.00, 'open'),
-- L26
((SELECT id FROM user_account WHERE email = 'space.desk@one-line.sg'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'LKCMB' AND d.un_locode = 'NLRTM'),
 CURRENT_DATE + INTERVAL '25 days', CURRENT_DATE + INTERVAL '44 days', CURRENT_DATE + INTERVAL '16 days',
 45.00, 45.00, 28.00, 28.00, 170.00, 215.00, 370.00, 'open'),
-- L27
((SELECT id FROM user_account WHERE email = 'ops.india@maersk-lcl.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'CNSHA' AND d.un_locode = 'INNSA'),
 CURRENT_DATE + INTERVAL '22 days', CURRENT_DATE + INTERVAL '36 days', CURRENT_DATE + INTERVAL '14 days',
 55.00, 55.00, 35.00, 35.00, 125.00, 160.00, 270.00, 'open'),
-- L28
((SELECT id FROM user_account WHERE email = 'bookings@msc-logistics.in'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'AEJEA'),
 CURRENT_DATE + INTERVAL '27 days', CURRENT_DATE + INTERVAL '31 days', CURRENT_DATE + INTERVAL '19 days',
 40.00, 40.00, 24.00, 24.00, 80.00, 105.00, 180.00, 'open'),
-- L29
((SELECT id FROM user_account WHERE email = 'lcl.sea@cma-cgm-india.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '26 days', CURRENT_DATE + INTERVAL '33 days', CURRENT_DATE + INTERVAL '18 days',
 48.00, 48.00, 28.00, 28.00, 105.00, 135.00, 230.00, 'open'),
-- L30
((SELECT id FROM user_account WHERE email = 'capacity@hapag-ocean.de'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'NLRTM'),
 CURRENT_DATE + INTERVAL '32 days', CURRENT_DATE + INTERVAL '53 days', CURRENT_DATE + INTERVAL '24 days',
 50.00, 50.00, 30.00, 30.00, 180.00, 230.00, 400.00, 'open'),
-- L31
((SELECT id FROM user_account WHERE email = 'space.desk@one-line.sg'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMUN' AND d.un_locode = 'AEJEA'),
 CURRENT_DATE + INTERVAL '21 days', CURRENT_DATE + INTERVAL '24 days', CURRENT_DATE + INTERVAL '15 days',
 38.00, 38.00, 22.00, 22.00, 78.00, 102.00, 170.00, 'open'),
-- L32
((SELECT id FROM user_account WHERE email = 'ops.india@maersk-lcl.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMUN' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '25 days', CURRENT_DATE + INTERVAL '33 days', CURRENT_DATE + INTERVAL '17 days',
 42.00, 42.00, 26.00, 26.00, 110.00, 140.00, 240.00, 'open'),
-- L33
((SELECT id FROM user_account WHERE email = 'bookings@msc-logistics.in'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMUN' AND d.un_locode = 'DEHAM'),
 CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE + INTERVAL '52 days', CURRENT_DATE + INTERVAL '21 days',
 52.00, 52.00, 32.00, 32.00, 170.00, 215.00, 370.00, 'open'),
-- L34
((SELECT id FROM user_account WHERE email = 'lcl.sea@cma-cgm-india.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMUN' AND d.un_locode = 'NLRTM'),
 CURRENT_DATE + INTERVAL '35 days', CURRENT_DATE + INTERVAL '55 days', CURRENT_DATE + INTERVAL '25 days',
 48.00, 48.00, 30.00, 30.00, 165.00, 210.00, 360.00, 'open'),
-- L35
((SELECT id FROM user_account WHERE email = 'capacity@hapag-ocean.de'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMAA' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '28 days', CURRENT_DATE + INTERVAL '33 days', CURRENT_DATE + INTERVAL '20 days',
 44.00, 44.00, 24.00, 24.00, 95.00, 125.00, 210.00, 'open'),
-- L36
((SELECT id FROM user_account WHERE email = 'space.desk@one-line.sg'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMAA' AND d.un_locode = 'LKCMB'),
 CURRENT_DATE + INTERVAL '19 days', CURRENT_DATE + INTERVAL '21 days', CURRENT_DATE + INTERVAL '13 days',
 32.00, 32.00, 18.00, 18.00, 60.00, 85.00, 130.00, 'open'),
-- L37
((SELECT id FROM user_account WHERE email = 'ops.india@maersk-lcl.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMAA' AND d.un_locode = 'CNSHA'),
 CURRENT_DATE + INTERVAL '31 days', CURRENT_DATE + INTERVAL '45 days', CURRENT_DATE + INTERVAL '22 days',
 46.00, 46.00, 28.00, 28.00, 135.00, 170.00, 290.00, 'open'),
-- L38
((SELECT id FROM user_account WHERE email = 'bookings@msc-logistics.in'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INTUT' AND d.un_locode = 'LKCMB'),
 CURRENT_DATE + INTERVAL '16 days', CURRENT_DATE + INTERVAL '17 days', CURRENT_DATE + INTERVAL '10 days',
 30.00, 30.00, 16.00, 16.00, 65.00, 90.00, 140.00, 'open'),
-- L39
((SELECT id FROM user_account WHERE email = 'lcl.sea@cma-cgm-india.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INTUT' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '27 days', CURRENT_DATE + INTERVAL '33 days', CURRENT_DATE + INTERVAL '19 days',
 42.00, 42.00, 24.00, 24.00, 100.00, 130.00, 220.00, 'open'),
-- L40
((SELECT id FROM user_account WHERE email = 'capacity@hapag-ocean.de'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INTUT' AND d.un_locode = 'AEJEA'),
 CURRENT_DATE + INTERVAL '29 days', CURRENT_DATE + INTERVAL '36 days', CURRENT_DATE + INTERVAL '20 days',
 38.00, 38.00, 20.00, 20.00, 90.00, 120.00, 200.00, 'open'),
-- L41
((SELECT id FROM user_account WHERE email = 'space.desk@one-line.sg'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INCCU' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '23 days', CURRENT_DATE + INTERVAL '29 days', CURRENT_DATE + INTERVAL '15 days',
 36.00, 36.00, 22.00, 22.00, 108.00, 138.00, 230.00, 'open'),

-- L42 to L45: Provider 6 (Blue Dart) Listings. These will have ZERO bookings (Edge Case 8)
-- L42
((SELECT id FROM user_account WHERE email = 'ocean@bluedart-global.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'AEJEA'),
 CURRENT_DATE + INTERVAL '21 days', CURRENT_DATE + INTERVAL '25 days', CURRENT_DATE + INTERVAL '14 days',
 35.00, 35.00, 20.00, 20.00, 88.00, 115.00, 195.00, 'open'),
-- L43
((SELECT id FROM user_account WHERE email = 'ocean@bluedart-global.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INNSA' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '22 days', CURRENT_DATE + INTERVAL '29 days', CURRENT_DATE + INTERVAL '15 days',
 40.00, 40.00, 24.00, 24.00, 108.00, 138.00, 235.00, 'open'),
-- L44
((SELECT id FROM user_account WHERE email = 'ocean@bluedart-global.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMUN' AND d.un_locode = 'AEJEA'),
 CURRENT_DATE + INTERVAL '23 days', CURRENT_DATE + INTERVAL '26 days', CURRENT_DATE + INTERVAL '16 days',
 30.00, 30.00, 18.00, 18.00, 82.00, 108.00, 185.00, 'open'),
-- L45
((SELECT id FROM user_account WHERE email = 'ocean@bluedart-global.com'),
 (SELECT r.id FROM route r JOIN port o ON r.origin_port_id = o.id JOIN port d ON r.destination_port_id = d.id WHERE o.un_locode = 'INMAA' AND d.un_locode = 'SGSIN'),
 CURRENT_DATE + INTERVAL '24 days', CURRENT_DATE + INTERVAL '29 days', CURRENT_DATE + INTERVAL '17 days',
 35.00, 35.00, 20.00, 20.00, 98.00, 128.00, 215.00, 'open');


-- ============================================================================
-- 6. LISTING CARGO ASSOCIATIONS (listing_cargo Junction Table)
-- Resolves M:N association before any booking is inserted.
-- Explicitly handles restricted cargo types for edge cases:
--   - Restricted Hazardous: Only allows 'Hazardous Regulated Goods (IMO/DG)'
--   - Restricted Perishable: Only allows 'Perishable Food & Produce'
--   - Other listings allow standard mixtures of merchandise, machinery, etc.
-- Uses unambiguous natural keys to retrieve listing IDs without hardcoding identity numbers.
-- ============================================================================
DO $$
DECLARE
    v_l_id_haz BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'capacity@hapag-ocean.de' AND l.price_per_cbm = 220.00 AND l.total_cbm = 35.00
    );
    v_l_id_peri BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'space.desk@one-line.sg' AND l.price_per_cbm = 130.00 AND l.total_cbm = 30.00
    );
    v_l_id_past_comp BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'ops.india@maersk-lcl.com' AND l.departure_date < CURRENT_DATE AND l.total_cbm = 60.00
    );
    v_l_id_past_closed BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'bookings@msc-logistics.in' AND l.cutoff_date < CURRENT_DATE AND l.total_cbm = 50.00
    );
    v_rec RECORD;

    v_c_dry BIGINT := (SELECT id FROM cargo_type WHERE name = 'Standard Dry Merchandise');
    v_c_mach BIGINT := (SELECT id FROM cargo_type WHERE name = 'Industrial Machinery & Spares');
    v_c_tex BIGINT := (SELECT id FROM cargo_type WHERE name = 'Textiles & Apparel Goods');
    v_c_elec BIGINT := (SELECT id FROM cargo_type WHERE name = 'Electronics & Telecommunications');
    v_c_pharma BIGINT := (SELECT id FROM cargo_type WHERE name = 'Pharmaceuticals & Health Supplies');
    v_c_food BIGINT := (SELECT id FROM cargo_type WHERE name = 'Perishable Food & Produce');
    v_c_auto BIGINT := (SELECT id FROM cargo_type WHERE name = 'Automotive Components');
    v_c_chem BIGINT := (SELECT id FROM cargo_type WHERE name = 'Chemicals (Non-Hazardous)');
    v_c_haz BIGINT := (SELECT id FROM cargo_type WHERE name = 'Hazardous Regulated Goods (IMO/DG)');
    v_c_cera BIGINT := (SELECT id FROM cargo_type WHERE name = 'Ceramics & Fragile Glassware');
BEGIN
    -- Assert that all critical special listings resolved unambiguously
    IF v_l_id_haz IS NULL OR v_l_id_peri IS NULL OR v_l_id_past_comp IS NULL OR v_l_id_past_closed IS NULL THEN
        RAISE EXCEPTION 'Listing cargo association failed: one or more special listing lookups resolved to NULL';
    END IF;

    FOR v_rec IN SELECT id FROM capacity_listing ORDER BY id LOOP
        IF v_rec.id = v_l_id_haz THEN
            -- Edge Case 5: Restricted to Hazardous only
            INSERT INTO listing_cargo (listing_id, cargo_type_id) VALUES (v_rec.id, v_c_haz);
        ELSIF v_rec.id = v_l_id_peri THEN
            -- Edge Case 5: Restricted to Perishable Food only
            INSERT INTO listing_cargo (listing_id, cargo_type_id) VALUES (v_rec.id, v_c_food);
        ELSIF v_rec.id IN (v_l_id_past_comp, v_l_id_past_closed) THEN
            -- Past / historical listings
            INSERT INTO listing_cargo (listing_id, cargo_type_id) VALUES
                (v_rec.id, v_c_dry), (v_rec.id, v_c_tex), (v_rec.id, v_c_pharma), (v_rec.id, v_c_chem);
        ELSE
            -- General listings (allow 4 to 5 versatile categories)
            INSERT INTO listing_cargo (listing_id, cargo_type_id) VALUES
                (v_rec.id, v_c_dry), (v_rec.id, v_c_mach), (v_rec.id, v_c_tex),
                (v_rec.id, v_c_auto), (v_rec.id, v_c_cera);
        END IF;
    END LOOP;
END $$;


-- ============================================================================
-- 7. CONFIRMED BOOKING INSERTION (75 Bookings Total)
-- Enforces:
--   - Exactly 74 initial bookings inserted as 'confirmed'
--   - 1 rebooking inserted after cancellation, reaching exactly 75 bookings
--   - Valid booking_time <= cutoff_date
--   - Automatic capacity decrement and price snapshot via trg_validate_and_reserve_booking
--   - Initial status history record logged via trg_record_booking_status_history
--   - IDs of listings and cancellation targets dynamically retrieved via natural keys
-- Note on Traders:
--   Traders T1 to T19 receive bookings.
--   Trader T20 ('sea.logistics@starretail.in') receives ZERO bookings (Edge Case 7).
-- ============================================================================
DO $$
DECLARE
    -- Trader IDs
    t1 BIGINT := (SELECT id FROM user_account WHERE email = 'shipping@aaravtextiles.in');
    t2 BIGINT := (SELECT id FROM user_account WHERE email = 'logistics@bharatauto.com');
    t3 BIGINT := (SELECT id FROM user_account WHERE email = 'export@coromandelagro.com');
    t4 BIGINT := (SELECT id FROM user_account WHERE email = 'dispatch@deccanpharma.in');
    t5 BIGINT := (SELECT id FROM user_account WHERE email = 'ops@easternhandicrafts.org');
    t6 BIGINT := (SELECT id FROM user_account WHERE email = 'cargo@falconfasteners.com');
    t7 BIGINT := (SELECT id FROM user_account WHERE email = 'supplychain@gujaratpolymers.in');
    t8 BIGINT := (SELECT id FROM user_account WHERE email = 'trade@himalayantea.com');
    t9 BIGINT := (SELECT id FROM user_account WHERE email = 'freight@induselectronics.co.in');
    t10 BIGINT := (SELECT id FROM user_account WHERE email = 'sales@jaipurceramics.in');
    t11 BIGINT := (SELECT id FROM user_account WHERE email = 'export@kalingametal.com');
    t12 BIGINT := (SELECT id FROM user_account WHERE email = 'dispatch@lotusbeauty.in');
    t13 BIGINT := (SELECT id FROM user_account WHERE email = 'coldchain@malabarmarine.com');
    t14 BIGINT := (SELECT id FROM user_account WHERE email = 'traffic@navkarleather.com');
    t15 BIGINT := (SELECT id FROM user_account WHERE email = 'shipments@omkarsolar.in');
    t16 BIGINT := (SELECT id FROM user_account WHERE email = 'logistics@precisionsurgical.com');
    t17 BIGINT := (SELECT id FROM user_account WHERE email = 'trade@quantumhardware.com');
    t18 BIGINT := (SELECT id FROM user_account WHERE email = 'cargo@royalsilks.in');
    t19 BIGINT := (SELECT id FROM user_account WHERE email = 'export@sundarampaper.com');

    -- Cargo Type IDs
    c_dry BIGINT := (SELECT id FROM cargo_type WHERE name = 'Standard Dry Merchandise');
    c_mach BIGINT := (SELECT id FROM cargo_type WHERE name = 'Industrial Machinery & Spares');
    c_tex BIGINT := (SELECT id FROM cargo_type WHERE name = 'Textiles & Apparel Goods');
    c_pharma BIGINT := (SELECT id FROM cargo_type WHERE name = 'Pharmaceuticals & Health Supplies');
    c_food BIGINT := (SELECT id FROM cargo_type WHERE name = 'Perishable Food & Produce');
    c_auto BIGINT := (SELECT id FROM cargo_type WHERE name = 'Automotive Components');
    c_chem BIGINT := (SELECT id FROM cargo_type WHERE name = 'Chemicals (Non-Hazardous)');
    c_haz BIGINT := (SELECT id FROM cargo_type WHERE name = 'Hazardous Regulated Goods (IMO/DG)');
    c_cera BIGINT := (SELECT id FROM cargo_type WHERE name = 'Ceramics & Fragile Glassware');

    -- Dynamic Listing IDs retrieved by unambiguous stable natural keys
    l_full_cbm BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'ops.india@maersk-lcl.com' AND l.price_per_cbm = 85.00 AND l.total_cbm = 40.00
    );
    l_full_wt BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'bookings@msc-logistics.in' AND l.price_per_cbm = 80.00 AND l.total_cbm = 30.00
    );
    l_near_cbm BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'lcl.sea@cma-cgm-india.com' AND l.price_per_cbm = 110.00 AND l.total_cbm = 50.00
    );
    l_near_wt BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'capacity@hapag-ocean.de' AND l.price_per_cbm = 100.00 AND l.total_cbm = 45.00
    );
    l_past_comp BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'ops.india@maersk-lcl.com' AND l.departure_date < CURRENT_DATE AND l.total_cbm = 60.00
    );
    l_past_closed BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'bookings@msc-logistics.in' AND l.cutoff_date < CURRENT_DATE AND l.total_cbm = 50.00
    );
    l_reopen BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'space.desk@one-line.sg' AND l.total_cbm = 25.00 AND l.price_per_cbm = 115.00
    );
    l_comp_1 BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'ops.india@maersk-lcl.com' AND l.price_per_cbm = 90.00 AND l.total_cbm = 40.00
    );
    l_comp_2 BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'lcl.sea@cma-cgm-india.com' AND l.price_per_cbm = 75.00 AND l.total_cbm = 45.00
    );
    l_haz BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'capacity@hapag-ocean.de' AND l.price_per_cbm = 220.00 AND l.total_cbm = 35.00
    );
    l_peri BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'space.desk@one-line.sg' AND l.price_per_cbm = 130.00 AND l.total_cbm = 30.00
    );

    -- General listing IDs (retrieved by unique provider & rate signature)
    l12 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'ops.india@maersk-lcl.com' AND l.price_per_cbm = 210.00);
    l13 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'bookings@msc-logistics.in' AND l.price_per_cbm = 115.00);
    l14 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'lcl.sea@cma-cgm-india.com' AND l.price_per_cbm = 175.00);
    l15 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'capacity@hapag-ocean.de' AND l.price_per_cbm = 130.00);
    l16 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'space.desk@one-line.sg' AND l.price_per_cbm = 70.00);
    l17 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'ops.india@maersk-lcl.com' AND l.price_per_cbm = 105.00 AND l.total_cbm = 45.00);
    l18 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'bookings@msc-logistics.in' AND l.price_per_cbm = 95.00);
    l19 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'lcl.sea@cma-cgm-india.com' AND l.price_per_cbm = 110.00 AND l.total_cbm = 40.00);
    l20 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'capacity@hapag-ocean.de' AND l.price_per_cbm = 85.00);
    l21 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'space.desk@one-line.sg' AND l.price_per_cbm = 95.00);
    l22 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'ops.india@maersk-lcl.com' AND l.price_per_cbm = 190.00);
    l23 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'bookings@msc-logistics.in' AND l.price_per_cbm = 85.00 AND l.total_cbm = 45.00);
    l24 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'lcl.sea@cma-cgm-india.com' AND l.price_per_cbm = 160.00);
    l25 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'capacity@hapag-ocean.de' AND l.price_per_cbm = 65.00);
    l26 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'space.desk@one-line.sg' AND l.price_per_cbm = 170.00);
    l27 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'ops.india@maersk-lcl.com' AND l.price_per_cbm = 125.00);
    l28 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'bookings@msc-logistics.in' AND l.price_per_cbm = 80.00 AND l.total_cbm = 40.00);
    l29 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'lcl.sea@cma-cgm-india.com' AND l.price_per_cbm = 105.00);
    l30 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'capacity@hapag-ocean.de' AND l.price_per_cbm = 180.00);
    l31 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'space.desk@one-line.sg' AND l.price_per_cbm = 78.00);
    l32 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'ops.india@maersk-lcl.com' AND l.price_per_cbm = 110.00);
    l33 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'bookings@msc-logistics.in' AND l.price_per_cbm = 170.00);
    l34 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'lcl.sea@cma-cgm-india.com' AND l.price_per_cbm = 165.00);
    l35 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'capacity@hapag-ocean.de' AND l.price_per_cbm = 95.00);
    l36 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'space.desk@one-line.sg' AND l.price_per_cbm = 60.00);
    l37 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'ops.india@maersk-lcl.com' AND l.price_per_cbm = 135.00);
    l38 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'bookings@msc-logistics.in' AND l.price_per_cbm = 65.00);
    l39 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'lcl.sea@cma-cgm-india.com' AND l.price_per_cbm = 100.00);
    l40 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'capacity@hapag-ocean.de' AND l.price_per_cbm = 90.00);
    l41 BIGINT := (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'space.desk@one-line.sg' AND l.price_per_cbm = 108.00);
BEGIN
    -- Assert that all listing IDs resolved to non-NULL values
    IF l_full_cbm IS NULL OR l_full_wt IS NULL OR l_near_cbm IS NULL OR l_near_wt IS NULL
       OR l_past_comp IS NULL OR l_past_closed IS NULL OR l_reopen IS NULL
       OR l_comp_1 IS NULL OR l_comp_2 IS NULL OR l_haz IS NULL OR l_peri IS NULL
       OR l12 IS NULL OR l13 IS NULL OR l14 IS NULL OR l15 IS NULL OR l16 IS NULL
       OR l17 IS NULL OR l18 IS NULL OR l19 IS NULL OR l20 IS NULL OR l21 IS NULL
       OR l22 IS NULL OR l23 IS NULL OR l24 IS NULL OR l25 IS NULL OR l26 IS NULL
       OR l27 IS NULL OR l28 IS NULL OR l29 IS NULL OR l30 IS NULL OR l31 IS NULL
       OR l32 IS NULL OR l33 IS NULL OR l34 IS NULL OR l35 IS NULL OR l36 IS NULL
       OR l37 IS NULL OR l38 IS NULL OR l39 IS NULL OR l40 IS NULL OR l41 IS NULL THEN
        RAISE EXCEPTION 'Booking creation failed: one or more capacity listing lookups resolved to NULL';
    END IF;
    -- ------------------------------------------------------------------------
    -- B01 to B04 on Listing L01 (Capacity: 40 CBM, 25 t).
    -- Cumulative CBM: 15 + 12 + 8 + 5 = 40.00 CBM (100% EXHAUSTED -> Becomes FULL by CBM)
    -- Cumulative Wt: 8 + 6 + 4 + 3 = 21.00 t (Remaining wt: 4.00 t)
    -- ------------------------------------------------------------------------
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t1, l_full_cbm, c_tex,  15.00, 8.00, 0.00, 'confirmed'),
    (t2, l_full_cbm, c_auto, 12.00, 6.00, 0.00, 'confirmed'),
    (t6, l_full_cbm, c_mach,  8.00, 4.00, 0.00, 'confirmed'),
    (t9, l_full_cbm, c_dry,   5.00, 3.00, 0.00, 'confirmed');

    -- ------------------------------------------------------------------------
    -- B05 to B07 on Listing L02 (Capacity: 30 CBM, 15 t).
    -- Cumulative Wt: 6 + 5 + 4 = 15.00 t (100% EXHAUSTED -> Becomes FULL by WEIGHT)
    -- Cumulative CBM: 10 + 8 + 6 = 24.00 CBM (Remaining CBM: 6.00 CBM)
    -- ------------------------------------------------------------------------
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t2,  l_full_wt, c_auto, 10.00, 6.00, 0.00, 'confirmed'),
    (t11, l_full_wt, c_mach,  8.00, 5.00, 0.00, 'confirmed'),
    (t6,  l_full_wt, c_mach,  6.00, 4.00, 0.00, 'confirmed');

    -- ------------------------------------------------------------------------
    -- B08 to B11 on Listing L03 (Capacity: 50 CBM, 30 t).
    -- Cumulative CBM: 18 + 16 + 10 + 5.50 = 49.50 CBM (Remaining CBM: 0.50 CBM -> NEARLY FULL)
    -- Cumulative Wt: 10 + 8 + 5 + 3 = 26.00 t (Remaining Wt: 4.00 t)
    -- ------------------------------------------------------------------------
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t1, l_near_cbm, c_tex,  18.00, 10.00, 0.00, 'confirmed'),
    (t5, l_near_cbm, c_tex,  16.00,  8.00, 0.00, 'confirmed'),
    (t9, l_near_cbm, c_dry,  10.00,  5.00, 0.00, 'confirmed'),
    (t2, l_near_cbm, c_auto,  5.50,  3.00, 0.00, 'confirmed');

    -- ------------------------------------------------------------------------
    -- B12 to B15 on Listing L04 (Capacity: 45 CBM, 20 t).
    -- Cumulative Wt: 7 + 6 + 4 + 2.90 = 19.90 t (Remaining Wt: 0.10 t -> NEARLY FULL)
    -- Cumulative CBM: 14 + 12 + 8 + 6 = 40.00 CBM (Remaining CBM: 5.00 CBM)
    -- ------------------------------------------------------------------------
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t11, l_near_wt, c_mach, 14.00, 7.00, 0.00, 'confirmed'),
    (t2,  l_near_wt, c_auto, 12.00, 6.00, 0.00, 'confirmed'),
    (t6,  l_near_wt, c_mach,  8.00, 4.00, 0.00, 'confirmed'),
    (t17, l_near_wt, c_mach,  6.00, 2.90, 0.00, 'confirmed');

    -- ------------------------------------------------------------------------
    -- B16 to B18 on Listing L05 (Past Completed Voyage: departure -15d, arrival -8d, cutoff -20d)
    -- Backdated booking timestamps <= cutoff_date
    -- Bookings will be transitioned to 'completed' in Step 8 (Edge Case 10)
    -- ------------------------------------------------------------------------
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status, booking_time) VALUES
    (t1, l_past_comp, c_tex,    20.00, 12.00, 0.00, 'confirmed', CURRENT_TIMESTAMP - INTERVAL '24 days'),
    (t4, l_past_comp, c_pharma, 15.00,  8.00, 0.00, 'confirmed', CURRENT_TIMESTAMP - INTERVAL '23 days'),
    (t7, l_past_comp, c_chem,   10.00,  6.00, 0.00, 'confirmed', CURRENT_TIMESTAMP - INTERVAL '22 days');

    -- ------------------------------------------------------------------------
    -- B19 to B20 on Listing L06 (Past Cutoff: cutoff -10d, departure -5d)
    -- Backdated booking timestamps <= cutoff_date (Edge Case 4)
    -- Listing L06 will be updated to 'closed' after bookings in Step 10
    -- ------------------------------------------------------------------------
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status, booking_time) VALUES
    (t1, l_past_closed, c_tex,  18.00, 10.00, 0.00, 'confirmed', CURRENT_TIMESTAMP - INTERVAL '12 days'),
    (t7, l_past_closed, c_chem, 12.00,  8.00, 0.00, 'confirmed', CURRENT_TIMESTAMP - INTERVAL '11 days');

    -- ------------------------------------------------------------------------
    -- B21 to B23 on Listing L07 (Cancel & Reopen Showcase Listing, Capacity: 25 CBM, 15 t)
    -- Total reserved initially: 10 + 10 + 5 = 25.00 CBM, 6 + 6 + 3 = 15.00 t (Becomes FULL!)
    -- In Step 8, the 5 CBM booking by t17 will be cancelled -> L07 reopens from 'full' to 'open'
    -- A new booking will then reserve 3 CBM into the restored space! (Edge Case 11)
    -- ------------------------------------------------------------------------
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t9,  l_reopen, c_dry,  10.00, 6.00, 0.00, 'confirmed'),
    (t2,  l_reopen, c_auto, 10.00, 6.00, 0.00, 'confirmed'),
    (t17, l_reopen, c_mach,  5.00, 3.00, 0.00, 'confirmed'); -- Target for cancellation

    -- ------------------------------------------------------------------------
    -- B24 to B25 on Competing Listings L08 & L09 (Route INNSA -> AEJEA) (Edge Case 6)
    -- L08 (Maersk, $90/cbm) vs L09 (CMA CGM, $75/cbm)
    -- ------------------------------------------------------------------------
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t1, l_comp_1, c_tex, 12.00, 7.00, 0.00, 'confirmed'),
    (t5, l_comp_2, c_tex, 14.00, 8.00, 0.00, 'confirmed');

    -- ------------------------------------------------------------------------
    -- B26 on Restricted Listing L10 (Hazardous Regulated Goods Only) (Edge Case 5)
    -- ------------------------------------------------------------------------
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t7, l_haz, c_haz, 10.00, 6.00, 0.00, 'confirmed');

    -- ------------------------------------------------------------------------
    -- B27 on Restricted Listing L11 (Perishable Food & Produce Only) (Edge Case 5)
    -- ------------------------------------------------------------------------
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t3, l_peri, c_food, 8.00, 5.00, 0.00, 'confirmed');

    -- ------------------------------------------------------------------------
    -- B28 to B74 across General Listings L12 to L41 (47 Bookings)
    -- 17 listings receive 2 bookings (34 bookings), 13 listings receive 1 booking (13 bookings)
    -- Total initial bookings = 27 + 47 = 74 bookings!
    -- With the 1 rebooking in Step 8, total bookings will be exactly 75!
    -- ------------------------------------------------------------------------
    -- L12 (2 bookings, first will be cancelled by t1)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t1, l12, c_tex, 15.00, 9.00, 0.00, 'confirmed'),
    (t9, l12, c_dry, 12.00, 7.00, 0.00, 'confirmed');

    -- L13 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t2, l13, c_auto, 10.00, 6.00, 0.00, 'confirmed'),
    (t10, l13, c_cera, 8.00, 5.00, 0.00, 'confirmed');

    -- L14 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t11, l14, c_mach, 14.00, 8.00, 0.00, 'confirmed'),
    (t14, l14, c_tex, 10.00, 5.00, 0.00, 'confirmed');

    -- L15 (2 bookings, first will be cancelled by compliance admin)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t1, l15, c_tex, 12.00, 6.00, 0.00, 'confirmed'),
    (t15, l15, c_auto, 10.00, 6.00, 0.00, 'confirmed');

    -- L16 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t5, l16, c_tex, 8.00, 4.00, 0.00, 'confirmed'),
    (t10, l16, c_cera, 6.00, 4.00, 0.00, 'confirmed');

    -- L17 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t18, l17, c_tex, 12.00, 6.00, 0.00, 'confirmed'),
    (t6, l17, c_auto, 8.00, 5.00, 0.00, 'confirmed');

    -- L18 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t19, l18, c_dry, 10.00, 5.00, 0.00, 'confirmed'),
    (t14, l18, c_tex, 8.00, 4.00, 0.00, 'confirmed');

    -- L19 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t8, l19, c_dry, 10.00, 5.00, 0.00, 'confirmed'),
    (t5, l19, c_tex, 8.00, 4.00, 0.00, 'confirmed');

    -- L20 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t8, l20, c_dry, 8.00, 4.00, 0.00, 'confirmed'),
    (t10, l20, c_cera, 6.00, 4.00, 0.00, 'confirmed');

    -- L21 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t9, l21, c_dry, 12.00, 7.00, 0.00, 'confirmed'),
    (t16, l21, c_auto, 10.00, 5.00, 0.00, 'confirmed');

    -- L22 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t17, l22, c_auto, 15.00, 9.00, 0.00, 'confirmed'),
    (t1, l22, c_tex, 12.00, 6.00, 0.00, 'confirmed');

    -- L23 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t2, l23, c_auto, 10.00, 6.00, 0.00, 'confirmed'),
    (t11, l23, c_dry, 8.00, 4.00, 0.00, 'confirmed');

    -- L24 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t6, l24, c_dry, 12.00, 7.00, 0.00, 'confirmed'),
    (t14, l24, c_tex, 10.00, 5.00, 0.00, 'confirmed');

    -- L25 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t5, l25, c_tex, 8.00, 4.00, 0.00, 'confirmed'),
    (t18, l25, c_dry, 6.00, 3.00, 0.00, 'confirmed');

    -- L26 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t12, l26, c_dry, 10.00, 5.00, 0.00, 'confirmed'),
    (t15, l26, c_auto, 8.00, 5.00, 0.00, 'confirmed');

    -- L27 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t9, l27, c_dry, 14.00, 8.00, 0.00, 'confirmed'),
    (t16, l27, c_auto, 10.00, 6.00, 0.00, 'confirmed');

    -- L28 (2 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t1, l28, c_tex, 10.00, 5.00, 0.00, 'confirmed'),
    (t13, l28, c_dry, 8.00, 4.00, 0.00, 'confirmed');

    -- L29 to L41 (1 booking each = 13 bookings)
    INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
    (t2, l29, c_auto, 12.00, 6.00, 0.00, 'confirmed'),
    (t11, l30, c_auto, 14.00, 8.00, 0.00, 'confirmed'),
    (t5, l31, c_tex, 10.00, 5.00, 0.00, 'confirmed'),
    (t18, l32, c_tex, 12.00, 6.00, 0.00, 'confirmed'),
    (t2, l33, c_auto, 14.00, 8.00, 0.00, 'confirmed'),
    (t11, l34, c_auto, 12.00, 7.00, 0.00, 'confirmed'),
    (t1, l35, c_tex, 10.00, 5.00, 0.00, 'confirmed'),
    (t16, l36, c_auto, 8.00, 4.00, 0.00, 'confirmed'),
    (t14, l37, c_tex, 12.00, 6.00, 0.00, 'confirmed'),
    (t5, l38, c_tex, 8.00, 4.00, 0.00, 'confirmed'),
    (t2, l39, c_auto, 10.00, 5.00, 0.00, 'confirmed'),
    (t11, l40, c_auto, 10.00, 5.00, 0.00, 'confirmed'),
    (t8, l41, c_dry, 8.00, 4.00, 0.00, 'confirmed');
END $$;


-- ============================================================================
-- 8. STATUS TRANSITIONS: CANCELLATIONS & COMPLETIONS
-- Enforces:
--   - Cancelled bookings restore capacity and reopen 'full' listings via trigger
--   - Target bookings retrieved dynamically via natural keys, never assumed IDs
--   - Completed bookings only on voyages with arrival_date < CURRENT_DATE
--   - Session configuration parameters cleanly isolated and reset
-- ============================================================================

-- 8.1 Execute Cancellations via sp_cancel_booking
-- Target 1: The 5 CBM machinery booking on l_reopen (by t17)
-- Restoring capacity reopens the listing from 'full' to 'open'!
DO $$
DECLARE
    v_b_reopen_id BIGINT := (
        SELECT b.id FROM booking b
        JOIN capacity_listing l ON b.listing_id = l.id
        JOIN user_account tr ON b.trader_id = tr.id
        JOIN user_account prov ON l.provider_id = prov.id
        WHERE tr.email = 'trade@quantumhardware.com'
          AND prov.email = 'space.desk@one-line.sg'
          AND b.booked_cbm = 5.00
          AND l.total_cbm = 25.00
    );
    v_trader17_id BIGINT := (SELECT id FROM user_account WHERE email = 'trade@quantumhardware.com');
BEGIN
    IF v_b_reopen_id IS NULL OR v_trader17_id IS NULL THEN
        RAISE EXCEPTION 'Cancellation 1 failed: Target booking or trader resolved to NULL';
    END IF;
    CALL sp_cancel_booking(v_b_reopen_id, v_trader17_id, 'Production order rescheduled by overseas buyer');
END $$;

-- Target 2: The 15 CBM booking on l12 by t1 (Maersk INNSA -> USLAX)
DO $$
DECLARE
    v_b_l12_id BIGINT := (
        SELECT b.id FROM booking b
        JOIN capacity_listing l ON b.listing_id = l.id
        JOIN user_account tr ON b.trader_id = tr.id
        JOIN user_account prov ON l.provider_id = prov.id
        WHERE tr.email = 'shipping@aaravtextiles.in'
          AND prov.email = 'ops.india@maersk-lcl.com'
          AND b.booked_cbm = 15.00
          AND l.price_per_cbm = 210.00
          AND l.total_cbm = 60.00
    );
    v_trader1_id BIGINT := (SELECT id FROM user_account WHERE email = 'shipping@aaravtextiles.in');
BEGIN
    IF v_b_l12_id IS NULL OR v_trader1_id IS NULL THEN
        RAISE EXCEPTION 'Cancellation 2 failed: Target booking or trader resolved to NULL';
    END IF;
    CALL sp_cancel_booking(v_b_l12_id, v_trader1_id, 'Letter of credit delayed by issuing bank');
END $$;

-- Target 3: The 12 CBM booking on l15 by t1 (Hapag INMAA -> CNSHA), cancelled by Compliance Admin
DO $$
DECLARE
    v_b_l15_id BIGINT := (
        SELECT b.id FROM booking b
        JOIN capacity_listing l ON b.listing_id = l.id
        JOIN user_account tr ON b.trader_id = tr.id
        JOIN user_account prov ON l.provider_id = prov.id
        WHERE tr.email = 'shipping@aaravtextiles.in'
          AND prov.email = 'capacity@hapag-ocean.de'
          AND b.booked_cbm = 12.00
          AND l.price_per_cbm = 130.00
          AND l.total_cbm = 50.00
    );
    v_admin_id BIGINT := (SELECT id FROM user_account WHERE email = 'compliance@shipspace.internal');
BEGIN
    IF v_b_l15_id IS NULL OR v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Cancellation 3 failed: Target booking or admin resolved to NULL';
    END IF;
    CALL sp_cancel_booking(v_b_l15_id, v_admin_id, 'Phytosanitary documentation incomplete');
END $$;

-- 8.2 Session Context Cleanup
-- Reset session configuration parameters so subsequent updates are not polluted
SELECT set_config('shipspace.current_user_id', '', true);
SELECT set_config('shipspace.status_change_reason', '', true);

-- 8.3 Rebooking Showcase (Edge Case 11: Reopening and Rebooking)
-- Now that the showcase listing has reopened from 'full' to 'open', insert a valid new booking!
-- This brings total bookings to exactly 75!
INSERT INTO booking (trader_id, listing_id, cargo_type_id, booked_cbm, booked_weight, total_price, status) VALUES
((SELECT id FROM user_account WHERE email = 'sales@jaipurceramics.in'),
 (SELECT l.id FROM capacity_listing l JOIN user_account u ON l.provider_id = u.id WHERE u.email = 'space.desk@one-line.sg' AND l.total_cbm = 25.00 AND l.price_per_cbm = 115.00),
 (SELECT id FROM cargo_type WHERE name = 'Standard Dry Merchandise'),
 3.00, 2.00, 0.00, 'confirmed');

-- 8.4 Mark Completed Bookings on Arrived Voyage (Past Listing L05)
-- Voyage departure -15d, arrival -8d (< CURRENT_DATE). All 3 bookings arrived safely.
-- Set explicit session attribution for the completion transitions
SELECT set_config('shipspace.current_user_id', (SELECT id::text FROM user_account WHERE email = 'superadmin@shipspace.internal'), true);
SELECT set_config('shipspace.status_change_reason', 'Vessel arrived at destination port and container devanned', true);

UPDATE booking
SET status = 'completed'
WHERE listing_id = (
    SELECT l.id FROM capacity_listing l
    JOIN user_account u ON l.provider_id = u.id
    WHERE u.email = 'ops.india@maersk-lcl.com' AND l.departure_date < CURRENT_DATE AND l.total_cbm = 60.00
);

-- Reset session variables
SELECT set_config('shipspace.current_user_id', '', true);
SELECT set_config('shipspace.status_change_reason', '', true);


-- ============================================================================
-- 9. ADMINISTRATIVE JUNCTION TABLES
-- Populates admin_port, admin_route, admin_cargo_type
-- Superadmin (Admin 1) & Compliance Officer (Admin 2)
-- ============================================================================
DO $$
DECLARE
    adm1 BIGINT := (SELECT id FROM user_account WHERE email = 'superadmin@shipspace.internal');
    adm2 BIGINT := (SELECT id FROM user_account WHERE email = 'compliance@shipspace.internal');
BEGIN
    -- Admin Ports
    INSERT INTO admin_port (admin_id, port_id)
    SELECT adm1, id FROM port WHERE un_locode IN ('INNSA', 'INMUN', 'INMAA', 'SGSIN', 'AEJEA', 'NLRTM');

    INSERT INTO admin_port (admin_id, port_id)
    SELECT adm2, id FROM port WHERE un_locode IN ('INTUT', 'INCCU', 'LKCMB', 'CNSHA', 'DEHAM', 'USLAX');

    -- Admin Routes (Superadmin oversees intercontinental routes, Compliance oversees regional routes)
    INSERT INTO admin_route (admin_id, route_id)
    SELECT adm1, id FROM route WHERE typical_transit_days >= 7;

    INSERT INTO admin_route (admin_id, route_id)
    SELECT adm2, id FROM route WHERE typical_transit_days < 7;

    -- Admin Cargo Types (Admin 1: Manufactured & Machinery; Admin 2: Regulated, Perishable & Consumer)
    INSERT INTO admin_cargo_type (admin_id, cargo_type_id)
    SELECT adm1, id FROM cargo_type WHERE name IN (
        'Standard Dry Merchandise', 'Industrial Machinery & Spares', 'Automotive Components',
        'Chemicals (Non-Hazardous)', 'Ceramics & Fragile Glassware'
    );

    INSERT INTO admin_cargo_type (admin_id, cargo_type_id)
    SELECT adm2, id FROM cargo_type WHERE name IN (
        'Textiles & Apparel Goods', 'Electronics & Telecommunications', 'Pharmaceuticals & Health Supplies',
        'Perishable Food & Produce', 'Hazardous Regulated Goods (IMO/DG)'
    );
END $$;


-- ============================================================================
-- 10. POST-BOOKING LISTING STATUS MANAGEMENT
-- Close historical past-cutoff listing after its bookings are in place
-- (Satisfies Edge Case 4 requirement)
-- ============================================================================
DO $$
DECLARE
    v_l_past_id BIGINT := (
        SELECT l.id FROM capacity_listing l
        JOIN user_account u ON l.provider_id = u.id
        WHERE u.email = 'bookings@msc-logistics.in' AND l.cutoff_date < CURRENT_DATE AND l.total_cbm = 50.00
    );
BEGIN
    IF v_l_past_id IS NULL THEN
        RAISE EXCEPTION 'Post-booking status management failed: Historical past-cutoff listing resolved to NULL';
    END IF;

    UPDATE capacity_listing
    SET status = 'closed',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_l_past_id;
END $$;


-- ============================================================================
-- 11. RIGOROUS RECONCILIATION & INTEGRITY VERIFICATION SUITE
-- Raises an exception on any inconsistency, aborting the transaction.
-- ============================================================================
DO $$
DECLARE
    v_rec RECORD;
    v_count INT;
    v_tolerance NUMERIC := 0.001;
BEGIN
    RAISE NOTICE 'Executing reconciliation and data integrity checks...';

    -- ------------------------------------------------------------------------
    -- 11.1 Available CBM Reconciliation
    -- Formula: expected_available_cbm = total_cbm - SUM(booked_cbm for confirmed/completed)
    -- ------------------------------------------------------------------------
    FOR v_rec IN
        SELECT l.id, l.total_cbm, l.available_cbm,
               (l.total_cbm - COALESCE(SUM(b.booked_cbm) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0)) AS expected_cbm
        FROM capacity_listing l
        LEFT JOIN booking b ON l.id = b.listing_id
        GROUP BY l.id, l.total_cbm, l.available_cbm
    LOOP
        IF ABS(v_rec.available_cbm - v_rec.expected_cbm) > v_tolerance THEN
            RAISE EXCEPTION 'CBM Reconciliation mismatch on listing %: actual available %, expected %',
                v_rec.id, v_rec.available_cbm, v_rec.expected_cbm;
        END IF;
    END LOOP;
    RAISE NOTICE 'CHECK PASS: CBM capacity reconciled exactly across all listings.';

    -- ------------------------------------------------------------------------
    -- 11.2 Available Weight Reconciliation
    -- Formula: expected_available_weight = total_weight - SUM(booked_weight for confirmed/completed)
    -- ------------------------------------------------------------------------
    FOR v_rec IN
        SELECT l.id, l.total_weight, l.available_weight,
               (l.total_weight - COALESCE(SUM(b.booked_weight) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0)) AS expected_weight
        FROM capacity_listing l
        LEFT JOIN booking b ON l.id = b.listing_id
        GROUP BY l.id, l.total_weight, l.available_weight
    LOOP
        IF ABS(v_rec.available_weight - v_rec.expected_weight) > v_tolerance THEN
            RAISE EXCEPTION 'Weight Reconciliation mismatch on listing %: actual available %, expected %',
                v_rec.id, v_rec.available_weight, v_rec.expected_weight;
        END IF;
    END LOOP;
    RAISE NOTICE 'CHECK PASS: Weight capacity reconciled exactly across all listings.';

    -- ------------------------------------------------------------------------
    -- 11.3 Explicit Capacity Bounds Check
    -- Enforces: 0 <= available_cbm <= total_cbm AND 0 <= available_weight <= total_weight
    -- ------------------------------------------------------------------------
    SELECT count(*) INTO v_count
    FROM capacity_listing
    WHERE available_cbm < 0 OR available_cbm > total_cbm
       OR available_weight < 0 OR available_weight > total_weight;

    IF v_count > 0 THEN
        RAISE EXCEPTION 'Capacity bound violation: % listings have negative or overflowed available capacity', v_count;
    END IF;
    RAISE NOTICE 'CHECK PASS: All listings satisfy non-negative and non-overflow capacity bounds.';

    -- ------------------------------------------------------------------------
    -- 11.4 User Account & Subtype Profile 1:1 Consistency
    -- ------------------------------------------------------------------------
    SELECT count(*) INTO v_count
    FROM user_account u
    LEFT JOIN provider p ON u.id = p.id AND u.role = 'provider'
    LEFT JOIN trader t ON u.id = t.id AND u.role = 'trader'
    LEFT JOIN admin a ON u.id = a.id AND u.role = 'admin'
    WHERE (u.role = 'provider' AND p.id IS NULL)
       OR (u.role = 'trader' AND t.id IS NULL)
       OR (u.role = 'admin' AND a.id IS NULL);

    IF v_count > 0 THEN
        RAISE EXCEPTION 'User subtype consistency violation: % users lack a matching subtype row', v_count;
    END IF;
    RAISE NOTICE 'CHECK PASS: User account and subtype profiles are 1:1 consistent.';

    -- ------------------------------------------------------------------------
    -- 11.5 Allowed Cargo Type Integrity
    -- ------------------------------------------------------------------------
    SELECT count(*) INTO v_count
    FROM booking b
    LEFT JOIN listing_cargo lc ON b.listing_id = lc.listing_id AND b.cargo_type_id = lc.cargo_type_id
    WHERE lc.listing_id IS NULL;

    IF v_count > 0 THEN
        RAISE EXCEPTION 'Cargo type restriction violation: % bookings reference disallowed cargo types', v_count;
    END IF;
    RAISE NOTICE 'CHECK PASS: All bookings comply with listing cargo restrictions.';

    -- ------------------------------------------------------------------------
    -- 11.6 Booking Price Formula Integrity
    -- Formula: ROUND(GREATEST(booked_cbm * price_per_cbm, booked_weight * price_per_tonne, minimum_charge), 2)
    -- ------------------------------------------------------------------------
    FOR v_rec IN
        SELECT b.id, b.total_price,
               ROUND(GREATEST(b.booked_cbm * l.price_per_cbm, b.booked_weight * l.price_per_tonne, l.minimum_charge), 2) AS expected_price
        FROM booking b
        JOIN capacity_listing l ON b.listing_id = l.id
    LOOP
        IF ABS(v_rec.total_price - v_rec.expected_price) > v_tolerance THEN
            RAISE EXCEPTION 'Price calculation mismatch on booking %: stored %, expected %',
                v_rec.id, v_rec.total_price, v_rec.expected_price;
        END IF;
    END LOOP;
    RAISE NOTICE 'CHECK PASS: All stored booking prices match the rating formula.';

    -- ------------------------------------------------------------------------
    -- 11.7 Status History Integrity
    -- ------------------------------------------------------------------------
    -- Total bookings count check
    SELECT count(*) INTO v_count FROM booking;
    IF v_count <> 75 THEN
        RAISE EXCEPTION 'Booking count mismatch: expected 75 bookings, found %', v_count;
    END IF;

    -- Every booking must have exactly one initial record (old_status IS NULL, new_status = 'confirmed')
    SELECT count(*) INTO v_count
    FROM booking b
    WHERE (
        SELECT count(*) FROM booking_status_history h
        WHERE h.booking_id = b.id AND h.old_status IS NULL AND h.new_status = 'confirmed'
    ) <> 1;

    IF v_count > 0 THEN
        RAISE EXCEPTION 'Status history violation: % bookings lack exactly one initial history record', v_count;
    END IF;

    -- Every cancelled booking must have a confirmed -> cancelled transition
    SELECT count(*) INTO v_count
    FROM booking b
    WHERE b.status = 'cancelled'
      AND NOT EXISTS (
          SELECT 1 FROM booking_status_history h
          WHERE h.booking_id = b.id AND h.old_status = 'confirmed' AND h.new_status = 'cancelled'
      );

    IF v_count > 0 THEN
        RAISE EXCEPTION 'Status history violation: % cancelled bookings lack confirmed->cancelled transition', v_count;
    END IF;

    -- Every completed booking must have a confirmed -> completed transition
    SELECT count(*) INTO v_count
    FROM booking b
    WHERE b.status = 'completed'
      AND NOT EXISTS (
          SELECT 1 FROM booking_status_history h
          WHERE h.booking_id = b.id AND h.old_status = 'confirmed' AND h.new_status = 'completed'
      );

    IF v_count > 0 THEN
        RAISE EXCEPTION 'Status history violation: % completed bookings lack confirmed->completed transition', v_count;
    END IF;

    -- Total history rows check: 75 initial + 3 cancelled + 3 completed = 81
    SELECT count(*) INTO v_count FROM booking_status_history;
    IF v_count <> 81 THEN
        RAISE EXCEPTION 'Status history record count mismatch: expected 81 records, found %', v_count;
    END IF;
    RAISE NOTICE 'CHECK PASS: Audit status history is complete (81 records) across all booking lifecycles.';

    -- ------------------------------------------------------------------------
    -- 11.8 Verification of Required Edge Cases
    -- ------------------------------------------------------------------------
    -- Edge Case 1: At least one listing is full by CBM (available_cbm = 0)
    IF NOT EXISTS (SELECT 1 FROM capacity_listing WHERE status = 'full' AND available_cbm = 0) THEN
        RAISE EXCEPTION 'Edge Case 1 verification failed: No listing is full by CBM';
    END IF;

    -- Edge Case 2: At least one listing is full by Weight (available_weight = 0)
    IF NOT EXISTS (SELECT 1 FROM capacity_listing WHERE status = 'full' AND available_weight = 0) THEN
        RAISE EXCEPTION 'Edge Case 2 verification failed: No listing is full by Weight';
    END IF;

    -- Edge Case 3: At least two nearly-full listings (positive available capacity <= 1.0)
    SELECT count(*) INTO v_count
    FROM capacity_listing
    WHERE status = 'open' AND (available_cbm <= 1.0 OR available_weight <= 0.2);

    IF v_count < 2 THEN
        RAISE EXCEPTION 'Edge Case 3 verification failed: Found % nearly-full listings (expected >= 2)', v_count;
    END IF;

    -- Edge Case 4: Past-cutoff listing closed
    IF NOT EXISTS (SELECT 1 FROM capacity_listing WHERE cutoff_date < CURRENT_DATE AND status = 'closed') THEN
        RAISE EXCEPTION 'Edge Case 4 verification failed: No closed past-cutoff listing found';
    END IF;

    -- Edge Case 5: Hazardous allowed & Perishable restricted listings
    IF NOT EXISTS (
        SELECT 1 FROM listing_cargo lc
        JOIN cargo_type ct ON lc.cargo_type_id = ct.id
        WHERE ct.name = 'Hazardous Regulated Goods (IMO/DG)'
    ) THEN
        RAISE EXCEPTION 'Edge Case 5 verification failed: No listing allows hazardous cargo';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM capacity_listing l
        WHERE (SELECT count(*) FROM listing_cargo lc WHERE lc.listing_id = l.id) = 1
          AND EXISTS (
              SELECT 1 FROM listing_cargo lc
              JOIN cargo_type ct ON lc.cargo_type_id = ct.id
              WHERE lc.listing_id = l.id AND ct.name = 'Perishable Food & Produce'
          )
    ) THEN
        RAISE EXCEPTION 'Edge Case 5 verification failed: No listing is restricted solely to perishable produce';
    END IF;

    -- Edge Case 6: Competing providers on the same route
    IF NOT EXISTS (
        SELECT 1 FROM capacity_listing l1
        JOIN capacity_listing l2 ON l1.route_id = l2.route_id AND l1.provider_id <> l2.provider_id
    ) THEN
        RAISE EXCEPTION 'Edge Case 6 verification failed: No competing providers found on same route';
    END IF;

    -- Edge Case 7: Trader with zero bookings
    IF NOT EXISTS (
        SELECT 1 FROM trader t
        WHERE NOT EXISTS (SELECT 1 FROM booking b WHERE b.trader_id = t.id)
    ) THEN
        RAISE EXCEPTION 'Edge Case 7 verification failed: Every trader has bookings (expected at least 1 without)';
    END IF;

    -- Edge Case 8: Provider with listings but zero bookings
    IF NOT EXISTS (
        SELECT 1 FROM provider p
        WHERE EXISTS (SELECT 1 FROM capacity_listing l WHERE l.provider_id = p.id)
          AND NOT EXISTS (
              SELECT 1 FROM capacity_listing l
              JOIN booking b ON l.id = b.listing_id
              WHERE l.provider_id = p.id
          )
    ) THEN
        RAISE EXCEPTION 'Edge Case 8 verification failed: Every provider has bookings (expected at least 1 without)';
    END IF;

    -- Edge Case 9: Cancelled bookings exist
    IF NOT EXISTS (SELECT 1 FROM booking WHERE status = 'cancelled') THEN
        RAISE EXCEPTION 'Edge Case 9 verification failed: No cancelled bookings found';
    END IF;

    -- Edge Case 10: Completed bookings on arrived voyages
    -- Enforces: At least one completed booking exists, AND every completed booking strictly has arrival_date < CURRENT_DATE
    IF NOT EXISTS (SELECT 1 FROM booking WHERE status = 'completed') THEN
        RAISE EXCEPTION 'Edge Case 10 verification failed: No completed bookings found';
    END IF;

    SELECT count(*) INTO v_count
    FROM booking b
    JOIN capacity_listing l ON b.listing_id = l.id
    WHERE b.status = 'completed' AND l.arrival_date >= CURRENT_DATE;

    IF v_count > 0 THEN
        RAISE EXCEPTION 'Edge Case 10 verification failed: % completed bookings belong to voyages that have not yet arrived', v_count;
    END IF;

    -- Edge Case 11: Reopened listing with subsequent new booking
    -- Verified via stable attributes: listing has total_cbm = 25.00, contains 1 cancelled booking AND 1 confirmed rebooking of 3 CBM
    IF NOT EXISTS (
        SELECT 1 FROM capacity_listing l
        WHERE l.total_cbm = 25.00
          AND (SELECT count(*) FROM booking b WHERE b.listing_id = l.id AND b.status = 'cancelled') = 1
          AND (SELECT count(*) FROM booking b WHERE b.listing_id = l.id AND b.status = 'confirmed' AND b.booked_cbm = 3.00) = 1
    ) THEN
        RAISE EXCEPTION 'Edge Case 11 verification failed: Reopened listing with new booking not found';
    END IF;

    RAISE NOTICE 'CHECK PASS: All 11 domain edge cases successfully verified.';
END $$;


-- ============================================================================
-- 12. SUMMARY ROW COUNT REPOSITORY & REPORTING
-- Produces clean formatted row counts for all 14 schema tables.
-- ============================================================================
SELECT
    'user_account'           AS "Table",
    count(*)                 AS "Record Count",
    'Supertype Master Accounts (6 Providers, 20 Traders, 2 Admins)' AS "Description"
FROM user_account
UNION ALL
SELECT 'provider',               count(*), 'Provider Subtype Company Profiles' FROM provider
UNION ALL
SELECT 'trader',                 count(*), 'Trader Subtype SME Profiles' FROM trader
UNION ALL
SELECT 'admin',                  count(*), 'Admin Subtype Accounts' FROM admin
UNION ALL
SELECT 'port',                   count(*), 'Reference Seaports (UN/LOCODE validated)' FROM port
UNION ALL
SELECT 'route',                  count(*), 'Directed Shipping Routes' FROM route
UNION ALL
SELECT 'cargo_type',             count(*), 'Classified Cargo Categories' FROM cargo_type
UNION ALL
SELECT 'capacity_listing',       count(*), 'LCL Capacity Listings (open, full, closed)' FROM capacity_listing
UNION ALL
SELECT 'listing_cargo',          count(*), 'Allowed Cargo Type Associations' FROM listing_cargo
UNION ALL
SELECT 'booking',                count(*), 'Trader Reservations (confirmed, cancelled, completed)' FROM booking
UNION ALL
SELECT 'booking_status_history', count(*), 'Audit Lifecycle Transitions (inserts & updates)' FROM booking_status_history
UNION ALL
SELECT 'admin_port',             count(*), 'Admin Port Management Associations' FROM admin_port
UNION ALL
SELECT 'admin_route',            count(*), 'Admin Route Management Associations' FROM admin_route
UNION ALL
SELECT 'admin_cargo_type',       count(*), 'Admin Cargo Type Management Associations' FROM admin_cargo_type;

-- ============================================================================
-- 12.1. CAPACITY RECONCILIATION DIAGNOSTIC
-- Compares actual available capacity on each listing against total capacity
-- minus active reservations (confirmed and completed). Cancelled bookings
-- are excluded because cancellation restores capacity.
--
-- Expected result: Exactly 0 rows returned (no discrepancies).
-- ============================================================================
SELECT
    l.id AS listing_id,
    l.total_cbm,
    l.available_cbm AS actual_available_cbm,
    (l.total_cbm - COALESCE(SUM(b.booked_cbm) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00)) AS expected_available_cbm,
    l.total_weight,
    l.available_weight AS actual_available_weight,
    (l.total_weight - COALESCE(SUM(b.booked_weight) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00)) AS expected_available_weight,
    l.status AS listing_status
FROM capacity_listing l
LEFT JOIN booking b ON b.listing_id = l.id
GROUP BY l.id, l.total_cbm, l.available_cbm, l.total_weight, l.available_weight, l.status
HAVING
    l.available_cbm <> (l.total_cbm - COALESCE(SUM(b.booked_cbm) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00))
    OR
    l.available_weight <> (l.total_weight - COALESCE(SUM(b.booked_weight) FILTER (WHERE b.status IN ('confirmed', 'completed')), 0.00))
ORDER BY l.id;

COMMIT;

