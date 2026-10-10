-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 05_functions_triggers.sql
-- Description: Database-level business logic, concurrency control, and audit triggers.
-- Dialect: PostgreSQL (14+)
-- ============================================================================

SET search_path TO shipspace, public;

-- ============================================================================
-- 1. REUSABLE UPDATED_AT TRIGGER FUNCTION
-- Automatically refreshes the updated_at column on row modification.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach updated_at triggers to entities with an updated_at audit column
DROP TRIGGER IF EXISTS trg_user_account_updated_at ON user_account;
CREATE TRIGGER trg_user_account_updated_at
    BEFORE UPDATE ON user_account
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_capacity_listing_updated_at ON capacity_listing;
CREATE TRIGGER trg_capacity_listing_updated_at
    BEFORE UPDATE ON capacity_listing
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_booking_updated_at ON booking;
CREATE TRIGGER trg_booking_updated_at
    BEFORE UPDATE ON booking
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();


-- ============================================================================
-- 2. BOOKING VALIDATION, CONCURRENCY CONTROL & CAPACITY RESERVATION
-- Enforces:
--  - Row locking with SELECT ... FOR UPDATE (R5: Concurrency Safety)
--  - Listing existence & 'open' status check (R6)
--  - Cutoff date validation (R3: booking_time::date <= cutoff_date)
--  - Capacity availability checks (R1: booked_cbm <= available_cbm, booked_weight <= available_weight)
--  - Allowed cargo type check (R2)
--  - Historical price snapshot calculation (R7: GREATEST formula)
--  - Atomic capacity decrement and status management ('open' -> 'full')
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_validate_and_reserve_booking()
RETURNS TRIGGER AS $$
DECLARE
    v_listing              capacity_listing%ROWTYPE;
    v_charge_by_cbm        NUMERIC(12, 2);
    v_charge_by_weight     NUMERIC(12, 2);
    v_calculated_price     NUMERIC(12, 2);
    v_new_available_cbm    NUMERIC(10, 2);
    v_new_available_weight NUMERIC(10, 2);
    v_new_listing_status   VARCHAR(20);
BEGIN
    -- 1 & 2. Lock the corresponding capacity_listing row and verify existence
    SELECT * INTO v_listing
    FROM capacity_listing
    WHERE id = NEW.listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing % does not exist', NEW.listing_id;
    END IF;

    -- 3. Verify listing status is 'open'
    IF v_listing.status <> 'open' THEN
        RAISE EXCEPTION 'Listing % is not open for booking (current status: %)',
            NEW.listing_id, v_listing.status;
    END IF;

    -- 4. Verify booking cutoff date: booking_time::date <= cutoff_date
    IF NEW.booking_time IS NULL THEN
        NEW.booking_time := CURRENT_TIMESTAMP;
    END IF;

    IF NEW.booking_time::date > v_listing.cutoff_date THEN
        RAISE EXCEPTION 'Booking must be made on or before the listing cutoff date % (attempted booking date: %)',
            v_listing.cutoff_date, NEW.booking_time::date;
    END IF;

    -- 5. Verify booked_cbm <= available_cbm
    IF NEW.booked_cbm > v_listing.available_cbm THEN
        RAISE EXCEPTION 'Insufficient available CBM on listing %: requested %, available %',
            NEW.listing_id, NEW.booked_cbm, v_listing.available_cbm;
    END IF;

    -- 6. Verify booked_weight <= available_weight
    IF NEW.booked_weight > v_listing.available_weight THEN
        RAISE EXCEPTION 'Insufficient available weight on listing %: requested %, available %',
            NEW.listing_id, NEW.booked_weight, v_listing.available_weight;
    END IF;

    -- 7. Verify selected cargo type is allowed for this listing
    IF NOT EXISTS (
        SELECT 1
        FROM listing_cargo
        WHERE listing_id = NEW.listing_id
          AND cargo_type_id = NEW.cargo_type_id
    ) THEN
        RAISE EXCEPTION 'Cargo type % is not allowed for listing %',
            NEW.cargo_type_id, NEW.listing_id;
    END IF;

    -- 8. Compute and freeze historical price snapshot
    v_charge_by_cbm    := NEW.booked_cbm * v_listing.price_per_cbm;
    v_charge_by_weight := NEW.booked_weight * v_listing.price_per_tonne;
    v_calculated_price := ROUND(GREATEST(v_charge_by_cbm, v_charge_by_weight, v_listing.minimum_charge), 2);
    NEW.total_price    := v_calculated_price;

    -- Ensure initial booking status is confirmed
    IF NEW.status IS NULL THEN
        NEW.status := 'confirmed';
    END IF;

    -- 9 & 10. Atomically reduce available capacity on the listing
    v_new_available_cbm    := v_listing.available_cbm - NEW.booked_cbm;
    v_new_available_weight := v_listing.available_weight - NEW.booked_weight;

    -- If either capacity dimension drops to zero, mark listing 'full', else 'open'
    IF v_new_available_cbm = 0 OR v_new_available_weight = 0 THEN
        v_new_listing_status := 'full';
    ELSE
        v_new_listing_status := 'open';
    END IF;

    -- 11. Update listing with new capacity, status, and updated_at
    UPDATE capacity_listing
    SET available_cbm    = v_new_available_cbm,
        available_weight = v_new_available_weight,
        status           = v_new_listing_status,
        updated_at       = CURRENT_TIMESTAMP
    WHERE id = v_listing.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_and_reserve_booking ON booking;
CREATE TRIGGER trg_validate_and_reserve_booking
    BEFORE INSERT ON booking
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_and_reserve_booking();


-- ============================================================================
-- 3. BOOKING STATUS TRANSITION & IMMUTABILITY VALIDATION
-- Enforces allowed lifecycle transitions:
--   confirmed -> cancelled
--   confirmed -> completed
-- Rejects:
--   cancelled -> anything (terminal state)
--   completed -> anything (terminal state)
--   confirmed -> confirmed
-- Also protects immutable historical booking fields from unauthorized changes.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_validate_booking_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_arrival_date DATE;
BEGIN
    -- Prevent modification of core parameters on an existing booking
    IF NEW.listing_id <> OLD.listing_id THEN
        RAISE EXCEPTION 'Cannot modify listing_id for an existing booking %', OLD.id;
    END IF;

    IF NEW.trader_id <> OLD.trader_id THEN
        RAISE EXCEPTION 'Cannot modify trader_id for an existing booking %', OLD.id;
    END IF;

    IF NEW.booked_cbm <> OLD.booked_cbm OR NEW.booked_weight <> OLD.booked_weight THEN
        RAISE EXCEPTION 'Cannot modify reserved CBM or weight for booking %. Cancel and book again.', OLD.id;
    END IF;

    IF NEW.total_price <> OLD.total_price THEN
        RAISE EXCEPTION 'Booking total_price is an immutable historical snapshot and cannot be modified';
    END IF;

    -- Validate status transitions
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
            -- Valid transition: confirmed -> cancelled
            NULL;
        ELSIF OLD.status = 'confirmed' AND NEW.status = 'completed' THEN
            -- Valid transition: confirmed -> completed
            -- Only allowed if the voyage has arrived (arrival_date < CURRENT_DATE)
            SELECT arrival_date INTO v_arrival_date
            FROM capacity_listing
            WHERE id = OLD.listing_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Listing % associated with booking % does not exist',
                    OLD.listing_id, OLD.id;
            END IF;

            IF v_arrival_date IS NULL OR v_arrival_date >= CURRENT_DATE THEN
                RAISE EXCEPTION 'Booking % cannot be marked completed: voyage arrival date (%) must be past (current date: %)',
                    OLD.id, COALESCE(v_arrival_date::text, 'NULL'), CURRENT_DATE;
            END IF;
        ELSIF OLD.status = 'cancelled' THEN
            RAISE EXCEPTION 'Booking % has already been cancelled and cannot transition to %',
                OLD.id, NEW.status;
        ELSIF OLD.status = 'completed' THEN
            RAISE EXCEPTION 'Booking % is already completed and cannot transition to %',
                OLD.id, NEW.status;
        ELSIF OLD.status = NEW.status THEN
            RAISE EXCEPTION 'Invalid booking status transition: booking % is already in status "%"',
                OLD.id, OLD.status;
        ELSE
            RAISE EXCEPTION 'Invalid booking status transition from "%" to "%" for booking %',
                OLD.status, NEW.status, OLD.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_booking_status_transition ON booking;
CREATE TRIGGER trg_validate_booking_status_transition
    BEFORE UPDATE ON booking
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_booking_status_transition();


-- ============================================================================
-- 4. CANCELLATION / CAPACITY RESTORATION
-- Enforces:
--  - Row locking with SELECT ... FOR UPDATE on capacity_listing
--  - Exact restoration of reserved CBM and weight
--  - Available capacity never exceeds original total capacity
--  - Listing status reopened from 'full' to 'open' when capacity is freed
--  - Updates listing.updated_at
--  - Restores capacity exactly once (terminal states block duplicate cancellation)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_restore_capacity_on_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    v_listing            capacity_listing%ROWTYPE;
    v_new_available_cbm  NUMERIC(10, 2);
    v_new_available_wt   NUMERIC(10, 2);
    v_new_listing_status VARCHAR(20);
BEGIN
    -- Only act when transitioning from 'confirmed' to 'cancelled'
    IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
        -- 1. Lock the associated capacity_listing row
        SELECT * INTO v_listing
        FROM capacity_listing
        WHERE id = OLD.listing_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Listing % associated with booking % does not exist',
                OLD.listing_id, OLD.id;
        END IF;

        -- 2 & 3. Restore exact reserved quantities
        -- 4. Never exceed original total capacity
        v_new_available_cbm := LEAST(v_listing.total_cbm, v_listing.available_cbm + OLD.booked_cbm);
        v_new_available_wt  := LEAST(v_listing.total_weight, v_listing.available_weight + OLD.booked_weight);

        -- 5. Reopen listing if it was 'full' and now has available capacity
        IF v_listing.status = 'full' AND v_new_available_cbm > 0 AND v_new_available_wt > 0 THEN
            v_new_listing_status := 'open';
        ELSE
            v_new_listing_status := v_listing.status;
        END IF;

        -- 6. Update capacity_listing
        UPDATE capacity_listing
        SET available_cbm    = v_new_available_cbm,
            available_weight = v_new_available_wt,
            status           = v_new_listing_status,
            updated_at       = CURRENT_TIMESTAMP
        WHERE id = v_listing.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_restore_capacity_on_cancellation ON booking;
CREATE TRIGGER trg_restore_capacity_on_cancellation
    AFTER UPDATE OF status ON booking
    FOR EACH ROW
    EXECUTE FUNCTION fn_restore_capacity_on_cancellation();


-- ============================================================================
-- 5. BOOKING STATUS HISTORY AUDIT LOGGING
-- Automatically records status lifecycle changes to booking_status_history:
--  - Initial record on INSERT: old_status = NULL, new_status = confirmed
--  - Transition records on UPDATE of status: old_status and new_status logged
--  - Supports session variables shipspace.current_user_id & shipspace.status_change_reason
--  - Non-recursive: writes to booking_status_history, never booking
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_record_booking_status_history()
RETURNS TRIGGER AS $$
DECLARE
    v_changed_by BIGINT;
    v_reason     TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Initial booking creation record
        INSERT INTO booking_status_history (
            booking_id,
            changed_by_user_id,
            old_status,
            new_status,
            changed_at,
            reason
        ) VALUES (
            NEW.id,
            NEW.trader_id,
            NULL,
            NEW.status,
            CURRENT_TIMESTAMP,
            'Initial booking confirmed'
        );

    ELSIF TG_OP = 'UPDATE' THEN
        -- Record changes whenever status changes
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            -- Retrieve acting user if provided by application session context
            v_changed_by := NULLIF(current_setting('shipspace.current_user_id', true), '')::BIGINT;
            IF v_changed_by IS NULL THEN
                v_changed_by := NEW.trader_id;
            END IF;

            -- Retrieve reason if provided by application session context
            v_reason := NULLIF(current_setting('shipspace.status_change_reason', true), '');
            IF v_reason IS NULL THEN
                IF NEW.status = 'cancelled' THEN
                    v_reason := 'Booking cancelled';
                ELSIF NEW.status = 'completed' THEN
                    v_reason := 'Shipment completed';
                ELSE
                    v_reason := 'Status updated to ' || NEW.status;
                END IF;
            END IF;

            INSERT INTO booking_status_history (
                booking_id,
                changed_by_user_id,
                old_status,
                new_status,
                changed_at,
                reason
            ) VALUES (
                NEW.id,
                v_changed_by,
                OLD.status,
                NEW.status,
                CURRENT_TIMESTAMP,
                v_reason
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_record_booking_status_history ON booking;
CREATE TRIGGER trg_record_booking_status_history
    AFTER INSERT OR UPDATE OF status ON booking
    FOR EACH ROW
    EXECUTE FUNCTION fn_record_booking_status_history();


-- ============================================================================
-- 6. APPLICATION HELPER PROCEDURE: CANCEL BOOKING
-- Sets acting user and cancellation reason in session context before updating.
-- Relies on trg_restore_capacity_on_cancellation to restore capacity and reopen listing.
-- ============================================================================
CREATE OR REPLACE PROCEDURE sp_cancel_booking(
    p_booking_id BIGINT,
    p_user_id    BIGINT,
    p_reason     TEXT DEFAULT 'Cancelled by user'
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_booking booking%ROWTYPE;
BEGIN
    -- 1. Explicitly acquire row-level exclusive lock on booking
    SELECT * INTO v_booking
    FROM booking
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % does not exist', p_booking_id;
    END IF;

    -- 2. Pre-check terminal statuses before attempting update
    IF v_booking.status = 'cancelled' THEN
        RAISE EXCEPTION 'Booking % has already been cancelled and cannot be cancelled again', p_booking_id;
    END IF;

    IF v_booking.status = 'completed' THEN
        RAISE EXCEPTION 'Booking % is already completed and cannot be cancelled', p_booking_id;
    END IF;

    -- 3. Set acting user and cancellation reason in session context
    PERFORM set_config('shipspace.current_user_id', p_user_id::text, true);
    PERFORM set_config('shipspace.status_change_reason', p_reason, true);

    -- 4. Update status (triggers handle capacity restoration & audit history under lock)
    UPDATE booking
    SET status = 'cancelled'
    WHERE id = p_booking_id;
END;
$$;


-- ============================================================================
-- 7. APPLICATION HELPER PROCEDURE: CREATE BOOKING
-- Provides a clean procedural API for application-level transactional booking.
-- Explicitly acquires SELECT ... FOR UPDATE row lock on capacity_listing,
-- validates status, cutoff, capacity, and cargo type, inserts booking, and
-- relies on trg_validate_and_reserve_booking for atomic decrement and status update.
-- ============================================================================
CREATE OR REPLACE PROCEDURE sp_create_booking(
    p_trader_id     BIGINT,
    p_listing_id    BIGINT,
    p_cargo_type_id BIGINT,
    p_booked_cbm    NUMERIC(10, 2),
    p_booked_weight NUMERIC(10, 2),
    INOUT p_booking_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_listing capacity_listing%ROWTYPE;
BEGIN
    -- 1. Explicitly acquire row-level exclusive lock on capacity listing
    SELECT * INTO v_listing
    FROM capacity_listing
    WHERE id = p_listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing % does not exist', p_listing_id;
    END IF;

    -- 2. Pre-check status
    IF v_listing.status <> 'open' THEN
        RAISE EXCEPTION 'Listing % is not open for booking (current status: %)',
            p_listing_id, v_listing.status;
    END IF;

    -- 3. Pre-check cutoff date
    IF CURRENT_DATE > v_listing.cutoff_date THEN
        RAISE EXCEPTION 'Booking must be made on or before listing cutoff date % (current date: %)',
            v_listing.cutoff_date, CURRENT_DATE;
    END IF;

    -- 4. Pre-check capacity under lock
    IF p_booked_cbm > v_listing.available_cbm THEN
        RAISE EXCEPTION 'Insufficient available CBM on listing %: requested %, available %',
            p_listing_id, p_booked_cbm, v_listing.available_cbm;
    END IF;

    IF p_booked_weight > v_listing.available_weight THEN
        RAISE EXCEPTION 'Insufficient available weight on listing %: requested %, available %',
            p_listing_id, p_booked_weight, v_listing.available_weight;
    END IF;

    -- 5. Insert booking (trigger handles price calculation, capacity decrement & audit history)
    INSERT INTO booking (
        trader_id,
        listing_id,
        cargo_type_id,
        booked_cbm,
        booked_weight,
        total_price,
        status
    ) VALUES (
        p_trader_id,
        p_listing_id,
        p_cargo_type_id,
        p_booked_cbm,
        p_booked_weight,
        0.00,
        'confirmed'
    ) RETURNING id INTO p_booking_id;
END;
$$;
