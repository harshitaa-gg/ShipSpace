import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Clock,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  RefreshCw,
  Calendar,
  MapPin,
  History,
  Bell,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../api/client';

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function BookingTimelineAndDocsModal({
  booking,
  role = 'trader', // 'trader' | 'provider'
  actorUserId,
  initialTab = 'timeline', // 'timeline' | 'documents' | 'rollover'
  onClose,
  onUpdated,
}) {
  const bookingId = booking?.booking_id;
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [timelineData, setTimelineData] = useState(null);

  // Provider milestone deadline edit state
  const [editingMilestoneId, setEditingMilestoneId] = useState(null);
  const [editDueAt, setEditDueAt] = useState('');
  const [editReason, setEditReason] = useState('');

  // Document checklist reference values & provider correction reason state
  const [refValues, setRefValues] = useState({});
  const [correctionReasons, setCorrectionReasons] = useState({});

  // Rollover form state (for provider)
  const [rollMissedMilestoneId, setRollMissedMilestoneId] = useState('');
  const [rollDecision, setRollDecision] = useState('roll');
  const [rollFee, setRollFee] = useState('0');
  const [rollNewDocCutoff, setRollNewDocCutoff] = useState('');
  const [rollNewCfsGateIn, setRollNewCfsGateIn] = useState('');
  const [rollNewEtd, setRollNewEtd] = useState('');
  const [rollNewEta, setRollNewEta] = useState('');
  const [rollReason, setRollReason] = useState('');
  const [rollNotes, setRollNotes] = useState('');

  const loadTimeline = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const params =
        role === 'provider'
          ? { provider_id: actorUserId }
          : { trader_id: actorUserId };
      const res = await api.getBookingTimeline(bookingId, params);
      const data = res.data || {};
      setTimelineData(data);

      const nextRefs = {};
      (data.document_checklist || []).forEach((item) => {
        nextRefs[item.id] = item.reference_value || '';
      });
      setRefValues(nextRefs);

      // Pre-fill rollover dates 7 days ahead of current ETD/ETA if available
      const policy = data.schedule_policy;
      if (policy?.etd_at && policy?.eta_at) {
        const add7d = (iso) =>
          toLocalDatetimeValue(
            new Date(new Date(iso).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
          );
        setRollNewDocCutoff(add7d(policy.doc_cutoff_at));
        setRollNewCfsGateIn(add7d(policy.cfs_gate_in_at));
        setRollNewEtd(add7d(policy.etd_at));
        setRollNewEta(add7d(policy.eta_at));
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to load booking timeline and documents.',
      });
    } finally {
      setLoading(false);
    }
  }, [bookingId, role, actorUserId]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const handleMilestoneStatusChange = async (milestoneId, newStatus) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.updateBookingMilestone(bookingId, milestoneId, actorUserId, {
        status: newStatus,
        completion_note:
          newStatus === 'completed'
            ? `Completed by ${role} #${actorUserId}`
            : undefined,
      });
      setTimelineData(res.data);
      setFeedback({
        type: 'success',
        text: `Milestone status updated to "${newStatus}".`,
      });
      if (onUpdated) onUpdated();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to update milestone status.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMilestoneDeadline = async (milestoneId) => {
    if (!editReason.trim()) {
      setFeedback({
        type: 'error',
        text: 'Please enter a non-empty reason for changing the milestone deadline.',
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.updateBookingMilestone(bookingId, milestoneId, actorUserId, {
        current_due_at: new Date(editDueAt).toISOString(),
        reason: editReason.trim(),
      });
      setTimelineData(res.data);
      setEditingMilestoneId(null);
      setEditReason('');
      setFeedback({
        type: 'success',
        text: 'Milestone deadline updated, history logged, and reminders rescheduled.',
      });
      if (onUpdated) onUpdated();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to update milestone deadline.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleInitDocuments = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.initBookingDocuments(bookingId);
      setTimelineData(res.data);
      setFeedback({
        type: 'success',
        text: 'Standard export compliance document checklist initialized for this booking.',
      });
      if (onUpdated) onUpdated();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to initialize document checklist.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = async (checklistItem, file) => {
    if (!file) return;
    setBusy(true);
    setFeedback(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read selected file'));
        reader.readAsDataURL(file);
      });

      const res = await api.uploadBookingDocument(
        bookingId,
        checklistItem.id,
        actorUserId,
        {
          original_filename: file.name,
          mime_type: file.type || 'application/pdf',
          file_base64: base64,
          reference_value: refValues[checklistItem.id] || undefined,
        }
      );
      setTimelineData(res.data.timeline);
      setFeedback({
        type: 'success',
        text: `Uploaded "${file.name}" for ${checklistItem.doc_label}.`,
      });
      if (onUpdated) onUpdated();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Document upload failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveReferenceValue = async (checklistItem) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.updateBookingDocumentChecklistItem(
        bookingId,
        checklistItem.id,
        actorUserId,
        {
          reference_value: refValues[checklistItem.id] || '',
        }
      );
      setTimelineData(res.data.timeline);
      setFeedback({
        type: 'success',
        text: `Saved reference details for ${checklistItem.doc_label}.`,
      });
      if (onUpdated) onUpdated();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to save reference value.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleProviderReviewDocument = async (checklistItem, newStatus) => {
    const corrReason = (correctionReasons[checklistItem.id] || '').trim();
    if (newStatus === 'correction_required' && !corrReason) {
      setFeedback({
        type: 'error',
        text: `Please enter a correction reason before marking "${checklistItem.doc_label}" as Correction Required.`,
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.updateBookingDocumentChecklistItem(
        bookingId,
        checklistItem.id,
        actorUserId,
        {
          status: newStatus,
          correction_reason:
            newStatus === 'correction_required' ? corrReason : undefined,
        }
      );
      setTimelineData(res.data.timeline);
      setFeedback({
        type: 'success',
        text: `Updated "${checklistItem.doc_label}" review status to "${newStatus}".`,
      });
      if (onUpdated) onUpdated();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to update document review status.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRecordRollover = async (e) => {
    e.preventDefault();
    if (!rollReason.trim()) {
      setFeedback({
        type: 'error',
        text: 'A non-empty decision reason is required to record a rollover / missed cut-off action.',
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.recordBookingRolloverDecision(actorUserId, bookingId, {
        missed_milestone_id: rollMissedMilestoneId ? Number(rollMissedMilestoneId) : null,
        operator_decision: rollDecision,
        rollover_fee_amount: Number(rollFee || 0),
        currency: 'USD',
        new_doc_cutoff_at:
          rollDecision === 'roll' && rollNewDocCutoff
            ? new Date(rollNewDocCutoff).toISOString()
            : null,
        new_cfs_gate_in_at:
          rollDecision === 'roll' && rollNewCfsGateIn
            ? new Date(rollNewCfsGateIn).toISOString()
            : null,
        new_etd_at:
          rollDecision === 'roll' && rollNewEtd
            ? new Date(rollNewEtd).toISOString()
            : null,
        new_eta_at:
          rollDecision === 'roll' && rollNewEta
            ? new Date(rollNewEta).toISOString()
            : null,
        decision_reason: rollReason.trim(),
        outcome_notes: rollNotes.trim() || null,
      });
      setTimelineData(res.data.timeline);
      setRollReason('');
      setRollNotes('');
      setFeedback({
        type: 'success',
        text: `Recorded operator decision "${rollDecision}" and notified the shipper.`,
      });
      if (onUpdated) onUpdated();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to record rollover decision.',
      });
    } finally {
      setBusy(false);
    }
  };

  const milestones = timelineData?.milestones || [];
  const checklist = timelineData?.document_checklist || [];
  const dateHistory = timelineData?.date_change_history || [];
  const reminders = timelineData?.reminders || [];
  const rolloverEvents = timelineData?.rollover_events || [];
  const policy = timelineData?.schedule_policy;

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="modal-card modal-card-lg"
        style={{ maxWidth: '940px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <span className="modal-eyebrow">
              BOOKING #{bookingId} &middot; LISTING #{booking?.listing_id} &middot;{' '}
              {role.toUpperCase()} VIEW
            </span>
            <h3 className="modal-title">
              Shipment Timeline, Export Documents &amp; Rollover Management
            </h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '10px 20px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className={`filter-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            <Clock size={14} />
            <span>Timeline &amp; Deadlines ({milestones.length})</span>
          </button>
          <button
            type="button"
            className={`filter-tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            <FileText size={14} />
            <span>Export Documents ({checklist.length})</span>
          </button>
          <button
            type="button"
            className={`filter-tab-btn ${activeTab === 'rollover' ? 'active' : ''}`}
            onClick={() => setActiveTab('rollover')}
          >
            <RefreshCw size={14} />
            <span>Missed Cut-Off &amp; Rollover ({rolloverEvents.length})</span>
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {feedback && (
            <div
              className={`alert-banner ${
                feedback.type === 'success' ? 'alert-success' : 'alert-error'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertTriangle size={18} />
              )}
              <div className="alert-content-grow">
                <p>{feedback.text}</p>
              </div>
            </div>
          )}

          {loading ? (
            <p className="modal-helper-text">Loading booking operational data...</p>
          ) : (
            <>
              {/* Policy Summary Banner */}
              {policy && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '10px',
                    fontSize: '12.5px',
                  }}
                >
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>
                      Origin CFS Facility
                    </span>
                    <strong style={{ color: '#0f172a' }}>
                      <MapPin size={12} style={{ display: 'inline', marginRight: '3px' }} />
                      {policy.cfs_name}
                    </strong>
                    <div style={{ color: '#475569', fontSize: '11.5px' }}>{policy.cfs_address}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>
                      Port Timezone &amp; Lead Time
                    </span>
                    <strong style={{ color: '#0f172a' }}>
                      {policy.port_timezone} &middot; Min {policy.min_lead_time_days}d Lead
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>
                      Listing Rollover Policy
                    </span>
                    <strong style={{ color: '#ea580c' }}>{policy.rollover_policy}</strong>
                    {policy.rollover_charge_terms && (
                      <div style={{ color: '#475569', fontSize: '11.5px' }}>
                        {policy.rollover_charge_terms}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 1: VERTICAL TIMELINE */}
              {activeTab === 'timeline' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {milestones.length === 0 ? (
                    <div
                      style={{
                        padding: '18px',
                        border: '1px dashed #cbd5e1',
                        borderRadius: '8px',
                        textAlign: 'center',
                        color: '#475569',
                      }}
                    >
                      <Clock size={26} className="text-orange" style={{ marginBottom: '6px' }} />
                      <h4 style={{ margin: '0 0 4px', color: '#0f172a' }}>
                        Legacy Booking (No Frozen Milestone Snapshot)
                      </h4>
                      <p style={{ fontSize: '12.5px', margin: 0 }}>
                        This historical booking was created before a listing schedule policy was configured.
                        You can still use the Export Documents tab to manage compliance documents.
                      </p>
                    </div>
                  ) : (
                    <div className="audit-timeline-list">
                      {milestones.map((m) => {
                        const isDueChanged =
                          new Date(m.original_due_at).getTime() !==
                          new Date(m.current_due_at).getTime();
                        const canTraderComplete =
                          role === 'trader' &&
                          m.owner_role === 'shipper' &&
                          m.status !== 'completed';
                        const isEditing = editingMilestoneId === m.id;

                        return (
                          <div
                            key={m.id}
                            className="audit-timeline-item"
                            style={{
                              padding: '12px',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              marginBottom: '8px',
                              background:
                                m.status === 'completed'
                                  ? '#f0fdf4'
                                  : m.status === 'missed'
                                    ? '#fef2f2'
                                    : '#ffffff',
                            }}
                          >
                            <div className="audit-timeline-dot" />
                            <div className="audit-timeline-content" style={{ width: '100%' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                  gap: '8px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <strong style={{ color: '#0f172a', fontSize: '13.5px' }}>
                                    {m.milestone_name}
                                  </strong>
                                  <span className="cargo-tag-chip">Owner: {m.owner_role}</span>
                                  <span className={`status-badge status-${m.status === 'completed' ? 'confirmed' : m.status === 'missed' ? 'cancelled' : 'open'}`}>
                                    {m.status}
                                  </span>
                                </div>

                                <div style={{ fontSize: '12px', color: '#334155', textAlign: 'right' }}>
                                  <div>
                                    <Calendar size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                    <strong>Due:</strong> {new Date(m.current_due_at).toLocaleString()} (
                                    {m.timezone})
                                  </div>
                                  {isDueChanged && (
                                    <div style={{ color: '#b45309', fontSize: '11px' }}>
                                      Frozen Original: {new Date(m.original_due_at).toLocaleString()}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {m.help_text && (
                                <p style={{ margin: '4px 0 6px', fontSize: '12px', color: '#475569' }}>
                                  {m.help_text}
                                </p>
                              )}

                              {m.completion_note && (
                                <div style={{ fontSize: '11.5px', color: '#15803d', marginBottom: '6px' }}>
                                  Note: {m.completion_note}
                                </div>
                              )}

                              {/* Actions */}
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                                {canTraderComplete && (
                                  <button
                                    type="button"
                                    className="btn-secondary-sm"
                                    disabled={busy}
                                    onClick={() => handleMilestoneStatusChange(m.id, 'completed')}
                                  >
                                    <CheckCircle2 size={13} />
                                    <span>Mark Completed</span>
                                  </button>
                                )}

                                {role === 'provider' && (
                                  <>
                                    {m.status !== 'completed' && (
                                      <button
                                        type="button"
                                        className="btn-secondary-sm"
                                        disabled={busy}
                                        onClick={() => handleMilestoneStatusChange(m.id, 'completed')}
                                      >
                                        <CheckCircle2 size={13} />
                                        <span>Complete</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="btn-ghost-sm"
                                      disabled={busy}
                                      onClick={() => {
                                        if (isEditing) {
                                          setEditingMilestoneId(null);
                                        } else {
                                          setEditingMilestoneId(m.id);
                                          setEditDueAt(toLocalDatetimeValue(m.current_due_at));
                                          setEditReason('');
                                        }
                                      }}
                                    >
                                      <Clock size={13} />
                                      <span>{isEditing ? 'Cancel Edit' : 'Change Deadline'}</span>
                                    </button>
                                  </>
                                )}
                              </div>

                              {isEditing && (
                                <div
                                  style={{
                                    marginTop: '10px',
                                    padding: '10px',
                                    background: '#f8fafc',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                  }}
                                >
                                  <div className="form-row-2col">
                                    <div className="form-group">
                                      <label className="form-label">New Due Date &amp; Time</label>
                                      <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={editDueAt}
                                        onChange={(e) => setEditDueAt(e.target.value)}
                                      />
                                    </div>
                                    <div className="form-group">
                                      <label className="form-label">
                                        Mandatory Reason for Date Change
                                      </label>
                                      <input
                                        type="text"
                                        className="form-input"
                                        value={editReason}
                                        onChange={(e) => setEditReason(e.target.value)}
                                        placeholder="e.g. Carrier extended SI cut-off window"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <button
                                      type="button"
                                      className="btn-orange-primary btn-sm"
                                      disabled={busy}
                                      onClick={() => handleSaveMilestoneDeadline(m.id)}
                                    >
                                      Save New Deadline &amp; Audit Entry
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Date-Change History */}
                  {dateHistory.length > 0 && (
                    <div>
                      <h4 className="audit-section-heading">
                        <History size={15} className="text-orange" /> Milestone Date-Change Audit Log (
                        {dateHistory.length})
                      </h4>
                      <div className="audit-timeline-list">
                        {dateHistory.map((h) => (
                          <div key={h.id} className="audit-timeline-item">
                            <div className="audit-timeline-dot" />
                            <div className="audit-timeline-content">
                              <div style={{ fontSize: '12.5px', fontWeight: 600 }}>
                                <code>{h.milestone_code}</code>:{' '}
                                {new Date(h.old_due_at).toLocaleString()} &rarr;{' '}
                                {new Date(h.new_due_at).toLocaleString()}
                              </div>
                              <div style={{ fontSize: '12px', color: '#475569' }}>
                                Reason: <strong>{h.reason}</strong> &middot; by {h.changed_by_name} (
                                {new Date(h.changed_at).toLocaleString()})
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reminder Schedule Summary */}
                  {reminders.length > 0 && (
                    <div>
                      <h4 className="audit-section-heading">
                        <Bell size={15} className="text-orange" /> Scheduled Automated Reminders (
                        {reminders.length})
                      </h4>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                          gap: '8px',
                        }}
                      >
                        {reminders.slice(0, 12).map((r) => (
                          <div
                            key={r.id}
                            style={{
                              padding: '8px 10px',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              background: '#f8fafc',
                            }}
                          >
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>
                              {r.reminder_type} ({r.delivery_status})
                            </div>
                            <div style={{ color: '#475569' }}>
                              Scheduled: {new Date(r.scheduled_for).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: EXPORT DOCUMENT CHECKLIST */}
              {activeTab === 'documents' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {checklist.length === 0 ? (
                    <div
                      style={{
                        padding: '18px',
                        border: '1px dashed #cbd5e1',
                        borderRadius: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <FileText size={28} className="text-orange" style={{ marginBottom: '6px' }} />
                      <h4 style={{ margin: '0 0 6px' }}>No Document Checklist Initialized Yet</h4>
                      <p style={{ fontSize: '12.5px', color: '#475569', marginBottom: '12px' }}>
                        Initialize the standard 6-item export compliance checklist (Commercial Invoice,
                        Packing List, IEC, HS Codes, Shipping Bill, Certificates) for this booking.
                      </p>
                      <button
                        type="button"
                        className="btn-orange-primary"
                        disabled={busy}
                        onClick={handleInitDocuments}
                      >
                        Initialize Export Document Checklist
                      </button>
                    </div>
                  ) : (
                    checklist.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          padding: '12px 14px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          background:
                            item.status === 'correction_required'
                              ? '#fef2f2'
                              : item.status === 'approved'
                                ? '#f0fdf4'
                                : '#ffffff',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
                              {item.doc_label}
                            </strong>
                            <span className="cargo-tag-chip">
                              {item.is_mandatory ? 'Mandatory' : 'Optional'}
                            </span>
                          </div>
                          <span
                            className={`status-badge status-${
                              item.status === 'approved'
                                ? 'confirmed'
                                : item.status === 'correction_required'
                                  ? 'cancelled'
                                  : 'open'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>

                        {item.help_text && (
                          <div style={{ fontSize: '12px', color: '#475569' }}>{item.help_text}</div>
                        )}

                        {item.correction_reason && (
                          <div
                            style={{
                              padding: '8px 10px',
                              background: '#fee2e2',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              color: '#991b1b',
                              fontSize: '12px',
                            }}
                          >
                            <strong>Correction Required:</strong> {item.correction_reason}
                          </div>
                        )}

                        {/* Reference Number Input + Upload */}
                        <div
                          style={{
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <input
                            type="text"
                            className="form-input"
                            style={{ maxWidth: '280px', padding: '6px 10px', fontSize: '12.5px' }}
                            value={refValues[item.id] ?? ''}
                            onChange={(e) =>
                              setRefValues((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            placeholder={`Enter ${item.doc_label} reference / code...`}
                          />
                          <button
                            type="button"
                            className="btn-secondary-sm"
                            disabled={busy}
                            onClick={() => handleSaveReferenceValue(item)}
                          >
                            Save Reference
                          </button>

                          <label
                            className="btn-secondary-sm"
                            style={{ cursor: busy ? 'not-allowed' : 'pointer', margin: 0 }}
                          >
                            <Upload size={13} />
                            <span>Upload PDF/Image</span>
                            <input
                              type="file"
                              accept=".pdf,image/png,image/jpeg"
                              style={{ display: 'none' }}
                              disabled={busy}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFileUpload(item, f);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>

                        {/* Uploaded Files List */}
                        {Array.isArray(item.uploads) && item.uploads.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {item.uploads.map((up) => (
                              <div
                                key={up.id}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                  fontSize: '12px',
                                  padding: '6px 10px',
                                  background: '#f8fafc',
                                  borderRadius: '6px',
                                }}
                              >
                                <span>
                                  <strong>{up.original_filename}</strong> (
                                  {(Number(up.file_size_bytes) / 1024).toFixed(1)} KB &middot;{' '}
                                  {new Date(up.uploaded_at).toLocaleString()})
                                </span>
                                <a
                                  href={api.getBookingDocumentDownloadUrl(
                                    bookingId,
                                    up.id,
                                    actorUserId
                                  )}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-ghost-sm"
                                  style={{ textDecoration: 'none' }}
                                >
                                  <Download size={13} />
                                  <span>Download</span>
                                </a>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Provider Review Controls */}
                        {role === 'provider' && (
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              marginTop: '4px',
                              paddingTop: '8px',
                              borderTop: '1px dashed #e2e8f0',
                            }}
                          >
                            <button
                              type="button"
                              className="btn-secondary-sm"
                              disabled={busy}
                              onClick={() => handleProviderReviewDocument(item, 'approved')}
                            >
                              <CheckCircle2 size={13} />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              className="btn-ghost-sm"
                              disabled={busy}
                              onClick={() => handleProviderReviewDocument(item, 'waived')}
                            >
                              Waive
                            </button>
                            <input
                              type="text"
                              className="form-input"
                              style={{ maxWidth: '240px', padding: '5px 8px', fontSize: '12px' }}
                              value={correctionReasons[item.id] ?? ''}
                              onChange={(e) =>
                                setCorrectionReasons((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              placeholder="Reason if requesting correction..."
                            />
                            <button
                              type="button"
                              className="btn-danger-sm"
                              disabled={busy}
                              onClick={() =>
                                handleProviderReviewDocument(item, 'correction_required')
                              }
                            >
                              Request Correction
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: MISSED CUT-OFF & ROLLOVER */}
              {activeTab === 'rollover' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {role === 'provider' && (
                    <form
                      onSubmit={handleRecordRollover}
                      style={{
                        padding: '14px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#f8fafc',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <h4 style={{ margin: 0, fontSize: '14px', color: '#0f172a' }}>
                        <ShieldAlert
                          size={15}
                          className="text-orange"
                          style={{ display: 'inline', marginRight: '6px' }}
                        />
                        Record Provider Missed Cut-Off / Rollover Decision
                      </h4>

                      <div className="form-row-3col">
                        <div className="form-group">
                          <label className="form-label">Operator Decision</label>
                          <select
                            className="form-select"
                            value={rollDecision}
                            onChange={(e) => setRollDecision(e.target.value)}
                          >
                            <option value="accept">Accept Late Cargo onto Current Sailing</option>
                            <option value="roll">Roll Booking to Next Sailing Schedule</option>
                            <option value="cancel">
                              Cancel Booking &amp; Restore Listing Capacity
                            </option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label">Affected Cut-Off Milestone (Optional)</label>
                          <select
                            className="form-select"
                            value={rollMissedMilestoneId}
                            onChange={(e) => setRollMissedMilestoneId(e.target.value)}
                          >
                            <option value="">Select milestone...</option>
                            {milestones.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.milestone_name} ({m.status})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label">Rollover / Late Fee (USD)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="form-input"
                            value={rollFee}
                            onChange={(e) => setRollFee(e.target.value)}
                          />
                        </div>
                      </div>

                      {rollDecision === 'roll' && (
                        <div className="form-row-2col">
                          <div className="form-group">
                            <label className="form-label">New Documentation Cut-Off</label>
                            <input
                              type="datetime-local"
                              className="form-input"
                              value={rollNewDocCutoff}
                              onChange={(e) => setRollNewDocCutoff(e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">New Origin CFS Gate-In Cut-Off</label>
                            <input
                              type="datetime-local"
                              className="form-input"
                              value={rollNewCfsGateIn}
                              onChange={(e) => setRollNewCfsGateIn(e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">New Vessel ETD (Required)</label>
                            <input
                              type="datetime-local"
                              className="form-input"
                              value={rollNewEtd}
                              onChange={(e) => setRollNewEtd(e.target.value)}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">New Vessel ETA (Required)</label>
                            <input
                              type="datetime-local"
                              className="form-input"
                              value={rollNewEta}
                              onChange={(e) => setRollNewEta(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                      )}

                      <div className="form-row-2col">
                        <div className="form-group">
                          <label className="form-label">Decision Reason (Required)</label>
                          <input
                            type="text"
                            className="form-input"
                            value={rollReason}
                            onChange={(e) => setRollReason(e.target.value)}
                            placeholder="e.g. Cargo arrived after CFS cut-off; rolled to next weekly vessel"
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Outcome / Revised Terms Note</label>
                          <input
                            type="text"
                            className="form-input"
                            value={rollNotes}
                            onChange={(e) => setRollNotes(e.target.value)}
                            placeholder="Optional operational note for shipper"
                          />
                        </div>
                      </div>

                      <div>
                        <button type="submit" className="btn-orange-primary" disabled={busy}>
                          Record Decision &amp; Notify Shipper
                        </button>
                      </div>
                    </form>
                  )}

                  <div>
                    <h4 className="audit-section-heading">
                      <History size={15} className="text-orange" /> Recorded Rollover &amp; Missed
                      Cut-Off Events ({rolloverEvents.length})
                    </h4>
                    {rolloverEvents.length === 0 ? (
                      <p className="modal-helper-text">
                        No missed cut-off or rollover events recorded for this booking.
                      </p>
                    ) : (
                      <div className="audit-timeline-list">
                        {rolloverEvents.map((ev) => (
                          <div key={ev.id} className="audit-timeline-item">
                            <div className="audit-timeline-dot" />
                            <div className="audit-timeline-content">
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                                Decision: <span className="text-orange">{ev.operator_decision.toUpperCase()}</span>{' '}
                                &middot; Policy Snapshot: <code>{ev.applicable_policy_snapshot}</code>{' '}
                                &middot; Fee: ${Number(ev.rollover_fee_amount).toFixed(2)} {ev.currency}
                              </div>
                              <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px' }}>
                                Reason: <strong>{ev.decision_reason}</strong>
                              </div>
                              {ev.new_etd_at && (
                                <div style={{ fontSize: '12px', color: '#0f766e', marginTop: '2px' }}>
                                  New Sailing ETD: {new Date(ev.new_etd_at).toLocaleString()} &rarr; ETA:{' '}
                                  {new Date(ev.new_eta_at).toLocaleString()}
                                </div>
                              )}
                              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                Decided by {ev.decided_by_name} on{' '}
                                {new Date(ev.decided_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-orange-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
