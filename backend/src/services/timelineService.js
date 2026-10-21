const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../config/db");
const { AppError } = require("../middleware/errorHandler");

const VALID_ROLLOVER_POLICIES = [
    "roll_next_sailing",
    "accept_late_with_fee",
    "cancel_if_missed",
];

const VALID_MILESTONE_OWNERS = [
    "shipper",
    "provider",
    "customs",
    "terminal",
    "consignee",
];

const VALID_MILESTONE_STATUSES = [
    "pending",
    "in_progress",
    "completed",
    "missed",
    "waived",
    "rolled",
];

const VALID_DOC_TYPES = [
    "commercial_invoice",
    "packing_list",
    "iec_code",
    "hs_codes",
    "shipping_bill",
    "certificates",
    "other",
];

const VALID_DOC_STATUSES = [
    "pending",
    "uploaded",
    "under_review",
    "approved",
    "correction_required",
    "waived",
];

const VALID_UPLOAD_MIMES = [
    "application/pdf",
    "image/png",
    "image/jpeg",
];

const VALID_OPERATOR_DECISIONS = ["accept", "roll", "cancel"];

const DEFAULT_DOCUMENT_CHECKLIST_TEMPLATES = [
    {
        doc_type: "commercial_invoice",
        doc_label: "Commercial Invoice",
        is_mandatory: true,
        help_text: "Signed commercial invoice showing invoice number, buyer/seller details, currency, and HS classification.",
    },
    {
        doc_type: "packing_list",
        doc_label: "Packing List",
        is_mandatory: true,
        help_text: "Detailed package count, gross/net weight, and CBM dimensions matching the LCL booking.",
    },
    {
        doc_type: "iec_code",
        doc_label: "Importer Exporter Code (IEC)",
        is_mandatory: true,
        help_text: "10-digit DGFT Importer Exporter Code reference or certificate.",
    },
    {
        doc_type: "hs_codes",
        doc_label: "HS / ITC-HS Commodity Codes",
        is_mandatory: true,
        help_text: "6-to-8 digit Harmonized System commodity codes for all stuffed cargo items.",
    },
    {
        doc_type: "shipping_bill",
        doc_label: "Shipping Bill / Export Declaration",
        is_mandatory: true,
        help_text: "ICEGATE Shipping Bill number and date required prior to Let Export Order (LEO).",
    },
    {
        doc_type: "certificates",
        doc_label: "Certificate of Origin / Inspection Certificates",
        is_mandatory: false,
        help_text: "Optional Certificate of Origin, fumigation, or phytosanitary certificates if required by destination.",
    },
];

const PRIVATE_UPLOAD_DIR = path.resolve(
    __dirname,
    "../../private_uploads/booking_documents"
);

function ensureUploadDirExists() {
    if (!fs.existsSync(PRIVATE_UPLOAD_DIR)) {
        fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
    }
}

function parseTimestampInput(value, fieldName, { required = true } = {}) {
    if (value === undefined || value === null || String(value).trim() === "") {
        if (!required) return null;
        throw new AppError(`${fieldName} is required`, 400, "VALIDATION_ERROR");
    }
    const str = String(value).trim();
    const d = new Date(str);
    if (Number.isNaN(d.getTime())) {
        throw new AppError(
            `${fieldName} must be a valid ISO timestamp`,
            400,
            "VALIDATION_ERROR"
        );
    }
    return d.toISOString();
}

function parseNonEmptyText(value, fieldName) {
    if (value === undefined || value === null || String(value).trim() === "") {
        throw new AppError(`${fieldName} is required and cannot be empty`, 400, "VALIDATION_ERROR");
    }
    return String(value).trim();
}

/**
 * Formats a Date into local components in a target IANA timezone using Intl.DateTimeFormat,
 * then constructs a timestamp in that timezone clamped to [08:00, 20:00] local time
 * (or exactly 08:00:00 local time when forceMorning8am = true).
 */
function computeScheduledReminderTimestamp(dueAtIso, offsetDays, timezone = "Asia/Kolkata", { forceMorning8am = false } = {}) {
    const dueDate = new Date(dueAtIso);
    const targetApprox = new Date(dueDate.getTime() - offsetDays * 24 * 60 * 60 * 1000);

    const tz = timezone || "Asia/Kolkata";
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    });

    const parts = {};
    for (const part of formatter.formatToParts(targetApprox)) {
        if (part.type !== "literal") {
            parts[part.type] = part.value;
        }
    }

    let hour = Number(parts.hour);
    let minute = Number(parts.minute);
    let second = Number(parts.second);

    if (forceMorning8am) {
        hour = 8;
        minute = 0;
        second = 0;
    } else if (hour < 8) {
        hour = 8;
        minute = 0;
        second = 0;
    } else if (hour > 20 || (hour === 20 && (minute > 0 || second > 0))) {
        hour = 20;
        minute = 0;
        second = 0;
    }

    // Determine UTC offset of `tz` at targetApprox
    const utcDate = new Date(
        Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour),
            Number(parts.minute),
            Number(parts.second)
        )
    );
    const offsetMs = utcDate.getTime() - targetApprox.getTime();
    const desiredLocalAsUtcMs = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        hour,
        minute,
        second
    );
    return new Date(desiredLocalAsUtcMs - offsetMs).toISOString();
}

/**
 * 1. Standard Milestone Types Catalogue
 */
async function getStandardMilestoneTypes(clientOrPool = pool) {
    const { rows } = await clientOrPool.query(
        `SELECT
            id,
            code,
            name,
            default_owner,
            is_mandatory,
            default_display_order,
            default_help_text,
            created_at
         FROM standard_milestone_type
         ORDER BY default_display_order ASC, id ASC`
    );
    return rows;
}

/**
 * Helper to build default milestone templates from a listing's schedule policy
 */
async function buildDefaultMilestoneTemplates(clientOrPool, schedulePolicy) {
    const stdTypes = await getStandardMilestoneTypes(clientOrPool);
    const tz = schedulePolicy.port_timezone || "Asia/Kolkata";
    const etdMs = new Date(schedulePolicy.etd_at).getTime();
    const etaMs = new Date(schedulePolicy.eta_at).getTime();
    const docCutoffMs = new Date(schedulePolicy.doc_cutoff_at).getTime();
    const cfsGateInMs = new Date(schedulePolicy.cfs_gate_in_at).getTime();
    const leadDays = Number(schedulePolicy.min_lead_time_days ?? 3);

    const bookingCutoffMs = Math.min(
        docCutoffMs,
        cfsGateInMs,
        etdMs - leadDays * 24 * 60 * 60 * 1000
    );
    const customsClearanceMs = Math.min(
        etdMs,
        Math.max(docCutoffMs, cfsGateInMs) + 4 * 60 * 60 * 1000
    );
    const cargoDeliveryMs = etaMs + 24 * 60 * 60 * 1000;

    const dueMap = {
        booking_cutoff: new Date(bookingCutoffMs).toISOString(),
        doc_cutoff: new Date(docCutoffMs).toISOString(),
        cfs_gate_in: new Date(cfsGateInMs).toISOString(),
        customs_clearance: new Date(customsClearanceMs).toISOString(),
        etd: new Date(etdMs).toISOString(),
        eta: new Date(etaMs).toISOString(),
        cargo_delivery: new Date(cargoDeliveryMs).toISOString(),
    };

    return stdTypes.map((st) => ({
        milestone_type_id: st.id,
        milestone_code: st.code,
        milestone_name: st.name,
        owner_role: st.default_owner,
        due_at: dueMap[st.code] || schedulePolicy.etd_at,
        timezone: tz,
        is_required: st.is_mandatory,
        help_text: st.default_help_text,
        display_order: st.default_display_order,
    }));
}

/**
 * 2. Get Listing Schedule Policy, Milestone Templates & Date-Change History
 */
async function getListingSchedule(listingId, { providerId = null, client = null } = {}) {
    const db = client || pool;
    const listRes = await db.query(
        `SELECT id, provider_id, cutoff_date, departure_date, arrival_date, status
         FROM capacity_listing
         WHERE id = $1`,
        [listingId]
    );
    if (listRes.rowCount === 0) {
        throw new AppError(`Listing ID ${listingId} does not exist`, 404, "LISTING_NOT_FOUND");
    }
    const listing = listRes.rows[0];

    if (providerId !== null && providerId !== undefined) {
        if (Number(listing.provider_id) !== Number(providerId)) {
            throw new AppError(
                `Forbidden (Rule R8): Listing ID ${listingId} does not belong to Provider ID ${providerId}`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }
    }

    const policyRes = await db.query(
        `SELECT * FROM listing_schedule_policy WHERE listing_id = $1`,
        [listingId]
    );
    const templatesRes = await db.query(
        `SELECT * FROM listing_milestone_template
         WHERE listing_id = $1
         ORDER BY display_order ASC, id ASC`,
        [listingId]
    );
    const historyRes = await db.query(
        `SELECT
            h.*,
            u.name AS changed_by_name,
            u.email AS changed_by_email,
            u.role AS changed_by_role
         FROM listing_date_change_history h
         JOIN user_account u ON u.id = h.changed_by_user_id
         WHERE h.listing_id = $1
         ORDER BY h.changed_at DESC, h.id DESC`,
        [listingId]
    );
    const catalogue = await getStandardMilestoneTypes(db);

    const hasSchedulePolicy = policyRes.rowCount > 0;
    const schedulePolicy = hasSchedulePolicy ? policyRes.rows[0] : null;

    return {
        listing_id: Number(listing.id),
        provider_id: Number(listing.provider_id),
        listing_dates: {
            cutoff_date: listing.cutoff_date,
            departure_date: listing.departure_date,
            arrival_date: listing.arrival_date,
            status: listing.status,
        },
        has_schedule_policy: hasSchedulePolicy,
        is_legacy_listing: !hasSchedulePolicy,
        schedule_policy: schedulePolicy,
        milestone_templates: templatesRes.rows,
        date_change_history: historyRes.rows,
        standard_milestone_catalogue: catalogue,
    };
}

/**
 * 3. Upsert Listing Schedule Policy & Milestone Templates (with Audited Date Changes)
 */
async function upsertListingSchedule({
    listingId,
    providerId,
    schedulePolicy,
    milestoneTemplates = null,
    reason = null,
}) {
    if (!schedulePolicy || typeof schedulePolicy !== "object") {
        throw new AppError("schedule_policy object is required", 400, "VALIDATION_ERROR");
    }

    const portTimezone = String(schedulePolicy.port_timezone || "Asia/Kolkata").trim();
    if (!portTimezone) {
        throw new AppError("port_timezone cannot be empty", 400, "VALIDATION_ERROR");
    }

    const docCutoffAt = parseTimestampInput(schedulePolicy.doc_cutoff_at, "doc_cutoff_at");
    const cfsGateInAt = parseTimestampInput(schedulePolicy.cfs_gate_in_at, "cfs_gate_in_at");
    const etdAt = parseTimestampInput(schedulePolicy.etd_at, "etd_at");
    const etaAt = parseTimestampInput(schedulePolicy.eta_at, "eta_at");
    const cfsName = parseNonEmptyText(schedulePolicy.cfs_name, "cfs_name");
    const cfsAddress = parseNonEmptyText(schedulePolicy.cfs_address, "cfs_address");

    const minLeadTimeDays =
        schedulePolicy.min_lead_time_days !== undefined &&
        schedulePolicy.min_lead_time_days !== null &&
        schedulePolicy.min_lead_time_days !== ""
            ? Number(schedulePolicy.min_lead_time_days)
            : 3;

    if (!Number.isInteger(minLeadTimeDays) || minLeadTimeDays < 0 || minLeadTimeDays > 60) {
        throw new AppError(
            "min_lead_time_days must be an integer between 0 and 60",
            400,
            "VALIDATION_ERROR"
        );
    }

    const rolloverPolicy = String(schedulePolicy.rollover_policy || "").trim();
    if (!VALID_ROLLOVER_POLICIES.includes(rolloverPolicy)) {
        throw new AppError(
            `rollover_policy must be one of: ${VALID_ROLLOVER_POLICIES.join(", ")}`,
            400,
            "VALIDATION_ERROR"
        );
    }

    const rolloverChargeTerms =
        schedulePolicy.rollover_charge_terms !== undefined &&
        schedulePolicy.rollover_charge_terms !== null
            ? String(schedulePolicy.rollover_charge_terms).trim()
            : null;

    if (new Date(docCutoffAt) > new Date(etdAt)) {
        throw new AppError("doc_cutoff_at must be on or before etd_at", 400, "VALIDATION_ERROR");
    }
    if (new Date(cfsGateInAt) > new Date(etdAt)) {
        throw new AppError("cfs_gate_in_at must be on or before etd_at", 400, "VALIDATION_ERROR");
    }
    if (new Date(etdAt) >= new Date(etaAt)) {
        throw new AppError("etd_at must be strictly before eta_at", 400, "VALIDATION_ERROR");
    }

    return pool.withTransaction(async (client) => {
        const listRes = await client.query(
            `SELECT id, provider_id FROM capacity_listing WHERE id = $1 FOR UPDATE`,
            [listingId]
        );
        if (listRes.rowCount === 0) {
            throw new AppError(`Listing ID ${listingId} does not exist`, 404, "LISTING_NOT_FOUND");
        }
        if (Number(listRes.rows[0].provider_id) !== Number(providerId)) {
            throw new AppError(
                `Forbidden (Rule R8): Listing ID ${listingId} does not belong to Provider ID ${providerId}`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }

        const existingRes = await client.query(
            `SELECT * FROM listing_schedule_policy WHERE listing_id = $1 FOR UPDATE`,
            [listingId]
        );

        if (existingRes.rowCount === 0) {
            await client.query(
                `INSERT INTO listing_schedule_policy (
                    listing_id,
                    port_timezone,
                    doc_cutoff_at,
                    cfs_gate_in_at,
                    cfs_name,
                    cfs_address,
                    etd_at,
                    eta_at,
                    min_lead_time_days,
                    rollover_policy,
                    rollover_charge_terms
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    listingId,
                    portTimezone,
                    docCutoffAt,
                    cfsGateInAt,
                    cfsName,
                    cfsAddress,
                    etdAt,
                    etaAt,
                    minLeadTimeDays,
                    rolloverPolicy,
                    rolloverChargeTerms,
                ]
            );
        } else {
            const oldRow = existingRes.rows[0];
            const datesChanged =
                new Date(oldRow.doc_cutoff_at).getTime() !== new Date(docCutoffAt).getTime() ||
                new Date(oldRow.cfs_gate_in_at).getTime() !== new Date(cfsGateInAt).getTime() ||
                new Date(oldRow.etd_at).getTime() !== new Date(etdAt).getTime() ||
                new Date(oldRow.eta_at).getTime() !== new Date(etaAt).getTime();

            if (datesChanged) {
                const cleanReason =
                    reason ?? schedulePolicy.reason ?? schedulePolicy.date_change_reason;
                if (!cleanReason || String(cleanReason).trim() === "") {
                    throw new AppError(
                        "A non-empty reason is required when modifying listing schedule deadlines",
                        400,
                        "DATE_CHANGE_REASON_REQUIRED"
                    );
                }
                await client.query(
                    `SELECT
                        set_config('shipspace.current_user_id', $1, true),
                        set_config('shipspace.date_change_reason', $2, true)`,
                    [String(providerId), String(cleanReason).trim()]
                );
            }

            await client.query(
                `UPDATE listing_schedule_policy
                 SET port_timezone = $2,
                     doc_cutoff_at = $3,
                     cfs_gate_in_at = $4,
                     cfs_name = $5,
                     cfs_address = $6,
                     etd_at = $7,
                     eta_at = $8,
                     min_lead_time_days = $9,
                     rollover_policy = $10,
                     rollover_charge_terms = $11
                 WHERE listing_id = $1`,
                [
                    listingId,
                    portTimezone,
                    docCutoffAt,
                    cfsGateInAt,
                    cfsName,
                    cfsAddress,
                    etdAt,
                    etaAt,
                    minLeadTimeDays,
                    rolloverPolicy,
                    rolloverChargeTerms,
                ]
            );
        }

        const effectiveTemplates =
            Array.isArray(milestoneTemplates) && milestoneTemplates.length > 0
                ? milestoneTemplates
                : await buildDefaultMilestoneTemplates(client, {
                      port_timezone: portTimezone,
                      doc_cutoff_at: docCutoffAt,
                      cfs_gate_in_at: cfsGateInAt,
                      etd_at: etdAt,
                      eta_at: etaAt,
                      min_lead_time_days: minLeadTimeDays,
                  });

        const stdTypes = await getStandardMilestoneTypes(client);
        const stdByCode = new Map(stdTypes.map((t) => [t.code, t]));

        await client.query(`DELETE FROM listing_milestone_template WHERE listing_id = $1`, [
            listingId,
        ]);

        for (let i = 0; i < effectiveTemplates.length; i += 1) {
            const item = effectiveTemplates[i];
            const code = parseNonEmptyText(
                item.milestone_code ?? item.code,
                `milestone_templates[${i}].milestone_code`
            );
            const std = stdByCode.get(code) || null;
            const name = String(
                item.milestone_name ?? item.name ?? std?.name ?? code
            ).trim();
            const ownerRole = String(
                item.owner_role ?? std?.default_owner ?? "shipper"
            )
                .trim()
                .toLowerCase();
            if (!VALID_MILESTONE_OWNERS.includes(ownerRole)) {
                throw new AppError(
                    `Invalid owner_role "${ownerRole}" in milestone template "${code}"`,
                    400,
                    "VALIDATION_ERROR"
                );
            }
            const dueAt = parseTimestampInput(
                item.due_at,
                `milestone_templates[${i}].due_at`
            );
            const tz = String(item.timezone || portTimezone).trim();
            const isRequired =
                item.is_required !== undefined
                    ? Boolean(item.is_required)
                    : std
                      ? Boolean(std.is_mandatory)
                      : true;
            const helpText =
                item.help_text !== undefined && item.help_text !== null
                    ? String(item.help_text).trim()
                    : std?.default_help_text || null;
            const displayOrder =
                item.display_order !== undefined && item.display_order !== null
                    ? Number(item.display_order)
                    : std?.default_display_order ?? (i + 1) * 10;

            await client.query(
                `INSERT INTO listing_milestone_template (
                    listing_id,
                    milestone_type_id,
                    milestone_code,
                    milestone_name,
                    owner_role,
                    due_at,
                    timezone,
                    is_required,
                    help_text,
                    display_order
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    listingId,
                    std?.id ?? item.milestone_type_id ?? null,
                    code,
                    name,
                    ownerRole,
                    dueAt,
                    tz,
                    isRequired,
                    helpText,
                    displayOrder,
                ]
            );
        }

        return getListingSchedule(listingId, { providerId, client });
    });
}

/**
 * Helper: Schedule standard reminders (5d, 2d, 1d, morning_of at 08:00 local) for a booking milestone
 */
async function scheduleRemindersForMilestone(client, { milestone, recipientUserId }) {
    if (!milestone || !recipientUserId) return [];
    const dueIso = new Date(milestone.current_due_at).toISOString();
    const tz = milestone.timezone || "Asia/Kolkata";

    const specs = [
        { reminder_type: "offset_5d", offset_days: 5, forceMorning8am: false },
        { reminder_type: "offset_2d", offset_days: 2, forceMorning8am: false },
        { reminder_type: "offset_1d", offset_days: 1, forceMorning8am: false },
        { reminder_type: "morning_of", offset_days: 0, forceMorning8am: true },
    ];

    const inserted = [];
    for (const spec of specs) {
        const scheduledFor = computeScheduledReminderTimestamp(
            dueIso,
            spec.offset_days,
            tz,
            { forceMorning8am: spec.forceMorning8am }
        );

        const res = await client.query(
            `INSERT INTO booking_reminder_schedule (
                booking_id,
                booking_milestone_id,
                recipient_user_id,
                reminder_type,
                offset_days,
                timezone,
                milestone_due_version,
                scheduled_for,
                delivery_status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
             ON CONFLICT (booking_milestone_id, recipient_user_id, reminder_type, milestone_due_version)
             DO NOTHING
             RETURNING *`,
            [
                milestone.booking_id,
                milestone.id,
                recipientUserId,
                spec.reminder_type,
                spec.offset_days,
                tz,
                dueIso,
                scheduledFor,
            ]
        );
        if (res.rowCount > 0) {
            inserted.push(res.rows[0]);
        }
    }
    return inserted;
}

/**
 * 4. Initialize Feature B Snapshots During Atomic Booking Creation
 *    - Enforces min_lead_time_days when listing_schedule_policy is configured
 *    - Freezes booking_milestone rows with original_due_at = current_due_at
 *    - Schedules 5d, 2d, 1d, and 8 AM morning_of reminders in booking_reminder_schedule
 *    - Seeds standard export compliance documents in booking_document_checklist
 *    - Preserves legacy compatibility if listing has no listing_schedule_policy
 */
async function initializeBookingFeatureBSnapshots(
    client,
    { bookingId, listingId, traderId, asOfTimestamp = null }
) {
    const policyRes = await client.query(
        `SELECT * FROM listing_schedule_policy WHERE listing_id = $1`,
        [listingId]
    );

    if (policyRes.rowCount === 0) {
        // Legacy listing without Feature B schedule policy: do not fabricate milestones
        return {
            has_timeline_snapshot: false,
            milestones: [],
            document_checklist: [],
            reminders: [],
        };
    }

    const policy = policyRes.rows[0];
    const nowMs = asOfTimestamp ? new Date(asOfTimestamp).getTime() : Date.now();
    const etdMs = new Date(policy.etd_at).getTime();
    const minLeadDays = Number(policy.min_lead_time_days ?? 3);
    const latestBookingAllowedMs = etdMs - minLeadDays * 24 * 60 * 60 * 1000;

    if (minLeadDays > 0 && nowMs > latestBookingAllowedMs) {
        throw new AppError(
            `Booking violates the listing's minimum lead time of ${minLeadDays} day(s) prior to ETD (${new Date(policy.etd_at).toISOString()})`,
            409,
            "MIN_LEAD_TIME_VIOLATION"
        );
    }

    const templatesRes = await client.query(
        `SELECT * FROM listing_milestone_template
         WHERE listing_id = $1
         ORDER BY display_order ASC, id ASC`,
        [listingId]
    );

    const templates =
        templatesRes.rowCount > 0
            ? templatesRes.rows
            : await buildDefaultMilestoneTemplates(client, policy);

    const createdMilestones = [];
    const createdReminders = [];

    for (const tpl of templates) {
        const isBookingCutoff = tpl.milestone_code === "booking_cutoff";
        const initialStatus = isBookingCutoff ? "completed" : "pending";
        const completedBy = isBookingCutoff ? traderId : null;
        const completedAt = isBookingCutoff ? new Date(nowMs).toISOString() : null;
        const completionNote = isBookingCutoff
            ? "Automatically completed upon booking confirmation"
            : null;

        const mRes = await client.query(
            `INSERT INTO booking_milestone (
                booking_id,
                listing_id,
                milestone_code,
                milestone_name,
                owner_role,
                original_due_at,
                current_due_at,
                timezone,
                is_required,
                help_text,
                status,
                completed_by_user_id,
                completed_at,
                completion_note,
                display_order
             ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING *`,
            [
                bookingId,
                listingId,
                tpl.milestone_code,
                tpl.milestone_name,
                tpl.owner_role || "shipper",
                tpl.due_at,
                tpl.timezone || policy.port_timezone || "Asia/Kolkata",
                tpl.is_required !== undefined ? Boolean(tpl.is_required) : true,
                tpl.help_text || null,
                initialStatus,
                completedBy,
                completedAt,
                completionNote,
                tpl.display_order ?? 0,
            ]
        );
        const milestone = mRes.rows[0];
        createdMilestones.push(milestone);

        if (milestone.status === "pending" && milestone.owner_role === "shipper") {
            const rem = await scheduleRemindersForMilestone(client, {
                milestone,
                recipientUserId: traderId,
            });
            createdReminders.push(...rem);
        }
    }

    const createdChecklist = [];
    for (const docTpl of DEFAULT_DOCUMENT_CHECKLIST_TEMPLATES) {
        const cRes = await client.query(
            `INSERT INTO booking_document_checklist (
                booking_id,
                doc_type,
                doc_label,
                is_mandatory,
                status,
                help_text
             ) VALUES ($1, $2, $3, $4, 'pending', $5)
             ON CONFLICT (booking_id, doc_type) DO NOTHING
             RETURNING *`,
            [
                bookingId,
                docTpl.doc_type,
                docTpl.doc_label,
                docTpl.is_mandatory,
                docTpl.help_text,
            ]
        );
        if (cRes.rowCount > 0) {
            createdChecklist.push(cRes.rows[0]);
        }
    }

    return {
        has_timeline_snapshot: createdMilestones.length > 0,
        schedule_policy: policy,
        milestones: createdMilestones,
        document_checklist: createdChecklist,
        reminders: createdReminders,
    };
}

/**
 * 5. Fetch Complete Booking Timeline, Document Checklist, Reminders & Rollover History
 */
async function getBookingTimeline(
    bookingId,
    { traderId = null, providerId = null, client = null } = {}
) {
    const db = client || pool;

    const bkRes = await db.query(
        `SELECT b.id AS booking_id, b.trader_id, b.listing_id, b.status AS booking_status,
                l.provider_id, l.cutoff_date, l.departure_date, l.arrival_date
         FROM booking b
         JOIN capacity_listing l ON l.id = b.listing_id
         WHERE b.id = $1`,
        [bookingId]
    );
    if (bkRes.rowCount === 0) {
        throw new AppError(`Booking ID ${bookingId} does not exist`, 404, "BOOKING_NOT_FOUND");
    }
    const bk = bkRes.rows[0];

    if (traderId !== null && traderId !== undefined && Number(bk.trader_id) !== Number(traderId)) {
        throw new AppError(
            `Forbidden (Rule R8): Booking ID ${bookingId} does not belong to Trader ID ${traderId}`,
            403,
            "FORBIDDEN_OWNERSHIP"
        );
    }
    if (
        providerId !== null &&
        providerId !== undefined &&
        Number(bk.provider_id) !== Number(providerId)
    ) {
        throw new AppError(
            `Forbidden (Rule R8): Booking ID ${bookingId} is not on a listing owned by Provider ID ${providerId}`,
            403,
            "FORBIDDEN_OWNERSHIP"
        );
    }

    const policyRes = await db.query(
        `SELECT * FROM listing_schedule_policy WHERE listing_id = $1`,
        [bk.listing_id]
    );
    const milestonesRes = await db.query(
        `SELECT
            m.*,
            u.name AS completed_by_name,
            u.role AS completed_by_role
         FROM booking_milestone m
         LEFT JOIN user_account u ON u.id = m.completed_by_user_id
         WHERE m.booking_id = $1
         ORDER BY m.display_order ASC, m.id ASC`,
        [bookingId]
    );
    const dateHistRes = await db.query(
        `SELECT
            h.*,
            u.name AS changed_by_name,
            u.email AS changed_by_email,
            u.role AS changed_by_role
         FROM booking_date_change_history h
         JOIN user_account u ON u.id = h.changed_by_user_id
         WHERE h.booking_id = $1
         ORDER BY h.changed_at DESC, h.id DESC`,
        [bookingId]
    );
    const remindersRes = await db.query(
        `SELECT *
         FROM booking_reminder_schedule
         WHERE booking_id = $1
         ORDER BY scheduled_for ASC, id ASC`,
        [bookingId]
    );
    const checklistRes = await db.query(
        `SELECT
            c.*,
            u.name AS reviewed_by_name,
            u.role AS reviewed_by_role
         FROM booking_document_checklist c
         LEFT JOIN user_account u ON u.id = c.reviewed_by_user_id
         WHERE c.booking_id = $1
         ORDER BY c.id ASC`,
        [bookingId]
    );
    const uploadsRes = await db.query(
        `SELECT
            up.id,
            up.checklist_item_id,
            up.booking_id,
            up.uploaded_by_user_id,
            u.name AS uploaded_by_name,
            up.original_filename,
            up.mime_type,
            up.file_size_bytes,
            up.sha256_checksum,
            up.uploaded_at
         FROM booking_document_upload up
         JOIN user_account u ON u.id = up.uploaded_by_user_id
         WHERE up.booking_id = $1
         ORDER BY up.uploaded_at DESC, up.id DESC`,
        [bookingId]
    );
    const rolloverRes = await db.query(
        `SELECT
            r.*,
            u.name AS decided_by_name,
            u.role AS decided_by_role
         FROM booking_rollover_event r
         JOIN user_account u ON u.id = r.decided_by_user_id
         WHERE r.booking_id = $1
         ORDER BY r.decided_at DESC, r.id DESC`,
        [bookingId]
    );

    const uploadsByChecklistId = new Map();
    for (const up of uploadsRes.rows) {
        const key = String(up.checklist_item_id);
        if (!uploadsByChecklistId.has(key)) {
            uploadsByChecklistId.set(key, []);
        }
        uploadsByChecklistId.get(key).push(up);
    }

    const checklistWithUploads = checklistRes.rows.map((item) => ({
        ...item,
        uploads: uploadsByChecklistId.get(String(item.id)) || [],
    }));

    return {
        booking_id: Number(bk.booking_id),
        listing_id: Number(bk.listing_id),
        trader_id: Number(bk.trader_id),
        provider_id: Number(bk.provider_id),
        booking_status: bk.booking_status,
        has_timeline_snapshot: milestonesRes.rowCount > 0,
        schedule_policy: policyRes.rows[0] || null,
        milestones: milestonesRes.rows,
        date_change_history: dateHistRes.rows,
        reminders: remindersRes.rows,
        document_checklist: checklistWithUploads,
        rollover_events: rolloverRes.rows,
    };
}

/**
 * 6. Update Booking Milestone Status or Deadline (with Audited Date-Change Trigger & Reminder Sync)
 */
async function updateBookingMilestone({
    bookingId,
    milestoneId,
    actorUserId,
    providerId = null,
    traderId = null,
    currentDueAt = undefined,
    status = undefined,
    completionNote = undefined,
    reason = null,
}) {
    return pool.withTransaction(async (client) => {
        const bkRes = await client.query(
            `SELECT b.id AS booking_id, b.trader_id, b.listing_id, l.provider_id
             FROM booking b
             JOIN capacity_listing l ON l.id = b.listing_id
             WHERE b.id = $1
             FOR UPDATE`,
            [bookingId]
        );
        if (bkRes.rowCount === 0) {
            throw new AppError(`Booking ID ${bookingId} does not exist`, 404, "BOOKING_NOT_FOUND");
        }
        const bk = bkRes.rows[0];

        const resolvedActorId = Number(actorUserId || providerId || traderId);
        if (!resolvedActorId) {
            throw new AppError("actor_user_id, provider_id, or trader_id is required", 400, "VALIDATION_ERROR");
        }

        if (
            resolvedActorId !== Number(bk.provider_id) &&
            resolvedActorId !== Number(bk.trader_id)
        ) {
            throw new AppError(
                `Forbidden (Rule R8): User ID ${resolvedActorId} is not authorized to modify Booking ID ${bookingId}`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }

        const mRes = await client.query(
            `SELECT * FROM booking_milestone
             WHERE id = $1 AND booking_id = $2
             FOR UPDATE`,
            [milestoneId, bookingId]
        );
        if (mRes.rowCount === 0) {
            throw new AppError(
                `Milestone ID ${milestoneId} does not exist on Booking ID ${bookingId}`,
                404,
                "MILESTONE_NOT_FOUND"
            );
        }
        const existing = mRes.rows[0];

        const nextDueAt =
            currentDueAt !== undefined && currentDueAt !== null && String(currentDueAt).trim() !== ""
                ? parseTimestampInput(currentDueAt, "current_due_at")
                : existing.current_due_at;

        const dueChanged =
            new Date(nextDueAt).getTime() !== new Date(existing.current_due_at).getTime();

        if (dueChanged && resolvedActorId !== Number(bk.provider_id)) {
            throw new AppError(
                "Only the listing provider can modify booking milestone due dates",
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }

        if (dueChanged) {
            if (!reason || String(reason).trim() === "") {
                throw new AppError(
                    "A non-empty reason is required when changing a booking milestone due date",
                    400,
                    "DATE_CHANGE_REASON_REQUIRED"
                );
            }
            await client.query(
                `SELECT
                    set_config('shipspace.current_user_id', $1, true),
                    set_config('shipspace.date_change_reason', $2, true)`,
                [String(resolvedActorId), String(reason).trim()]
            );
        }

        let nextStatus = existing.status;
        if (status !== undefined && status !== null && String(status).trim() !== "") {
            nextStatus = String(status).trim().toLowerCase();
            if (!VALID_MILESTONE_STATUSES.includes(nextStatus)) {
                throw new AppError(
                    `Invalid milestone status "${nextStatus}". Allowed: ${VALID_MILESTONE_STATUSES.join(", ")}`,
                    400,
                    "VALIDATION_ERROR"
                );
            }
        }

        let completedBy = existing.completed_by_user_id;
        let completedAt = existing.completed_at;
        if (nextStatus === "completed" && existing.status !== "completed") {
            completedBy = resolvedActorId;
            completedAt = new Date().toISOString();
        } else if (nextStatus !== "completed") {
            completedBy = null;
            completedAt = null;
        }

        const nextNote =
            completionNote !== undefined ? completionNote : existing.completion_note;

        const updRes = await client.query(
            `UPDATE booking_milestone
             SET current_due_at = $3,
                 status = $4,
                 completed_by_user_id = $5,
                 completed_at = $6,
                 completion_note = $7
             WHERE id = $1 AND booking_id = $2
             RETURNING *`,
            [
                milestoneId,
                bookingId,
                nextDueAt,
                nextStatus,
                completedBy,
                completedAt,
                nextNote,
            ]
        );
        const updatedMilestone = updRes.rows[0];

        if (dueChanged) {
            if (
                ["pending", "in_progress", "rolled"].includes(updatedMilestone.status) &&
                updatedMilestone.owner_role === "shipper"
            ) {
                await scheduleRemindersForMilestone(client, {
                    milestone: updatedMilestone,
                    recipientUserId: bk.trader_id,
                });
            }

            await client.query(
                `INSERT INTO in_app_notification (
                    recipient_user_id,
                    booking_id,
                    listing_id,
                    booking_milestone_id,
                    category,
                    severity,
                    title,
                    message
                 ) VALUES ($1, $2, $3, $4, 'date_change', 'warning', $5, $6)`,
                [
                    bk.trader_id,
                    bookingId,
                    bk.listing_id,
                    milestoneId,
                    `Schedule Updated: ${updatedMilestone.milestone_name}`,
                    `The deadline for "${updatedMilestone.milestone_name}" on Booking #${bookingId} was changed to ${new Date(nextDueAt).toISOString()}. Reason: ${String(reason).trim()}`,
                ]
            );
        }

        return getBookingTimeline(bookingId, { client });
    });
}

/**
 * 7. Ensure Booking Document Checklist Exists (for Legacy Bookings or On-Demand Init)
 */
async function ensureBookingDocumentChecklist(bookingId, client = null) {
    const db = client || pool;
    for (const docTpl of DEFAULT_DOCUMENT_CHECKLIST_TEMPLATES) {
        await db.query(
            `INSERT INTO booking_document_checklist (
                booking_id,
                doc_type,
                doc_label,
                is_mandatory,
                status,
                help_text
             ) VALUES ($1, $2, $3, $4, 'pending', $5)
             ON CONFLICT (booking_id, doc_type) DO NOTHING`,
            [
                bookingId,
                docTpl.doc_type,
                docTpl.doc_label,
                docTpl.is_mandatory,
                docTpl.help_text,
            ]
        );
    }
}

/**
 * 8. Upload Export Document (Off-Webroot Storage + Metadata in booking_document_upload)
 */
async function uploadBookingDocument({
    bookingId,
    checklistItemId,
    uploadedByUserId,
    originalFilename,
    mimeType,
    fileBuffer = null,
    fileBase64 = null,
    referenceValue = undefined,
}) {
    const cleanFilename = parseNonEmptyText(originalFilename, "original_filename");
    const cleanMime = String(mimeType || "").trim().toLowerCase();
    if (!VALID_UPLOAD_MIMES.includes(cleanMime)) {
        throw new AppError(
            `Unsupported mime_type "${cleanMime}". Allowed: ${VALID_UPLOAD_MIMES.join(", ")}`,
            400,
            "VALIDATION_ERROR"
        );
    }

    let buffer = fileBuffer;
    if (!Buffer.isBuffer(buffer)) {
        if (!fileBase64 || typeof fileBase64 !== "string") {
            throw new AppError(
                "file_base64 (or binary file payload) is required for document upload",
                400,
                "VALIDATION_ERROR"
            );
        }
        const stripped = fileBase64.replace(/^data:[^;]+;base64,/, "");
        buffer = Buffer.from(stripped, "base64");
    }

    if (!buffer || buffer.length === 0) {
        throw new AppError("Uploaded document file cannot be empty", 400, "VALIDATION_ERROR");
    }
    if (buffer.length > 10485760) {
        throw new AppError(
            "Uploaded document exceeds maximum allowed size of 10 MB (10,485,760 bytes)",
            400,
            "VALIDATION_ERROR"
        );
    }

    const sha256Checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const ext =
        cleanMime === "application/pdf"
            ? ".pdf"
            : cleanMime === "image/png"
              ? ".png"
              : ".jpg";
    const storedFilename = `bk${bookingId}_item${checklistItemId}_${Date.now()}_${crypto
        .randomBytes(6)
        .toString("hex")}${ext}`;

    ensureUploadDirExists();
    const absoluteFilePath = path.join(PRIVATE_UPLOAD_DIR, storedFilename);

    return pool.withTransaction(async (client) => {
        const bkRes = await client.query(
            `SELECT b.id AS booking_id, b.trader_id, b.listing_id, l.provider_id
             FROM booking b
             JOIN capacity_listing l ON l.id = b.listing_id
             WHERE b.id = $1
             FOR UPDATE`,
            [bookingId]
        );
        if (bkRes.rowCount === 0) {
            throw new AppError(`Booking ID ${bookingId} does not exist`, 404, "BOOKING_NOT_FOUND");
        }
        const bk = bkRes.rows[0];

        if (
            Number(uploadedByUserId) !== Number(bk.trader_id) &&
            Number(uploadedByUserId) !== Number(bk.provider_id)
        ) {
            throw new AppError(
                `Forbidden (Rule R8): User ID ${uploadedByUserId} cannot upload documents for Booking ID ${bookingId}`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }

        const itemRes = await client.query(
            `SELECT * FROM booking_document_checklist
             WHERE id = $1 AND booking_id = $2
             FOR UPDATE`,
            [checklistItemId, bookingId]
        );
        if (itemRes.rowCount === 0) {
            throw new AppError(
                `Checklist item ID ${checklistItemId} does not exist on Booking ID ${bookingId}`,
                404,
                "CHECKLIST_ITEM_NOT_FOUND"
            );
        }

        fs.writeFileSync(absoluteFilePath, buffer);

        const uploadRes = await client.query(
            `INSERT INTO booking_document_upload (
                checklist_item_id,
                booking_id,
                uploaded_by_user_id,
                original_filename,
                stored_filename,
                mime_type,
                file_size_bytes,
                sha256_checksum
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, checklist_item_id, booking_id, uploaded_by_user_id, original_filename, mime_type, file_size_bytes, sha256_checksum, uploaded_at`,
            [
                checklistItemId,
                bookingId,
                uploadedByUserId,
                cleanFilename,
                storedFilename,
                cleanMime,
                buffer.length,
                sha256Checksum,
            ]
        );

        const nextRefVal =
            referenceValue !== undefined
                ? String(referenceValue).trim() || null
                : itemRes.rows[0].reference_value;

        await client.query(
            `UPDATE booking_document_checklist
             SET status = 'uploaded',
                 reference_value = $3,
                 reviewed_by_user_id = NULL,
                 reviewed_at = NULL,
                 correction_reason = NULL
             WHERE id = $1 AND booking_id = $2`,
            [checklistItemId, bookingId, nextRefVal]
        );

        await client.query(
            `INSERT INTO in_app_notification (
                recipient_user_id,
                booking_id,
                listing_id,
                document_checklist_id,
                category,
                severity,
                title,
                message
             ) VALUES ($1, $2, $3, $4, 'document_review', 'info', $5, $6)`,
            [
                bk.provider_id,
                bookingId,
                bk.listing_id,
                checklistItemId,
                `Document Uploaded: ${itemRes.rows[0].doc_label}`,
                `Shipper uploaded "${cleanFilename}" for ${itemRes.rows[0].doc_label} on Booking #${bookingId}.`,
            ]
        );

        return {
            upload: uploadRes.rows[0],
            timeline: await getBookingTimeline(bookingId, { client }),
        };
    });
}

/**
 * 9. Update Reference Value or Review Status on Booking Document Checklist Item
 */
async function updateBookingDocumentChecklistItem({
    bookingId,
    checklistItemId,
    actorUserId,
    status = undefined,
    referenceValue = undefined,
    correctionReason = undefined,
}) {
    return pool.withTransaction(async (client) => {
        const bkRes = await client.query(
            `SELECT b.id AS booking_id, b.trader_id, b.listing_id, l.provider_id
             FROM booking b
             JOIN capacity_listing l ON l.id = b.listing_id
             WHERE b.id = $1
             FOR UPDATE`,
            [bookingId]
        );
        if (bkRes.rowCount === 0) {
            throw new AppError(`Booking ID ${bookingId} does not exist`, 404, "BOOKING_NOT_FOUND");
        }
        const bk = bkRes.rows[0];

        if (
            Number(actorUserId) !== Number(bk.trader_id) &&
            Number(actorUserId) !== Number(bk.provider_id)
        ) {
            throw new AppError(
                `Forbidden (Rule R8): User ID ${actorUserId} cannot modify documents on Booking ID ${bookingId}`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }

        const itemRes = await client.query(
            `SELECT * FROM booking_document_checklist
             WHERE id = $1 AND booking_id = $2
             FOR UPDATE`,
            [checklistItemId, bookingId]
        );
        if (itemRes.rowCount === 0) {
            throw new AppError(
                `Checklist item ID ${checklistItemId} does not exist on Booking ID ${bookingId}`,
                404,
                "CHECKLIST_ITEM_NOT_FOUND"
            );
        }
        const existing = itemRes.rows[0];

        let nextStatus = existing.status;
        if (status !== undefined && status !== null && String(status).trim() !== "") {
            nextStatus = String(status).trim().toLowerCase();
            if (!VALID_DOC_STATUSES.includes(nextStatus)) {
                throw new AppError(
                    `Invalid document status "${nextStatus}". Allowed: ${VALID_DOC_STATUSES.join(", ")}`,
                    400,
                    "VALIDATION_ERROR"
                );
            }
        }

        const isProviderReviewState = ["under_review", "approved", "correction_required", "waived"].includes(
            nextStatus
        );
        if (isProviderReviewState && nextStatus !== existing.status) {
            if (Number(actorUserId) !== Number(bk.provider_id)) {
                throw new AppError(
                    "Only the listing provider can review, approve, waive, or request corrections on export documents",
                    403,
                    "FORBIDDEN_OWNERSHIP"
                );
            }
        }

        let reviewedBy = existing.reviewed_by_user_id;
        let reviewedAt = existing.reviewed_at;
        let nextCorrectionReason =
            correctionReason !== undefined ? correctionReason : existing.correction_reason;

        if (["approved", "correction_required"].includes(nextStatus)) {
            reviewedBy = actorUserId;
            reviewedAt = new Date().toISOString();
        } else if (["pending", "uploaded"].includes(nextStatus)) {
            reviewedBy = null;
            reviewedAt = null;
            nextCorrectionReason = null;
        }

        if (nextStatus === "correction_required") {
            if (!nextCorrectionReason || String(nextCorrectionReason).trim() === "") {
                throw new AppError(
                    "correction_reason is required when document status is correction_required",
                    400,
                    "CORRECTION_REASON_REQUIRED"
                );
            }
            nextCorrectionReason = String(nextCorrectionReason).trim();
        }

        const nextReferenceValue =
            referenceValue !== undefined
                ? String(referenceValue).trim() || null
                : existing.reference_value;

        // If trader submits a reference value (e.g. IEC or HS code) while status is pending/correction_required, transition to uploaded
        if (
            referenceValue !== undefined &&
            nextReferenceValue &&
            status === undefined &&
            ["pending", "correction_required"].includes(existing.status)
        ) {
            nextStatus = "uploaded";
            reviewedBy = null;
            reviewedAt = null;
            nextCorrectionReason = null;
        }

        const updRes = await client.query(
            `UPDATE booking_document_checklist
             SET status = $3,
                 reference_value = $4,
                 reviewed_by_user_id = $5,
                 reviewed_at = $6,
                 correction_reason = $7
             WHERE id = $1 AND booking_id = $2
             RETURNING *`,
            [
                checklistItemId,
                bookingId,
                nextStatus,
                nextReferenceValue,
                reviewedBy,
                reviewedAt,
                nextCorrectionReason,
            ]
        );

        if (["approved", "correction_required"].includes(nextStatus)) {
            const isCorrection = nextStatus === "correction_required";
            await client.query(
                `INSERT INTO in_app_notification (
                    recipient_user_id,
                    booking_id,
                    listing_id,
                    document_checklist_id,
                    category,
                    severity,
                    title,
                    message
                 ) VALUES ($1, $2, $3, $4, 'document_review', $5, $6, $7)`,
                [
                    bk.trader_id,
                    bookingId,
                    bk.listing_id,
                    checklistItemId,
                    isCorrection ? "urgent" : "info",
                    isCorrection
                        ? `Correction Required: ${existing.doc_label}`
                        : `Document Approved: ${existing.doc_label}`,
                    isCorrection
                        ? `Provider requested correction for ${existing.doc_label} on Booking #${bookingId}: ${nextCorrectionReason}`
                        : `Your ${existing.doc_label} for Booking #${bookingId} has been approved.`,
                ]
            );
        }

        return {
            checklist_item: updRes.rows[0],
            timeline: await getBookingTimeline(bookingId, { client }),
        };
    });
}

/**
 * 10. Resolve Private Document File for Authorized Download
 */
async function getBookingDocumentDownload({ bookingId, uploadId, actorUserId }) {
    const res = await pool.query(
        `SELECT
            up.*,
            b.trader_id,
            l.provider_id
         FROM booking_document_upload up
         JOIN booking b ON b.id = up.booking_id
         JOIN capacity_listing l ON l.id = b.listing_id
         WHERE up.id = $1 AND up.booking_id = $2`,
        [uploadId, bookingId]
    );
    if (res.rowCount === 0) {
        throw new AppError(
            `Document upload ID ${uploadId} does not exist on Booking ID ${bookingId}`,
            404,
            "DOCUMENT_UPLOAD_NOT_FOUND"
        );
    }
    const row = res.rows[0];
    if (
        Number(actorUserId) !== Number(row.trader_id) &&
        Number(actorUserId) !== Number(row.provider_id)
    ) {
        throw new AppError(
            `Forbidden (Rule R8): User ID ${actorUserId} cannot download documents for Booking ID ${bookingId}`,
            403,
            "FORBIDDEN_OWNERSHIP"
        );
    }

    const filePath = path.join(PRIVATE_UPLOAD_DIR, row.stored_filename);
    if (!fs.existsSync(filePath)) {
        throw new AppError("Stored document file is missing on disk", 404, "FILE_NOT_FOUND");
    }

    return {
        filePath,
        originalFilename: row.original_filename,
        mimeType: row.mime_type,
        fileSizeBytes: Number(row.file_size_bytes),
        sha256Checksum: row.sha256_checksum,
    };
}

/**
 * 11. Record Missed Cut-Off / Rollover Decision ('accept', 'roll', 'cancel')
 */
async function recordBookingRolloverDecision({
    bookingId,
    providerId,
    missedMilestoneId = null,
    operatorDecision,
    rolloverFeeAmount = 0,
    currency = "USD",
    newDocCutoffAt = null,
    newCfsGateInAt = null,
    newEtdAt = null,
    newEtaAt = null,
    rolloverTargetListingId = null,
    decisionReason,
    outcomeNotes = null,
}) {
    const decision = String(operatorDecision || "").trim().toLowerCase();
    if (!VALID_OPERATOR_DECISIONS.includes(decision)) {
        throw new AppError(
            `operator_decision must be one of: ${VALID_OPERATOR_DECISIONS.join(", ")}`,
            400,
            "VALIDATION_ERROR"
        );
    }
    const cleanReason = parseNonEmptyText(decisionReason, "decision_reason");
    const fee = Number(rolloverFeeAmount ?? 0);
    if (!Number.isFinite(fee) || fee < 0) {
        throw new AppError("rollover_fee_amount must be a non-negative number", 400, "VALIDATION_ERROR");
    }

    return pool.withTransaction(async (client) => {
        const bkRes = await client.query(
            `SELECT b.id AS booking_id, b.trader_id, b.listing_id, b.status AS booking_status,
                    l.provider_id
             FROM booking b
             JOIN capacity_listing l ON l.id = b.listing_id
             WHERE b.id = $1
             FOR UPDATE`,
            [bookingId]
        );
        if (bkRes.rowCount === 0) {
            throw new AppError(`Booking ID ${bookingId} does not exist`, 404, "BOOKING_NOT_FOUND");
        }
        const bk = bkRes.rows[0];

        if (Number(bk.provider_id) !== Number(providerId)) {
            throw new AppError(
                `Forbidden (Rule R8): Booking ID ${bookingId} is not on a listing owned by Provider ID ${providerId}`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }

        const policyRes = await client.query(
            `SELECT * FROM listing_schedule_policy WHERE listing_id = $1`,
            [bk.listing_id]
        );
        const policy = policyRes.rows[0] || null;
        const applicablePolicySnapshot = policy?.rollover_policy || "roll_next_sailing";
        const applicableChargeTermsSnapshot = policy?.rollover_charge_terms || null;
        const tz = policy?.port_timezone || "Asia/Kolkata";

        const milestonesRes = await client.query(
            `SELECT * FROM booking_milestone WHERE booking_id = $1 FOR UPDATE`,
            [bookingId]
        );
        const byCode = new Map(milestonesRes.rows.map((m) => [m.milestone_code, m]));
        const previousEtdAt = byCode.get("etd")?.current_due_at || policy?.etd_at || null;
        const previousEtaAt = byCode.get("eta")?.current_due_at || policy?.eta_at || null;

        let parsedNewDocCutoff = parseTimestampInput(newDocCutoffAt, "new_doc_cutoff_at", {
            required: false,
        });
        let parsedNewCfsGateIn = parseTimestampInput(newCfsGateInAt, "new_cfs_gate_in_at", {
            required: false,
        });
        let parsedNewEtd = parseTimestampInput(newEtdAt, "new_etd_at", {
            required: decision === "roll",
        });
        let parsedNewEta = parseTimestampInput(newEtaAt, "new_eta_at", {
            required: decision === "roll",
        });

        if (decision === "roll" && new Date(parsedNewEtd) >= new Date(parsedNewEta)) {
            throw new AppError(
                "new_etd_at must be strictly before new_eta_at when rolling a booking",
                400,
                "VALIDATION_ERROR"
            );
        }

        await client.query(
            `SELECT
                set_config('shipspace.current_user_id', $1, true),
                set_config('shipspace.date_change_reason', $2, true)`,
            [String(providerId), cleanReason]
        );

        if (decision === "accept") {
            if (missedMilestoneId) {
                await client.query(
                    `UPDATE booking_milestone
                     SET status = 'waived',
                         completion_note = $3
                     WHERE id = $1 AND booking_id = $2`,
                    [missedMilestoneId, bookingId, `Late acceptance approved: ${cleanReason}`]
                );
            }
        } else if (decision === "roll") {
            if (missedMilestoneId) {
                await client.query(
                    `UPDATE booking_milestone
                     SET status = 'rolled',
                         completion_note = $3
                     WHERE id = $1 AND booking_id = $2`,
                    [missedMilestoneId, bookingId, `Rolled to next sailing: ${cleanReason}`]
                );
            }

            const dateUpdates = [
                { code: "doc_cutoff", due: parsedNewDocCutoff },
                { code: "cfs_gate_in", due: parsedNewCfsGateIn },
                { code: "etd", due: parsedNewEtd },
                { code: "eta", due: parsedNewEta },
            ];

            for (const u of dateUpdates) {
                const m = byCode.get(u.code);
                if (m && u.due && new Date(m.current_due_at).getTime() !== new Date(u.due).getTime()) {
                    const upd = await client.query(
                        `UPDATE booking_milestone
                         SET current_due_at = $3,
                             status = CASE WHEN status = 'missed' THEN 'rolled' ELSE status END
                         WHERE id = $1 AND booking_id = $2
                         RETURNING *`,
                        [m.id, bookingId, u.due]
                    );
                    if (upd.rows[0].owner_role === "shipper") {
                        await scheduleRemindersForMilestone(client, {
                            milestone: upd.rows[0],
                            recipientUserId: bk.trader_id,
                        });
                    }
                }
            }
        } else if (decision === "cancel") {
            if (missedMilestoneId) {
                await client.query(
                    `UPDATE booking_milestone
                     SET status = 'missed',
                         completion_note = $3
                     WHERE id = $1 AND booking_id = $2`,
                    [missedMilestoneId, bookingId, `Cancelled after missed cut-off: ${cleanReason}`]
                );
            }
            if (bk.booking_status === "confirmed") {
                await client.query(`CALL sp_cancel_booking($1, $2, $3)`, [
                    bookingId,
                    providerId,
                    cleanReason,
                ]);
            }
        }

        const eventRes = await client.query(
            `INSERT INTO booking_rollover_event (
                booking_id,
                listing_id,
                missed_milestone_id,
                operator_decision,
                applicable_policy_snapshot,
                applicable_charge_terms_snapshot,
                rollover_fee_amount,
                currency,
                timezone,
                previous_etd_at,
                previous_eta_at,
                new_doc_cutoff_at,
                new_cfs_gate_in_at,
                new_etd_at,
                new_eta_at,
                rollover_target_listing_id,
                decision_reason,
                outcome_notes,
                decided_by_user_id
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
             ) RETURNING *`,
            [
                bookingId,
                bk.listing_id,
                missedMilestoneId || null,
                decision,
                applicablePolicySnapshot,
                applicableChargeTermsSnapshot,
                fee,
                String(currency || "USD").trim().toUpperCase(),
                tz,
                previousEtdAt,
                previousEtaAt,
                parsedNewDocCutoff,
                parsedNewCfsGateIn,
                parsedNewEtd,
                parsedNewEta,
                rolloverTargetListingId || null,
                cleanReason,
                outcomeNotes || null,
                providerId,
            ]
        );
        const rolloverEvent = eventRes.rows[0];

        const decisionLabels = {
            accept: "Late Cargo/Docs Accepted onto Current Sailing",
            roll: "Booking Rolled to New Sailing Schedule",
            cancel: "Booking Cancelled Under Missed Cut-Off Policy",
        };

        await client.query(
            `INSERT INTO in_app_notification (
                recipient_user_id,
                booking_id,
                listing_id,
                booking_milestone_id,
                rollover_event_id,
                category,
                severity,
                title,
                message
             ) VALUES ($1, $2, $3, $4, $5, 'rollover_decision', 'urgent', $6, $7)`,
            [
                bk.trader_id,
                bookingId,
                bk.listing_id,
                missedMilestoneId || null,
                rolloverEvent.id,
                decisionLabels[decision],
                `Booking #${bookingId}: ${decisionLabels[decision]}. Policy: ${applicablePolicySnapshot}. Reason: ${cleanReason}`,
            ]
        );

        return {
            rollover_event: rolloverEvent,
            timeline: await getBookingTimeline(bookingId, { client }),
        };
    });
}

/**
 * 12. Process Due Reminders & Overdue Milestones into In-App Notifications
 */
async function processDueReminders({ asOf = null } = {}) {
    return pool.withTransaction(async (client) => {
        const refTime = asOf ? parseTimestampInput(asOf, "as_of") : new Date().toISOString();

        // 1. Detect overdue milestones still in pending/in_progress and queue missed_deadline reminders
        const overdueRes = await client.query(
            `SELECT m.*, b.trader_id
             FROM booking_milestone m
             JOIN booking b ON b.id = m.booking_id
             WHERE m.status IN ('pending', 'in_progress')
               AND b.status = 'confirmed'
               AND m.current_due_at < $1::timestamptz`,
            [refTime]
        );

        for (const m of overdueRes.rows) {
            await client.query(
                `INSERT INTO booking_reminder_schedule (
                    booking_id,
                    booking_milestone_id,
                    recipient_user_id,
                    reminder_type,
                    offset_days,
                    timezone,
                    milestone_due_version,
                    scheduled_for,
                    delivery_status
                 ) VALUES ($1, $2, $3, 'missed_deadline', 0, $4, $5, $6, 'pending')
                 ON CONFLICT (booking_milestone_id, recipient_user_id, reminder_type, milestone_due_version)
                 DO NOTHING`,
                [
                    m.booking_id,
                    m.id,
                    m.trader_id,
                    m.timezone || "Asia/Kolkata",
                    m.current_due_at,
                    refTime,
                ]
            );
        }

        // 2. Deliver all pending reminders where scheduled_for <= refTime
        const dueRemindersRes = await client.query(
            `SELECT
                r.*,
                m.milestone_name,
                m.milestone_code,
                m.current_due_at,
                m.listing_id
             FROM booking_reminder_schedule r
             JOIN booking_milestone m ON m.id = r.booking_milestone_id
             WHERE r.delivery_status = 'pending'
               AND r.scheduled_for <= $1::timestamptz
             ORDER BY r.scheduled_for ASC, r.id ASC
             FOR UPDATE OF r`,
            [refTime]
        );

        const delivered = [];
        for (const rem of dueRemindersRes.rows) {
            const isMissed = rem.reminder_type === "missed_deadline";
            const category = isMissed ? "missed_deadline" : "reminder";
            const severity = isMissed
                ? "urgent"
                : rem.reminder_type === "morning_of" || rem.reminder_type === "offset_1d"
                  ? "warning"
                  : "info";

            const labelMap = {
                offset_5d: "5-Day Advance Reminder",
                offset_2d: "2-Day Advance Reminder",
                offset_1d: "24-Hour Cut-Off Reminder",
                morning_of: "Deadline Day (08:00 AM) Alert",
                missed_deadline: "Missed Cut-Off Alert",
            };

            const notifRes = await client.query(
                `INSERT INTO in_app_notification (
                    recipient_user_id,
                    booking_id,
                    listing_id,
                    booking_milestone_id,
                    reminder_id,
                    category,
                    severity,
                    title,
                    message
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (reminder_id) DO NOTHING
                 RETURNING *`,
                [
                    rem.recipient_user_id,
                    rem.booking_id,
                    rem.listing_id,
                    rem.booking_milestone_id,
                    rem.id,
                    category,
                    severity,
                    `${labelMap[rem.reminder_type] || "Milestone Reminder"}: ${rem.milestone_name}`,
                    `Booking #${rem.booking_id} — "${rem.milestone_name}" is due at ${new Date(rem.current_due_at).toISOString()} (${rem.timezone}).`,
                ]
            );

            await client.query(
                `UPDATE booking_reminder_schedule
                 SET delivery_status = 'sent',
                     sent_at = $2::timestamptz
                 WHERE id = $1`,
                [rem.id, refTime]
            );

            if (notifRes.rowCount > 0) {
                delivered.push(notifRes.rows[0]);
            }
        }

        return {
            as_of: refTime,
            due_reminders_processed: dueRemindersRes.rowCount,
            notifications_created: delivered.length,
            notifications: delivered,
        };
    });
}

/**
 * 13. In-App Notifications Feed & Read Status
 */
async function getUserNotifications(userId, { unreadOnly = false, limit = 50 } = {}) {
    const userCheck = await pool.query(`SELECT id, name, role FROM user_account WHERE id = $1`, [
        userId,
    ]);
    if (userCheck.rowCount === 0) {
        throw new AppError(`User ID ${userId} does not exist`, 404, "USER_NOT_FOUND");
    }

    const params = [userId, Math.min(Math.max(Number(limit) || 50, 1), 200)];
    const unreadClause = unreadOnly ? `AND is_read = FALSE` : "";

    const [rowsRes, countRes] = await Promise.all([
        pool.query(
            `SELECT *
             FROM in_app_notification
             WHERE recipient_user_id = $1 ${unreadClause}
             ORDER BY created_at DESC, id DESC
             LIMIT $2`,
            params
        ),
        pool.query(
            `SELECT COUNT(*)::int AS unread_count
             FROM in_app_notification
             WHERE recipient_user_id = $1 AND is_read = FALSE`,
            [userId]
        ),
    ]);

    return {
        user_id: Number(userId),
        unread_count: countRes.rows[0].unread_count,
        notifications: rowsRes.rows,
    };
}

async function markNotificationRead({ notificationId, userId }) {
    const res = await pool.query(
        `UPDATE in_app_notification
         SET is_read = TRUE,
             read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE id = $1 AND recipient_user_id = $2
         RETURNING *`,
        [notificationId, userId]
    );
    if (res.rowCount === 0) {
        throw new AppError(
            `Notification ID ${notificationId} not found for User ID ${userId}`,
            404,
            "NOTIFICATION_NOT_FOUND"
        );
    }
    return res.rows[0];
}

async function markAllNotificationsRead(userId) {
    const res = await pool.query(
        `UPDATE in_app_notification
         SET is_read = TRUE,
             read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE recipient_user_id = $1 AND is_read = FALSE`,
        [userId]
    );
    return {
        user_id: Number(userId),
        marked_read_count: res.rowCount,
    };
}

module.exports = {
    getStandardMilestoneTypes,
    getListingSchedule,
    upsertListingSchedule,
    initializeBookingFeatureBSnapshots,
    getBookingTimeline,
    updateBookingMilestone,
    ensureBookingDocumentChecklist,
    uploadBookingDocument,
    updateBookingDocumentChecklistItem,
    getBookingDocumentDownload,
    recordBookingRolloverDecision,
    processDueReminders,
    getUserNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    computeScheduledReminderTimestamp,
};
