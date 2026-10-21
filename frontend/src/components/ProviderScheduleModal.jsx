import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  History,
  Save,
} from 'lucide-react';
import { api } from '../api/client';

function toLocalDatetimeValue(isoOrDate, defaultHour = '17:00') {
  if (!isoOrDate) return '';
  const str = String(isoOrDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str}T${defaultHour}`;
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function toIsoFromInput(localDt) {
  if (!localDt) return '';
  const d = new Date(localDt);
  if (Number.isNaN(d.getTime())) return localDt;
  return d.toISOString();
}

export default function ProviderScheduleModal({ listing, providerId, onClose, onSaved }) {
  const listingId = listing?.listing_id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [hasExistingPolicy, setHasExistingPolicy] = useState(false);
  const [dateChangeHistory, setDateChangeHistory] = useState([]);
  const [milestoneTemplates, setMilestoneTemplates] = useState([]);

  const [portTimezone, setPortTimezone] = useState('Asia/Kolkata');
  const [docCutoffAt, setDocCutoffAt] = useState('');
  const [cfsGateInAt, setCfsGateInAt] = useState('');
  const [cfsName, setCfsName] = useState('');
  const [cfsAddress, setCfsAddress] = useState('');
  const [etdAt, setEtdAt] = useState('');
  const [etaAt, setEtaAt] = useState('');
  const [minLeadTimeDays, setMinLeadTimeDays] = useState(3);
  const [rolloverPolicy, setRolloverPolicy] = useState('roll_next_sailing');
  const [rolloverChargeTerms, setRolloverChargeTerms] = useState('');
  const [changeReason, setChangeReason] = useState('');

  const applySampleScheduleFromListing = useCallback(
    (baseListing) => {
      const cutoffYmd = String(baseListing?.cutoff_date || '2026-11-10').slice(0, 10);
      const depYmd = String(baseListing?.departure_date || '2026-11-15').slice(0, 10);
      const arrYmd = String(baseListing?.arrival_date || '2026-12-04').slice(0, 10);

      setPortTimezone('Asia/Kolkata');
      setDocCutoffAt(`${cutoffYmd}T17:00`);
      setCfsGateInAt(`${cutoffYmd}T19:00`);
      setEtdAt(`${depYmd}T10:00`);
      setEtaAt(`${arrYmd}T09:00`);
      setCfsName(
        `${baseListing?.origin_port_name || 'Origin Port'} Container Freight Station (CFS)`
      );
      setCfsAddress(
        `Export Consolidation Shed 4, ${baseListing?.origin_port_name || 'Port'} Terminal Zone`
      );
      setMinLeadTimeDays(3);
      setRolloverPolicy('roll_next_sailing');
      setRolloverChargeTerms(
        'Cargo missing CFS or documentation cut-off is rolled to the next weekly sailing at the same base freight rate; storage applies per tariff.'
      );
    },
    []
  );

  const loadSchedule = useCallback(async () => {
    if (!listingId) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.getListingSchedule(listingId, { provider_id: providerId });
      const data = res.data || {};
      const policy = data.schedule_policy;
      setHasExistingPolicy(Boolean(data.has_schedule_policy && policy));
      setDateChangeHistory(data.date_change_history || []);
      setMilestoneTemplates(data.milestone_templates || []);

      if (policy) {
        setPortTimezone(policy.port_timezone || 'Asia/Kolkata');
        setDocCutoffAt(toLocalDatetimeValue(policy.doc_cutoff_at, '17:00'));
        setCfsGateInAt(toLocalDatetimeValue(policy.cfs_gate_in_at, '18:00'));
        setCfsName(policy.cfs_name || '');
        setCfsAddress(policy.cfs_address || '');
        setEtdAt(toLocalDatetimeValue(policy.etd_at, '10:00'));
        setEtaAt(toLocalDatetimeValue(policy.eta_at, '09:00'));
        setMinLeadTimeDays(Number(policy.min_lead_time_days ?? 3));
        setRolloverPolicy(policy.rollover_policy || 'roll_next_sailing');
        setRolloverChargeTerms(policy.rollover_charge_terms || '');
      } else {
        applySampleScheduleFromListing(listing);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to load listing schedule policy.',
      });
    } finally {
      setLoading(false);
    }
  }, [listingId, providerId, listing, applySampleScheduleFromListing]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        reason: changeReason.trim() || undefined,
        schedule_policy: {
          port_timezone: portTimezone,
          doc_cutoff_at: toIsoFromInput(docCutoffAt),
          cfs_gate_in_at: toIsoFromInput(cfsGateInAt),
          cfs_name: cfsName.trim(),
          cfs_address: cfsAddress.trim(),
          etd_at: toIsoFromInput(etdAt),
          eta_at: toIsoFromInput(etaAt),
          min_lead_time_days: Number(minLeadTimeDays),
          rollover_policy: rolloverPolicy,
          rollover_charge_terms: rolloverChargeTerms.trim() || null,
        },
      };

      const res = await api.saveListingSchedule(providerId, listingId, payload);
      const updated = res.data || {};
      setHasExistingPolicy(true);
      setDateChangeHistory(updated.date_change_history || []);
      setMilestoneTemplates(updated.milestone_templates || []);
      setChangeReason('');
      setFeedback({
        type: 'success',
        text: 'Listing schedule policy, CFS cut-offs, and milestone templates saved.',
      });
      if (onSaved) onSaved(updated);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to save listing schedule policy.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !saving && onClose()}>
      <div
        className="modal-card modal-card-lg"
        style={{ maxWidth: '880px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <span className="modal-eyebrow">
              LISTING #{listingId} &middot; {listing?.origin_port_code} &rarr;{' '}
              {listing?.destination_port_code}
            </span>
            <h3 className="modal-title">
               Operational Schedule, CFS Cut-Offs &amp; Rollover Policy
            </h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave}>
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
              <p className="modal-helper-text">Loading listing schedule policy...</p>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '10px 14px',
                  }}
                >
                  <div style={{ fontSize: '12.5px', color: '#334155' }}>
                    <strong>Status:</strong>{' '}
                    {hasExistingPolicy ? (
                      <span style={{ color: '#0f766e', fontWeight: 600 }}>
                        Configured ({milestoneTemplates.length} Operational Milestones Active)
                      </span>
                    ) : (
                      <span style={{ color: '#b45309', fontWeight: 600 }}>
                        Not Yet Configured (Pre-filled from listing dates; click Save to activate)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-preset-chip"
                    onClick={() => applySampleScheduleFromListing(listing)}
                  >
                    <Sparkles size={13} />
                    <span>Reset From Listing Dates</span>
                  </button>
                </div>

                {/* CFS Facility Details */}
                <div className="form-row-2col">
                  <div className="form-group">
                    <label className="form-label">
                      <MapPin size={13} style={{ display: 'inline', marginRight: '4px' }} />
                      Origin CFS Facility Name
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={cfsName}
                      onChange={(e) => setCfsName(e.target.value)}
                      placeholder="e.g. Nhava Sheva Speedy Multimodes CFS"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Origin CFS Gate-In Address</label>
                    <input
                      type="text"
                      className="form-input"
                      value={cfsAddress}
                      onChange={(e) => setCfsAddress(e.target.value)}
                      placeholder="Full address for cargo delivery & tallying"
                      required
                    />
                  </div>
                </div>

                {/* Timezone & Lead Time & Rollover Policy */}
                <div className="form-row-3col">
                  <div className="form-group">
                    <label className="form-label">Port Timezone (IANA)</label>
                    <select
                      className="form-select"
                      value={portTimezone}
                      onChange={(e) => setPortTimezone(e.target.value)}
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+05:30)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT, UTC+08:00)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST, UTC+04:00)</option>
                      <option value="Europe/Rotterdam">Europe/Rotterdam (CET)</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Minimum Booking Lead Time (Days)</label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      className="form-input"
                      value={minLeadTimeDays}
                      onChange={(e) => setMinLeadTimeDays(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Missed Cut-Off / Rollover Policy</label>
                    <select
                      className="form-select"
                      value={rolloverPolicy}
                      onChange={(e) => setRolloverPolicy(e.target.value)}
                    >
                      <option value="roll_next_sailing">
                        Roll to Next Sailing (Same Base Price)
                      </option>
                      <option value="accept_late_with_fee">
                        Accept Late / Re-Quote with Fee
                      </option>
                      <option value="cancel_if_missed">
                        Cancel Booking Under Stated Terms
                      </option>
                    </select>
                  </div>
                </div>

                {/* Cut-off and ETD/ETA timestamps */}
                <div className="form-row-2col">
                  <div className="form-group">
                    <label className="form-label">
                      <Clock size={13} style={{ display: 'inline', marginRight: '4px' }} />
                      Documentation &amp; SI Cut-Off
                    </label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={docCutoffAt}
                      onChange={(e) => setDocCutoffAt(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <Clock size={13} style={{ display: 'inline', marginRight: '4px' }} />
                      Origin CFS Cargo Gate-In Cut-Off
                    </label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={cfsGateInAt}
                      onChange={(e) => setCfsGateInAt(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row-2col">
                  <div className="form-group">
                    <label className="form-label">
                      <Calendar size={13} style={{ display: 'inline', marginRight: '4px' }} />
                      Estimated Vessel Departure (ETD)
                    </label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={etdAt}
                      onChange={(e) => setEtdAt(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <Calendar size={13} style={{ display: 'inline', marginRight: '4px' }} />
                      Estimated Vessel Arrival (ETA)
                    </label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={etaAt}
                      onChange={(e) => setEtaAt(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Rollover &amp; Late Gate-In Charge Terms</label>
                  <input
                    type="text"
                    className="form-input"
                    value={rolloverChargeTerms}
                    onChange={(e) => setRolloverChargeTerms(e.target.value)}
                    placeholder="e.g. Cargo missing CFS cut-off is rolled to next sailing; CFS storage applies after 3 free days."
                  />
                </div>

                {hasExistingPolicy && (
                  <div
                    className="form-group"
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '8px',
                      padding: '10px 12px',
                    }}
                  >
                    <label className="form-label" style={{ color: '#92400e' }}>
                      <ShieldAlert
                        size={14}
                        style={{ display: 'inline', marginRight: '5px', verticalAlign: 'middle' }}
                      />
                      Reason for Deadline Change (Required by PostgreSQL Trigger if any date/time changes)
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={changeReason}
                      onChange={(e) => setChangeReason(e.target.value)}
                      placeholder="e.g. Vessel berthing delayed by 12h at origin port; extended CFS gate-in window"
                    />
                  </div>
                )}

                {dateChangeHistory.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <h4 className="audit-section-heading" style={{ marginBottom: '8px' }}>
                      <History size={15} className="text-orange" /> Listing Date-Change Audit Log (
                      {dateChangeHistory.length})
                    </h4>
                    <div className="audit-timeline-list" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                      {dateChangeHistory.map((h) => (
                        <div key={h.id} className="audit-timeline-item">
                          <div className="audit-timeline-dot" />
                          <div className="audit-timeline-content">
                            <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}>
                              <code>{h.field_name}</code>:{' '}
                              {h.old_due_at ? new Date(h.old_due_at).toLocaleString() : 'N/A'} &rarr;{' '}
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
              </>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary-outline"
              onClick={onClose}
              disabled={saving}
            >
              Close
            </button>
            <button type="submit" className="btn-orange-primary" disabled={saving || loading}>
              <Save size={15} />
              <span>{saving ? 'Saving Schedule...' : 'Save Schedule & Milestones'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
