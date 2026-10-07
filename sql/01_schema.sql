-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 01_schema.sql
-- Description: Core 14-Table Relational Schema Implementation
-- Source of Truth: Phase 3 Relational Schema + Normalization Specification
-- Dialect: PostgreSQL (14+)
-- ============================================================================

SET search_path TO shipspace, public;

-- ============================================================================
-- 1. USER_ACCOUNT
-- Master account table. Supertype for Provider, Trader, and Admin profiles.
-- ============================================================================
CREATE TABLE user_account (
    id            BIGINT GENERATED ALWAYS AS IDENTITY,
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_user_account PRIMARY KEY (id),
    CONSTRAINT uq_user_account_email UNIQUE (email),
    CONSTRAINT ck_user_account_role CHECK (role IN ('provider', 'trader', 'admin')),
    CONSTRAINT uq_user_account_id_role UNIQUE (id, role)
);

-- ============================================================================
-- 2. PROVIDER
-- Logistics service provider profile (Table-per-subclass).
-- ============================================================================
CREATE TABLE provider (
    id            BIGINT       NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'provider',
    company_name  VARCHAR(255) NOT NULL,
    gst_tax_id    VARCHAR(50)  NOT NULL,
    contact_phone VARCHAR(50)  NOT NULL,

    CONSTRAINT pk_provider PRIMARY KEY (id),
    CONSTRAINT ck_provider_role CHECK (role = 'provider'),
    CONSTRAINT fk_provider_user FOREIGN KEY (id, role)
        REFERENCES user_account (id, role)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
);

-- ============================================================================
-- 3. TRADER
-- Cargo shipper / SME profile (Table-per-subclass).
-- ============================================================================
CREATE TABLE trader (
    id            BIGINT       NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'trader',
    company_name  VARCHAR(255) NOT NULL,
    gst_tax_id    VARCHAR(50)  NOT NULL,
    contact_phone VARCHAR(50)  NOT NULL,

    CONSTRAINT pk_trader PRIMARY KEY (id),
    CONSTRAINT ck_trader_role CHECK (role = 'trader'),
    CONSTRAINT fk_trader_user FOREIGN KEY (id, role)
        REFERENCES user_account (id, role)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
);

-- ============================================================================
-- 4. ADMIN
-- Platform administrator profile (Table-per-subclass).
-- ============================================================================
CREATE TABLE admin (
    id   BIGINT      NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin',

    CONSTRAINT pk_admin PRIMARY KEY (id),
    CONSTRAINT ck_admin_role CHECK (role = 'admin'),
    CONSTRAINT fk_admin_user FOREIGN KEY (id, role)
        REFERENCES user_account (id, role)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
);

-- ============================================================================
-- 5. PORT
-- Reference seaport / terminal locations.
-- ============================================================================
CREATE TABLE port (
    id        BIGINT GENERATED ALWAYS AS IDENTITY,
    name      VARCHAR(255) NOT NULL,
    country   VARCHAR(100) NOT NULL,
    un_locode CHAR(5)      NOT NULL,

    CONSTRAINT pk_port PRIMARY KEY (id),
    CONSTRAINT uq_port_un_locode UNIQUE (un_locode),
    CONSTRAINT ck_port_un_locode_format CHECK (un_locode ~ '^[A-Z]{2}[A-Z0-9]{3}$')
);

-- ============================================================================
-- 6. ROUTE
-- Directed port-to-port maritime shipping lanes.
-- ============================================================================
CREATE TABLE route (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY,
    origin_port_id       BIGINT   NOT NULL,
    destination_port_id  BIGINT   NOT NULL,
    typical_transit_days INTEGER  NOT NULL,

    CONSTRAINT pk_route PRIMARY KEY (id),
    CONSTRAINT uq_route_ports UNIQUE (origin_port_id, destination_port_id),
    CONSTRAINT ck_route_distinct_ports CHECK (origin_port_id <> destination_port_id),
    CONSTRAINT ck_route_transit_days CHECK (typical_transit_days > 0),
    CONSTRAINT fk_route_origin_port FOREIGN KEY (origin_port_id)
        REFERENCES port (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_route_destination_port FOREIGN KEY (destination_port_id)
        REFERENCES port (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

-- ============================================================================
-- 7. CARGO_TYPE
-- Controlled cargo classification categories.
-- ============================================================================
CREATE TABLE cargo_type (
    id          BIGINT GENERATED ALWAYS AS IDENTITY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,

    CONSTRAINT pk_cargo_type PRIMARY KEY (id),
    CONSTRAINT uq_cargo_type_name UNIQUE (name)
);

-- ============================================================================
-- 8. CAPACITY_LISTING
-- LCL consolidation space published by logistics providers.
-- ============================================================================
CREATE TABLE capacity_listing (
    id               BIGINT GENERATED ALWAYS AS IDENTITY,
    provider_id      BIGINT         NOT NULL,
    route_id         BIGINT         NOT NULL,
    departure_date   DATE           NOT NULL,
    arrival_date     DATE           NOT NULL,
    cutoff_date      DATE           NOT NULL,
    total_cbm        NUMERIC(10, 2) NOT NULL,
    available_cbm    NUMERIC(10, 2) NOT NULL,
    total_weight     NUMERIC(10, 2) NOT NULL,
    available_weight NUMERIC(10, 2) NOT NULL,
    price_per_cbm    NUMERIC(12, 2) NOT NULL,
    price_per_tonne  NUMERIC(12, 2) NOT NULL,
    minimum_charge   NUMERIC(12, 2) NOT NULL,
    status           VARCHAR(20)    NOT NULL DEFAULT 'open',
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_capacity_listing PRIMARY KEY (id),
    CONSTRAINT ck_listing_total_cbm CHECK (total_cbm > 0),
    CONSTRAINT ck_listing_available_cbm CHECK (available_cbm >= 0 AND available_cbm <= total_cbm),
    CONSTRAINT ck_listing_total_weight CHECK (total_weight > 0),
    CONSTRAINT ck_listing_available_weight CHECK (available_weight >= 0 AND available_weight <= total_weight),
    CONSTRAINT ck_listing_price_cbm CHECK (price_per_cbm >= 0),
    CONSTRAINT ck_listing_price_tonne CHECK (price_per_tonne >= 0),
    CONSTRAINT ck_listing_min_charge CHECK (minimum_charge >= 0),
    CONSTRAINT ck_listing_schedule CHECK (cutoff_date <= departure_date AND departure_date < arrival_date),
    CONSTRAINT ck_listing_status CHECK (status IN ('open', 'full', 'closed', 'cancelled')),
    CONSTRAINT ck_listing_status_capacity CHECK (
        (status <> 'open' OR (available_cbm > 0 AND available_weight > 0))
        AND (status <> 'full' OR (available_cbm = 0 OR available_weight = 0))
    ),
    CONSTRAINT fk_listing_provider FOREIGN KEY (provider_id)
        REFERENCES provider (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_listing_route FOREIGN KEY (route_id)
        REFERENCES route (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

-- ============================================================================
-- 9. LISTING_CARGO
-- Resolves M:N association between Capacity Listing and allowed Cargo Types.
-- ============================================================================
CREATE TABLE listing_cargo (
    listing_id    BIGINT NOT NULL,
    cargo_type_id BIGINT NOT NULL,

    CONSTRAINT pk_listing_cargo PRIMARY KEY (listing_id, cargo_type_id),
    CONSTRAINT fk_listing_cargo_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_listing_cargo_type FOREIGN KEY (cargo_type_id)
        REFERENCES cargo_type (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

-- ============================================================================
-- 10. BOOKING
-- Trader reservation of container volume and payload on a capacity listing.
-- ============================================================================
CREATE TABLE booking (
    id            BIGINT GENERATED ALWAYS AS IDENTITY,
    trader_id     BIGINT         NOT NULL,
    listing_id    BIGINT         NOT NULL,
    cargo_type_id BIGINT         NOT NULL,
    booked_cbm    NUMERIC(10, 2) NOT NULL,
    booked_weight NUMERIC(10, 2) NOT NULL,
    total_price   NUMERIC(12, 2) NOT NULL,
    status        VARCHAR(20)    NOT NULL DEFAULT 'confirmed',
    booking_time  TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_booking PRIMARY KEY (id),
    CONSTRAINT ck_booking_booked_cbm CHECK (booked_cbm > 0),
    CONSTRAINT ck_booking_booked_weight CHECK (booked_weight > 0),
    CONSTRAINT ck_booking_total_price CHECK (total_price >= 0),
    CONSTRAINT ck_booking_status CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    CONSTRAINT fk_booking_trader FOREIGN KEY (trader_id)
        REFERENCES trader (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_booking_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_booking_cargo_type FOREIGN KEY (cargo_type_id)
        REFERENCES cargo_type (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_booking_listing_cargo FOREIGN KEY (listing_id, cargo_type_id)
        REFERENCES listing_cargo (listing_id, cargo_type_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

-- ============================================================================
-- 11. BOOKING_STATUS_HISTORY
-- Immutable audit log of lifecycle status changes for bookings.
-- ============================================================================
CREATE TABLE booking_status_history (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY,
    booking_id         BIGINT      NOT NULL,
    changed_by_user_id BIGINT      NOT NULL,
    old_status         VARCHAR(20),
    new_status         VARCHAR(20) NOT NULL,
    changed_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason             TEXT,

    CONSTRAINT pk_booking_status_history PRIMARY KEY (id),
    CONSTRAINT ck_history_old_status CHECK (old_status IS NULL OR old_status IN ('confirmed', 'cancelled', 'completed')),
    CONSTRAINT ck_history_new_status CHECK (new_status IN ('confirmed', 'cancelled', 'completed')),
    CONSTRAINT ck_history_status_transition CHECK (old_status IS NULL OR old_status <> new_status),
    CONSTRAINT fk_history_booking FOREIGN KEY (booking_id)
        REFERENCES booking (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_history_changed_by FOREIGN KEY (changed_by_user_id)
        REFERENCES user_account (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

-- ============================================================================
-- 12. ADMIN_PORT
-- Resolves M:N administrative management of Ports by Admins.
-- ============================================================================
CREATE TABLE admin_port (
    admin_id BIGINT NOT NULL,
    port_id  BIGINT NOT NULL,

    CONSTRAINT pk_admin_port PRIMARY KEY (admin_id, port_id),
    CONSTRAINT fk_admin_port_admin FOREIGN KEY (admin_id)
        REFERENCES admin (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_admin_port_port FOREIGN KEY (port_id)
        REFERENCES port (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

-- ============================================================================
-- 13. ADMIN_ROUTE
-- Resolves M:N administrative management of Routes by Admins.
-- ============================================================================
CREATE TABLE admin_route (
    admin_id BIGINT NOT NULL,
    route_id BIGINT NOT NULL,

    CONSTRAINT pk_admin_route PRIMARY KEY (admin_id, route_id),
    CONSTRAINT fk_admin_route_admin FOREIGN KEY (admin_id)
        REFERENCES admin (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_admin_route_route FOREIGN KEY (route_id)
        REFERENCES route (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

-- ============================================================================
-- 14. ADMIN_CARGO_TYPE
-- Resolves M:N administrative management of Cargo Types by Admins.
-- ============================================================================
CREATE TABLE admin_cargo_type (
    admin_id      BIGINT NOT NULL,
    cargo_type_id BIGINT NOT NULL,

    CONSTRAINT pk_admin_cargo_type PRIMARY KEY (admin_id, cargo_type_id),
    CONSTRAINT fk_admin_cargo_type_admin FOREIGN KEY (admin_id)
        REFERENCES admin (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_admin_cargo_type_cargo FOREIGN KEY (cargo_type_id)
        REFERENCES cargo_type (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);
