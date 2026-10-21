-- ============================================================================
-- ShipSpace LCL Capacity Marketplace
-- File: 10_feature_b_timelines_docs_rollover.sql
-- Description: Feature B — Listing Deadlines, Booking Timelines, Date-Change
--              History, Reminders, Document Checklist & Rollover Handling
-- Target: PostgreSQL 14+
-- Schema: shipspace
--
-- Scope:
--   1. standard_milestone_type: Master catalogue of standard shipment milestones
--   2. listing_schedule_policy: Listing-level timezone-aware deadlines, CFS details,
--      minimum lead time (default 3 days), and rollover policy
--   3. listing_milestone_template: Configurable standard & custom listing milestones
--   4. listing_date_change_history: Append-only audit log of listing schedule changes
--   5. booking_milestone: Frozen original milestone snapshot + live booking timeline
--   6. booking_date_change_history: Append-only audit log of booking milestone changes
--   7. booking_reminder_schedule: Reminder offsets (5d, 2d, 1d, morning_of, missed_deadline)
--      with 08:00-20:00 local-time window check, deduplication & timezone preservation
--   8. booking_document_checklist: Export document checklist & review workflow
--   9. booking_document_upload: Secure off-webroot file upload metadata
--  10. booking_rollover_event: Append-only missed cut-off & rollover decision log
--  11. in_app_notification: Persistent role-targeted in-app notifications
--
-- Historical & Backward Compatibility:
--   - Wrapped in an atomic transaction block (BEGIN ... COMMIT).
--   - Strictly additive. Zero modifications or drops to existing tables, views,
--     booking/capacity triggers, or Feature A charge snapshots.
--   - Does NOT backfill invented deadlines, CFS details, or rollover policies
--     onto historical listings or bookings.
--   - Actual reminder timestamp calculation, background polling/delivery, and
--     off-webroot file storage I/O remain backend service responsibilities.
-- ============================================================================

BEGIN;

SET search_path TO shipspace, public;

-- ============================================================================
-- 1. STANDARD_MILESTONE_TYPE
-- Master catalogue of standard LCL operational milestones.
-- ============================================================================
CREATE TABLE IF NOT EXISTS standard_milestone_type (
    id                    INT GENERATED ALWAYS AS IDENTITY,
    code                  VARCHAR(50)  NOT NULL,
    name                  VARCHAR(120) NOT NULL,
    default_owner         VARCHAR(20)  NOT NULL DEFAULT 'shipper',
    is_mandatory          BOOLEAN      NOT NULL DEFAULT TRUE,
    default_display_order INT          NOT NULL DEFAULT 0,
    default_help_text     TEXT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_standard_milestone_type PRIMARY KEY (id),
    CONSTRAINT uq_standard_milestone_type_code UNIQUE (code),
    CONSTRAINT ck_std_milestone_owner CHECK (
        default_owner IN ('shipper', 'provider', 'customs', 'terminal', 'consignee')
    )
);

-- ============================================================================
-- Seed Standard LCL Milestones (Idempotent via ON CONFLICT DO NOTHING)
-- ============================================================================
INSERT INTO standard_milestone_type (
    code, name, default_owner, is_mandatory, default_display_order, default_help_text
) VALUES
(
    'booking_cutoff',
    'Booking & Space Reservation Cut-Off',
    'shipper',
    TRUE,
    10,
    'Final deadline to confirm LCL space reservation and meet the minimum booking lead time.'
),
(
    'doc_cutoff',
    'Shipping Instructions & Documentation Cut-Off',
    'shipper',
    TRUE,
    20,
    'Submit Commercial Invoice, Packing List, IEC, HS Codes, and Shipping Bill reference for manifest filing.'
),
(
    'cfs_gate_in',
    'Origin CFS Cargo Gate-In Cut-Off',
    'shipper',
    TRUE,
    30,
    'Deliver physical cargo to the designated Origin Container Freight Station (CFS) for tallying and consolidation.'
),
(
    'customs_clearance',
    'Export Customs Let Export Order (LEO)',
    'customs',
    TRUE,
    40,
    'Completion of export customs examination and issuance of Let Export Order prior to container sealing.'
),
(
    'etd',
    'Estimated Time of Vessel Departure (ETD)',
    'provider',
    TRUE,
    50,
    'Scheduled vessel departure from the origin loading port.'
),
(
    'eta',
    'Estimated Time of Vessel Arrival (ETA)',
    'provider',
    TRUE,
    60,
    'Scheduled vessel arrival at the destination discharge port.'
),
(
    'cargo_delivery',
    'Destination CFS Deconsolidation & Cargo Release',
    'consignee',
    FALSE,
    70,
    'Container stripping at destination CFS and Delivery Order release to the consignee.'
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. LISTING_SCHEDULE_POLICY
-- 1:1 extension of capacity_listing storing timezone-aware cut-offs, CFS details,
-- minimum lead time (default 3 days), and the three required rollover policies:
--   - 'roll_next_sailing': moved to the next sailing at the same price
--   - 'accept_late_with_fee': re-quoted for the next sailing
--   - 'cancel_if_missed': cancellation under the stated terms
-- Historical listings without a row remain readable as legacy listings.
-- ============================================================================
CREATE TABLE IF NOT EXISTS listing_schedule_policy (
    listing_id            BIGINT       NOT NULL,
    port_timezone         VARCHAR(64)  NOT NULL DEFAULT 'Asia/Kolkata',
    doc_cutoff_at         TIMESTAMPTZ  NOT NULL,
    cfs_gate_in_at        TIMESTAMPTZ  NOT NULL,
    cfs_name              VARCHAR(200) NOT NULL,
    cfs_address           TEXT         NOT NULL,
    etd_at                TIMESTAMPTZ  NOT NULL,
    eta_at                TIMESTAMPTZ  NOT NULL,
    min_lead_time_days    INT          NOT NULL DEFAULT 3,
    rollover_policy       VARCHAR(40)  NOT NULL,
    rollover_charge_terms TEXT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_listing_schedule_policy PRIMARY KEY (listing_id),
    CONSTRAINT fk_schedule_policy_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT ck_schedule_policy_timezone_nonempty CHECK (length(btrim(port_timezone)) > 0),
    CONSTRAINT ck_schedule_policy_cfs_name_nonempty CHECK (length(btrim(cfs_name)) > 0),
    CONSTRAINT ck_schedule_policy_cfs_address_nonempty CHECK (length(btrim(cfs_address)) > 0),
    CONSTRAINT ck_schedule_policy_lead_time CHECK (min_lead_time_days >= 0 AND min_lead_time_days <= 60),
    CONSTRAINT ck_schedule_policy_rollover CHECK (
        rollover_policy IN ('roll_next_sailing', 'accept_late_with_fee', 'cancel_if_missed')
    ),
    CONSTRAINT ck_schedule_policy_chronology CHECK (
        doc_cutoff_at <= etd_at
        AND cfs_gate_in_at <= etd_at
        AND etd_at < eta_at
    )
);

DROP TRIGGER IF EXISTS trg_listing_schedule_policy_updated_at ON listing_schedule_policy;
CREATE TRIGGER trg_listing_schedule_policy_updated_at
    BEFORE UPDATE ON listing_schedule_policy
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================================
-- 3. LISTING_MILESTONE_TEMPLATE
-- Standard and custom milestones configured by the provider for a listing.
-- ============================================================================
CREATE TABLE IF NOT EXISTS listing_milestone_template (
    id                BIGINT GENERATED ALWAYS AS IDENTITY,
    listing_id        BIGINT       NOT NULL,
    milestone_type_id INT,
    milestone_code    VARCHAR(50)  NOT NULL,
    milestone_name    VARCHAR(150) NOT NULL,
    owner_role        VARCHAR(20)  NOT NULL DEFAULT 'shipper',
    due_at            TIMESTAMPTZ  NOT NULL,
    timezone          VARCHAR(64)  NOT NULL DEFAULT 'Asia/Kolkata',
    is_required       BOOLEAN      NOT NULL DEFAULT TRUE,
    help_text         TEXT,
    display_order     INT          NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_listing_milestone_template PRIMARY KEY (id),
    CONSTRAINT uq_listing_milestone_code UNIQUE (listing_id, milestone_code),
    CONSTRAINT fk_milestone_template_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_milestone_template_type FOREIGN KEY (milestone_type_id)
        REFERENCES standard_milestone_type (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT ck_milestone_template_owner CHECK (
        owner_role IN ('shipper', 'provider', 'customs', 'terminal', 'consignee')
    ),
    CONSTRAINT ck_milestone_template_timezone CHECK (length(btrim(timezone)) > 0)
);

DROP TRIGGER IF EXISTS trg_listing_milestone_template_updated_at ON listing_milestone_template;
CREATE TRIGGER trg_listing_milestone_template_updated_at
    BEFORE UPDATE ON listing_milestone_template
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================================
-- 4. LISTING_DATE_CHANGE_HISTORY
-- Append-only audit log of date/deadline modifications on a capacity listing.
-- ============================================================================
CREATE TABLE IF NOT EXISTS listing_date_change_history (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY,
    listing_id         BIGINT      NOT NULL,
    field_name         VARCHAR(50) NOT NULL,
    old_due_at         TIMESTAMPTZ,
    new_due_at         TIMESTAMPTZ NOT NULL,
    timezone           VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    reason             TEXT        NOT NULL,
    changed_by_user_id BIGINT      NOT NULL,
    changed_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_listing_date_change_history PRIMARY KEY (id),
    CONSTRAINT fk_listing_date_hist_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_listing_date_hist_user FOREIGN KEY (changed_by_user_id)
        REFERENCES user_account (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT ck_listing_date_hist_field_name CHECK (
        field_name IN (
            'doc_cutoff_at',
            'cfs_gate_in_at',
            'etd_at',
            'eta_at',
            'cutoff_date',
            'departure_date',
            'arrival_date'
        )
    ),
    CONSTRAINT ck_listing_date_hist_reason CHECK (length(btrim(reason)) > 0),
    CONSTRAINT ck_listing_date_hist_distinct CHECK (old_due_at IS NULL OR old_due_at <> new_due_at)
);

-- ============================================================================
-- 5. BOOKING_MILESTONE
-- Snapshot of listing milestones locked when a booking is confirmed.
-- Starts with original_due_at = current_due_at and preserves original_due_at
-- immutably while allowing audited updates to current_due_at.
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_milestone (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY,
    booking_id           BIGINT       NOT NULL,
    listing_id           BIGINT       NOT NULL,
    milestone_code       VARCHAR(50)  NOT NULL,
    milestone_name       VARCHAR(150) NOT NULL,
    owner_role           VARCHAR(20)  NOT NULL DEFAULT 'shipper',
    original_due_at      TIMESTAMPTZ  NOT NULL,
    current_due_at       TIMESTAMPTZ  NOT NULL,
    timezone             VARCHAR(64)  NOT NULL DEFAULT 'Asia/Kolkata',
    is_required          BOOLEAN      NOT NULL DEFAULT TRUE,
    help_text            TEXT,
    status               VARCHAR(20)  NOT NULL DEFAULT 'pending',
    completed_by_user_id BIGINT,
    completed_at         TIMESTAMPTZ,
    completion_note      TEXT,
    display_order        INT          NOT NULL DEFAULT 0,
    snapshot_time        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_booking_milestone PRIMARY KEY (id),
    CONSTRAINT uq_booking_milestone_id_booking UNIQUE (id, booking_id),
    CONSTRAINT uq_booking_milestone_code UNIQUE (booking_id, milestone_code),
    CONSTRAINT fk_booking_milestone_booking FOREIGN KEY (booking_id)
        REFERENCES booking (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_booking_milestone_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_booking_milestone_completed_by FOREIGN KEY (completed_by_user_id)
        REFERENCES user_account (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT ck_booking_milestone_owner CHECK (
        owner_role IN ('shipper', 'provider', 'customs', 'terminal', 'consignee')
    ),
    CONSTRAINT ck_booking_milestone_status CHECK (
        status IN ('pending', 'in_progress', 'completed', 'missed', 'waived', 'rolled')
    ),
    CONSTRAINT ck_booking_milestone_timezone CHECK (length(btrim(timezone)) > 0),
    CONSTRAINT ck_booking_milestone_completion CHECK (
        (status <> 'completed') OR (completed_by_user_id IS NOT NULL AND completed_at IS NOT NULL)
    )
);

DROP TRIGGER IF EXISTS trg_booking_milestone_updated_at ON booking_milestone;
CREATE TRIGGER trg_booking_milestone_updated_at
    BEFORE UPDATE ON booking_milestone
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================================
-- 6. BOOKING_DATE_CHANGE_HISTORY
-- Append-only audit log of milestone date changes on a booking.
-- Uses composite FK (booking_milestone_id, booking_id) to guarantee the
-- milestone belongs to the same booking.
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_date_change_history (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY,
    booking_id           BIGINT      NOT NULL,
    booking_milestone_id BIGINT      NOT NULL,
    milestone_code       VARCHAR(50) NOT NULL,
    old_due_at           TIMESTAMPTZ NOT NULL,
    new_due_at           TIMESTAMPTZ NOT NULL,
    timezone             VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    reason               TEXT        NOT NULL,
    changed_by_user_id   BIGINT      NOT NULL,
    changed_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_booking_date_change_history PRIMARY KEY (id),
    CONSTRAINT fk_booking_date_hist_booking FOREIGN KEY (booking_id)
        REFERENCES booking (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_booking_date_hist_milestone_booking FOREIGN KEY (booking_milestone_id, booking_id)
        REFERENCES booking_milestone (id, booking_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_booking_date_hist_user FOREIGN KEY (changed_by_user_id)
        REFERENCES user_account (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT ck_booking_date_hist_reason CHECK (length(btrim(reason)) > 0),
    CONSTRAINT ck_booking_date_hist_distinct CHECK (old_due_at <> new_due_at)
);

-- ============================================================================
-- 7. BOOKING_REMINDER_SCHEDULE
-- Scheduled reminder records with offsets (5 days, 2 days, 1 day, morning of
-- deadline at 08:00 local time, and immediate missed deadline), 08:00-20:00
-- local-time window enforcement, delivery status, and deduplication.
-- Note: Actual reminder timestamp calculation and background delivery are
-- handled by the backend reminder scheduler service.
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_reminder_schedule (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY,
    booking_id            BIGINT      NOT NULL,
    booking_milestone_id  BIGINT      NOT NULL,
    recipient_user_id     BIGINT      NOT NULL,
    reminder_type         VARCHAR(30) NOT NULL,
    offset_days           INT         NOT NULL,
    timezone              VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    milestone_due_version TIMESTAMPTZ NOT NULL,
    scheduled_for         TIMESTAMPTZ NOT NULL,
    delivery_status       VARCHAR(30) NOT NULL DEFAULT 'pending',
    sent_at               TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_booking_reminder_schedule PRIMARY KEY (id),
    CONSTRAINT uq_booking_reminder_dedup UNIQUE (
        booking_milestone_id,
        recipient_user_id,
        reminder_type,
        milestone_due_version
    ),
    CONSTRAINT fk_reminder_booking FOREIGN KEY (booking_id)
        REFERENCES booking (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_reminder_milestone_booking FOREIGN KEY (booking_milestone_id, booking_id)
        REFERENCES booking_milestone (id, booking_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_reminder_recipient FOREIGN KEY (recipient_user_id)
        REFERENCES user_account (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT ck_reminder_type CHECK (
        reminder_type IN ('offset_5d', 'offset_2d', 'offset_1d', 'morning_of', 'missed_deadline')
    ),
    CONSTRAINT ck_reminder_offset_days CHECK (
        (reminder_type = 'offset_5d' AND offset_days = 5)
        OR (reminder_type = 'offset_2d' AND offset_days = 2)
        OR (reminder_type = 'offset_1d' AND offset_days = 1)
        OR (reminder_type = 'morning_of' AND offset_days = 0)
        OR (reminder_type = 'missed_deadline' AND offset_days = 0)
    ),
    CONSTRAINT ck_reminder_local_time_window CHECK (
        timezone IS NOT NULL
        AND length(btrim(timezone)) > 0
        AND (
            reminder_type = 'missed_deadline'
            OR (
                ((scheduled_for AT TIME ZONE timezone)::time >= TIME '08:00:00')
                AND ((scheduled_for AT TIME ZONE timezone)::time <= TIME '20:00:00')
                AND (
                    reminder_type <> 'morning_of'
                    OR (scheduled_for AT TIME ZONE timezone)::time = TIME '08:00:00'
                )
            )
        )
    ),
    CONSTRAINT ck_reminder_delivery_status CHECK (
        delivery_status IN ('pending', 'sent', 'superseded', 'cancelled_by_completion')
    ),
    CONSTRAINT ck_reminder_sent_timestamp CHECK (
        (delivery_status <> 'sent') OR (sent_at IS NOT NULL)
    )
);

-- ============================================================================
-- 8. BOOKING_DOCUMENT_CHECKLIST
-- Required and conditional export compliance documents per booking.
-- Enforces reviewer attribution on approved/correction_required statuses and
-- a mandatory non-empty correction_reason when status = 'correction_required'.
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_document_checklist (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    booking_id          BIGINT       NOT NULL,
    doc_type            VARCHAR(40)  NOT NULL,
    doc_label           VARCHAR(150) NOT NULL,
    is_mandatory        BOOLEAN      NOT NULL DEFAULT TRUE,
    reference_value     VARCHAR(255),
    status              VARCHAR(30)  NOT NULL DEFAULT 'pending',
    help_text           TEXT,
    reviewed_by_user_id BIGINT,
    reviewed_at         TIMESTAMPTZ,
    correction_reason   TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_booking_document_checklist PRIMARY KEY (id),
    CONSTRAINT uq_booking_doc_checklist_id_booking UNIQUE (id, booking_id),
    CONSTRAINT uq_booking_document_type UNIQUE (booking_id, doc_type),
    CONSTRAINT fk_doc_checklist_booking FOREIGN KEY (booking_id)
        REFERENCES booking (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_doc_checklist_reviewer FOREIGN KEY (reviewed_by_user_id)
        REFERENCES user_account (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT ck_doc_checklist_type CHECK (
        doc_type IN (
            'commercial_invoice',
            'packing_list',
            'iec_code',
            'hs_codes',
            'shipping_bill',
            'certificates',
            'other'
        )
    ),
    CONSTRAINT ck_doc_checklist_status CHECK (
        status IN (
            'pending',
            'uploaded',
            'under_review',
            'approved',
            'correction_required',
            'waived'
        )
    ),
    CONSTRAINT ck_doc_checklist_reviewer_metadata CHECK (
        status NOT IN ('approved', 'correction_required')
        OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT ck_doc_checklist_correction_reason CHECK (
        (status <> 'correction_required')
        OR (correction_reason IS NOT NULL AND length(btrim(correction_reason)) > 0)
    )
);

DROP TRIGGER IF EXISTS trg_booking_document_checklist_updated_at ON booking_document_checklist;
CREATE TRIGGER trg_booking_document_checklist_updated_at
    BEFORE UPDATE ON booking_document_checklist
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================================
-- 9. BOOKING_DOCUMENT_UPLOAD
-- Metadata only for uploaded export documents stored outside the public web root.
-- Uses composite FK (checklist_item_id, booking_id) to guarantee the checklist
-- item belongs to the same booking.
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_document_upload (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    checklist_item_id   BIGINT       NOT NULL,
    booking_id          BIGINT       NOT NULL,
    uploaded_by_user_id BIGINT       NOT NULL,
    original_filename   VARCHAR(255) NOT NULL,
    stored_filename     VARCHAR(255) NOT NULL,
    mime_type           VARCHAR(100) NOT NULL,
    file_size_bytes     BIGINT       NOT NULL,
    sha256_checksum     CHAR(64)     NOT NULL,
    uploaded_at         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_booking_document_upload PRIMARY KEY (id),
    CONSTRAINT uq_booking_document_stored_filename UNIQUE (stored_filename),
    CONSTRAINT fk_doc_upload_checklist_booking FOREIGN KEY (checklist_item_id, booking_id)
        REFERENCES booking_document_checklist (id, booking_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_doc_upload_booking FOREIGN KEY (booking_id)
        REFERENCES booking (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_doc_upload_user FOREIGN KEY (uploaded_by_user_id)
        REFERENCES user_account (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT ck_doc_upload_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
    CONSTRAINT ck_doc_upload_mime CHECK (
        mime_type IN ('application/pdf', 'image/png', 'image/jpeg')
    ),
    CONSTRAINT ck_doc_upload_checksum CHECK (sha256_checksum ~ '^[0-9a-fA-F]{64}$')
);

-- ============================================================================
-- 10. BOOKING_ROLLOVER_EVENT
-- Append-only record of operator missed-cut-off decisions and policy snapshots.
-- Separates:
--   - applicable_policy_snapshot: the listing's configured rollover policy at the
--     time of the event ('roll_next_sailing' = moved to next sailing at same price,
--     'accept_late_with_fee' = re-quoted for next sailing,
--     'cancel_if_missed' = cancellation under stated terms)
--   - operator_decision: the actual operational action recorded by the provider
--     ('accept' late onto current sailing, 'roll' to new sailing dates, or 'cancel')
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_rollover_event (
    id                               BIGINT GENERATED ALWAYS AS IDENTITY,
    booking_id                       BIGINT         NOT NULL,
    listing_id                       BIGINT         NOT NULL,
    missed_milestone_id              BIGINT,
    operator_decision                VARCHAR(20)    NOT NULL,
    applicable_policy_snapshot       VARCHAR(40)    NOT NULL,
    applicable_charge_terms_snapshot TEXT,
    rollover_fee_amount              NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency                         VARCHAR(3)     NOT NULL DEFAULT 'USD',
    timezone                         VARCHAR(64)    NOT NULL DEFAULT 'Asia/Kolkata',
    previous_etd_at                  TIMESTAMPTZ,
    previous_eta_at                  TIMESTAMPTZ,
    new_doc_cutoff_at                TIMESTAMPTZ,
    new_cfs_gate_in_at               TIMESTAMPTZ,
    new_etd_at                       TIMESTAMPTZ,
    new_eta_at                       TIMESTAMPTZ,
    rollover_target_listing_id       BIGINT,
    decision_reason                  TEXT           NOT NULL,
    outcome_notes                    TEXT,
    decided_by_user_id               BIGINT         NOT NULL,
    decided_at                       TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_booking_rollover_event PRIMARY KEY (id),
    CONSTRAINT fk_rollover_booking FOREIGN KEY (booking_id)
        REFERENCES booking (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_rollover_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_rollover_milestone_booking FOREIGN KEY (missed_milestone_id, booking_id)
        REFERENCES booking_milestone (id, booking_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_rollover_target_listing FOREIGN KEY (rollover_target_listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT fk_rollover_decided_by FOREIGN KEY (decided_by_user_id)
        REFERENCES user_account (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT ck_rollover_operator_decision CHECK (
        operator_decision IN ('accept', 'roll', 'cancel')
    ),
    CONSTRAINT ck_rollover_policy_snapshot CHECK (
        applicable_policy_snapshot IN ('roll_next_sailing', 'accept_late_with_fee', 'cancel_if_missed')
    ),
    CONSTRAINT ck_rollover_fee_nonnegative CHECK (rollover_fee_amount >= 0),
    CONSTRAINT ck_rollover_reason_nonempty CHECK (length(btrim(decision_reason)) > 0),
    CONSTRAINT ck_rollover_dates_when_rolled CHECK (
        operator_decision <> 'roll'
        OR (new_etd_at IS NOT NULL AND new_eta_at IS NOT NULL AND new_etd_at < new_eta_at)
    )
);

-- ============================================================================
-- 11. IN_APP_NOTIFICATION
-- Persistent in-app notifications delivered to Shippers, Providers, and Admins,
-- with nullable foreign keys to booking, listing, milestone, reminder,
-- document checklist item, and rollover event.
-- ============================================================================
CREATE TABLE IF NOT EXISTS in_app_notification (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY,
    recipient_user_id     BIGINT       NOT NULL,
    booking_id            BIGINT,
    listing_id            BIGINT,
    booking_milestone_id  BIGINT,
    reminder_id           BIGINT,
    document_checklist_id BIGINT,
    rollover_event_id     BIGINT,
    category              VARCHAR(40)  NOT NULL,
    severity              VARCHAR(20)  NOT NULL DEFAULT 'info',
    title                 VARCHAR(200) NOT NULL,
    message               TEXT         NOT NULL,
    is_read               BOOLEAN      NOT NULL DEFAULT FALSE,
    read_at               TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_in_app_notification PRIMARY KEY (id),
    CONSTRAINT uq_notification_reminder_once UNIQUE (reminder_id),
    CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_user_id)
        REFERENCES user_account (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_notification_booking FOREIGN KEY (booking_id)
        REFERENCES booking (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_notification_listing FOREIGN KEY (listing_id)
        REFERENCES capacity_listing (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_notification_milestone FOREIGN KEY (booking_milestone_id)
        REFERENCES booking_milestone (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_notification_reminder FOREIGN KEY (reminder_id)
        REFERENCES booking_reminder_schedule (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT fk_notification_doc_checklist FOREIGN KEY (document_checklist_id)
        REFERENCES booking_document_checklist (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_notification_rollover_event FOREIGN KEY (rollover_event_id)
        REFERENCES booking_rollover_event (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT ck_notification_category CHECK (
        category IN (
            'reminder',
            'missed_deadline',
            'date_change',
            'document_review',
            'rollover_decision',
            'booking_status'
        )
    ),
    CONSTRAINT ck_notification_severity CHECK (
        severity IN ('info', 'warning', 'urgent')
    )
);

-- ============================================================================
-- 12. IMMUTABILITY, DATE-CHANGE AUDITING & REMINDER LIFECYCLE TRIGGERS
-- ============================================================================

-- 12.1 Enforce initial snapshot equality (original_due_at = current_due_at) on INSERT
--      and protect frozen original_due_at and identity columns on UPDATE/DELETE.
CREATE OR REPLACE FUNCTION fn_protect_booking_milestone_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.original_due_at <> NEW.current_due_at THEN
            RAISE EXCEPTION 'New booking_milestone must start with original_due_at = current_due_at (booking_id: %, code: %)',
                NEW.booking_id, NEW.milestone_code;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'booking_milestone is a permanent booking timeline record and cannot be deleted (id: %)', OLD.id;
    END IF;

    IF NEW.booking_id <> OLD.booking_id OR NEW.listing_id <> OLD.listing_id THEN
        RAISE EXCEPTION 'Cannot modify booking_id or listing_id on booking_milestone (id: %)', OLD.id;
    END IF;

    IF NEW.milestone_code <> OLD.milestone_code THEN
        RAISE EXCEPTION 'Cannot modify milestone_code on booking_milestone (id: %)', OLD.id;
    END IF;

    IF NEW.original_due_at <> OLD.original_due_at THEN
        RAISE EXCEPTION 'original_due_at on booking_milestone is an immutable booking snapshot and cannot be modified (id: %)', OLD.id;
    END IF;

    IF NEW.snapshot_time <> OLD.snapshot_time THEN
        RAISE EXCEPTION 'snapshot_time on booking_milestone cannot be modified (id: %)', OLD.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_booking_milestone_snapshot ON booking_milestone;
CREATE TRIGGER trg_protect_booking_milestone_snapshot
    BEFORE INSERT OR UPDATE OR DELETE ON booking_milestone
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_booking_milestone_snapshot();

-- 12.2 Automatically audit booking_milestone due-date changes (requiring
--      shipspace.current_user_id and shipspace.date_change_reason) and
--      synchronize pending reminders on completion, waiver, or deadline change.
CREATE OR REPLACE FUNCTION fn_audit_and_sync_booking_milestone_change()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id BIGINT;
    v_reason   TEXT;
BEGIN
    -- 1. If current_due_at changed, require actor + reason and write append-only history
    IF NEW.current_due_at IS DISTINCT FROM OLD.current_due_at THEN
        v_actor_id := NULLIF(btrim(current_setting('shipspace.current_user_id', true)), '')::BIGINT;
        v_reason   := NULLIF(btrim(current_setting('shipspace.date_change_reason', true)), '');

        IF v_actor_id IS NULL THEN
            RAISE EXCEPTION 'Date change on booking_milestone (id: %) requires a valid user ID in session setting shipspace.current_user_id', NEW.id;
        END IF;

        IF v_reason IS NULL THEN
            RAISE EXCEPTION 'Date change on booking_milestone (id: %) requires a non-empty reason in session setting shipspace.date_change_reason', NEW.id;
        END IF;

        INSERT INTO booking_date_change_history (
            booking_id,
            booking_milestone_id,
            milestone_code,
            old_due_at,
            new_due_at,
            timezone,
            reason,
            changed_by_user_id,
            changed_at
        ) VALUES (
            NEW.booking_id,
            NEW.id,
            NEW.milestone_code,
            OLD.current_due_at,
            NEW.current_due_at,
            NEW.timezone,
            v_reason,
            v_actor_id,
            CURRENT_TIMESTAMP
        );

        -- Supersede pending reminders tied to older deadline versions so the backend
        -- can schedule replacement reminders for NEW.current_due_at.
        UPDATE booking_reminder_schedule
        SET delivery_status = 'superseded'
        WHERE booking_milestone_id = NEW.id
          AND booking_id = NEW.booking_id
          AND delivery_status = 'pending'
          AND milestone_due_version <> NEW.current_due_at;
    END IF;

    -- 2. On completion or waiver (but NOT 'rolled', which remains an active rescheduled
    --    obligation for the new sailing), cancel any remaining pending reminders.
    IF NEW.status IN ('completed', 'waived') AND OLD.status NOT IN ('completed', 'waived') THEN
        UPDATE booking_reminder_schedule
        SET delivery_status = 'cancelled_by_completion'
        WHERE booking_milestone_id = NEW.id
          AND booking_id = NEW.booking_id
          AND delivery_status = 'pending';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_and_sync_booking_milestone_change ON booking_milestone;
CREATE TRIGGER trg_audit_and_sync_booking_milestone_change
    AFTER UPDATE ON booking_milestone
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_and_sync_booking_milestone_change();

-- 12.3 Automatically audit listing_schedule_policy deadline changes (requiring
--      shipspace.current_user_id and shipspace.date_change_reason).
CREATE OR REPLACE FUNCTION fn_audit_listing_schedule_policy_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id BIGINT;
    v_reason   TEXT;
BEGIN
    IF NEW.doc_cutoff_at IS DISTINCT FROM OLD.doc_cutoff_at
       OR NEW.cfs_gate_in_at IS DISTINCT FROM OLD.cfs_gate_in_at
       OR NEW.etd_at IS DISTINCT FROM OLD.etd_at
       OR NEW.eta_at IS DISTINCT FROM OLD.eta_at
    THEN
        v_actor_id := NULLIF(btrim(current_setting('shipspace.current_user_id', true)), '')::BIGINT;
        v_reason   := NULLIF(btrim(current_setting('shipspace.date_change_reason', true)), '');

        IF v_actor_id IS NULL THEN
            RAISE EXCEPTION 'Deadline change on listing_schedule_policy (listing_id: %) requires a valid user ID in session setting shipspace.current_user_id', NEW.listing_id;
        END IF;

        IF v_reason IS NULL THEN
            RAISE EXCEPTION 'Deadline change on listing_schedule_policy (listing_id: %) requires a non-empty reason in session setting shipspace.date_change_reason', NEW.listing_id;
        END IF;

        IF NEW.doc_cutoff_at IS DISTINCT FROM OLD.doc_cutoff_at THEN
            INSERT INTO listing_date_change_history (
                listing_id, field_name, old_due_at, new_due_at, timezone, reason, changed_by_user_id, changed_at
            ) VALUES (
                NEW.listing_id, 'doc_cutoff_at', OLD.doc_cutoff_at, NEW.doc_cutoff_at, NEW.port_timezone, v_reason, v_actor_id, CURRENT_TIMESTAMP
            );
        END IF;

        IF NEW.cfs_gate_in_at IS DISTINCT FROM OLD.cfs_gate_in_at THEN
            INSERT INTO listing_date_change_history (
                listing_id, field_name, old_due_at, new_due_at, timezone, reason, changed_by_user_id, changed_at
            ) VALUES (
                NEW.listing_id, 'cfs_gate_in_at', OLD.cfs_gate_in_at, NEW.cfs_gate_in_at, NEW.port_timezone, v_reason, v_actor_id, CURRENT_TIMESTAMP
            );
        END IF;

        IF NEW.etd_at IS DISTINCT FROM OLD.etd_at THEN
            INSERT INTO listing_date_change_history (
                listing_id, field_name, old_due_at, new_due_at, timezone, reason, changed_by_user_id, changed_at
            ) VALUES (
                NEW.listing_id, 'etd_at', OLD.etd_at, NEW.etd_at, NEW.port_timezone, v_reason, v_actor_id, CURRENT_TIMESTAMP
            );
        END IF;

        IF NEW.eta_at IS DISTINCT FROM OLD.eta_at THEN
            INSERT INTO listing_date_change_history (
                listing_id, field_name, old_due_at, new_due_at, timezone, reason, changed_by_user_id, changed_at
            ) VALUES (
                NEW.listing_id, 'eta_at', OLD.eta_at, NEW.eta_at, NEW.port_timezone, v_reason, v_actor_id, CURRENT_TIMESTAMP
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_listing_schedule_policy_changes ON listing_schedule_policy;
CREATE TRIGGER trg_audit_listing_schedule_policy_changes
    AFTER UPDATE ON listing_schedule_policy
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_listing_schedule_policy_changes();

-- 12.4 Enforce append-only immutability on date-change history & rollover logs
CREATE OR REPLACE FUNCTION fn_prevent_feature_b_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is an append-only audit record and cannot be modified or deleted (id: %)', TG_TABLE_NAME, OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_listing_date_change_history ON listing_date_change_history;
CREATE TRIGGER trg_protect_listing_date_change_history
    BEFORE UPDATE OR DELETE ON listing_date_change_history
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_feature_b_audit_modification();

DROP TRIGGER IF EXISTS trg_protect_booking_date_change_history ON booking_date_change_history;
CREATE TRIGGER trg_protect_booking_date_change_history
    BEFORE UPDATE OR DELETE ON booking_date_change_history
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_feature_b_audit_modification();

DROP TRIGGER IF EXISTS trg_protect_booking_rollover_event ON booking_rollover_event;
CREATE TRIGGER trg_protect_booking_rollover_event
    BEFORE UPDATE OR DELETE ON booking_rollover_event
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_feature_b_audit_modification();

-- ============================================================================
-- 13. INDEXES
-- Optimize timeline queries, reminder polling, notification feeds, and document lookups.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_listing_milestone_template_listing
    ON listing_milestone_template (listing_id, display_order);

CREATE INDEX IF NOT EXISTS idx_listing_date_change_history_listing
    ON listing_date_change_history (listing_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_milestone_booking
    ON booking_milestone (booking_id, display_order);

CREATE INDEX IF NOT EXISTS idx_booking_milestone_due_status
    ON booking_milestone (current_due_at, status)
    WHERE status IN ('pending', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_booking_date_change_history_booking
    ON booking_date_change_history (booking_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_reminder_schedule_due_pending
    ON booking_reminder_schedule (scheduled_for, delivery_status)
    WHERE delivery_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_booking_reminder_schedule_booking
    ON booking_reminder_schedule (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_doc_checklist_booking
    ON booking_document_checklist (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_doc_upload_booking
    ON booking_document_upload (booking_id, checklist_item_id);

CREATE INDEX IF NOT EXISTS idx_booking_rollover_event_booking
    ON booking_rollover_event (booking_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_rollover_event_listing
    ON booking_rollover_event (listing_id);

CREATE INDEX IF NOT EXISTS idx_in_app_notification_recipient_unread
    ON in_app_notification (recipient_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notification_booking
    ON in_app_notification (booking_id);

CREATE INDEX IF NOT EXISTS idx_in_app_notification_listing
    ON in_app_notification (listing_id);

CREATE INDEX IF NOT EXISTS idx_in_app_notification_milestone
    ON in_app_notification (booking_milestone_id);

CREATE INDEX IF NOT EXISTS idx_in_app_notification_doc_checklist
    ON in_app_notification (document_checklist_id);

CREATE INDEX IF NOT EXISTS idx_in_app_notification_rollover_event
    ON in_app_notification (rollover_event_id);

COMMIT;
