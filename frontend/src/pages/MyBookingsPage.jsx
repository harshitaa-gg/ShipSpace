import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Calendar,
  ArrowRight,
  Box,
  Scale,
  Building2,
  History,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  Search,
  X,
  Clock,
  Lock,
} from 'lucide-react';
import { api } from '../api/client';
import { useIdentity } from '../context/IdentityContext';
import { SavedBookingSnapshotBreakdown } from '../components/ItemisedCostBreakdown';

export default function MyBookingsPage() {
  const {
    traders,
    selectedTraderId,
    setSelectedTraderId,
    activeTrader,
    refreshCatalog,
  } = useIdentity();

  const [bookings, setBookings] = useState([]);
  const [bookingDetailsMap, setBookingDetailsMap] = useState({});
  const [expandedSnapshotId, setExpandedSnapshotId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [feedbackBanner, setFeedbackBanner] = useState(null);

  // Detail & audit history modal state
  const [inspectedBooking, setInspectedBooking] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Cancellation confirmation modal state
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const loadBookings = useCallback(async () => {
    if (!selectedTraderId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getTraderBookings(selectedTraderId, {
        status: statusFilter || undefined,
      });
      const rows = res.data || [];
      setBookings(rows);

      // Hydrate frozen financial snapshots from GET /api/bookings/:bookingId
      const settled = await Promise.allSettled(
        rows.map((b) => api.getBookingDetails(b.booking_id))
      );
      const nextMap = {};
      settled.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value?.data) {
          nextMap[rows[idx].booking_id] = result.value.data;
        }
      });
      setBookingDetailsMap(nextMap);
    } catch (err) {
      setErrorMsg(err.message || 'Unable to load bookings for this trader.');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTraderId, statusFilter]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const summaryMetrics = useMemo(() => {
    const totalCount = bookings.length;
    const confirmedCount = bookings.filter((b) => b.booking_status === 'confirmed').length;
    const activeCbm = bookings
      .filter((b) => b.booking_status === 'confirmed' || b.booking_status === 'completed')
      .reduce((acc, b) => acc + Number(b.booked_cbm || 0), 0);
    const totalValue = bookings
      .filter((b) => b.booking_status !== 'cancelled')
      .reduce((acc, b) => {
        const detail = bookingDetailsMap[b.booking_id];
        const frozenTotal = detail?.itemised_cost_summary?.total_all_in_cost ?? b.total_price;
        return acc + Number(frozenTotal || 0);
      }, 0);

    return {
      totalCount,
      confirmedCount,
      activeCbm: activeCbm.toFixed(2),
      totalValue: totalValue.toFixed(2),
    };
  }, [bookings, bookingDetailsMap]);

  const filteredBookings = useMemo(() => {
    if (!searchQuery.trim()) return bookings;
    const q = searchQuery.toLowerCase().trim();
    return bookings.filter((b) => {
      return (
        String(b.booking_id).includes(q) ||
        String(b.listing_id).includes(q) ||
        (b.origin_port_code || '').toLowerCase().includes(q) ||
        (b.origin_port_name || '').toLowerCase().includes(q) ||
        (b.destination_port_code || '').toLowerCase().includes(q) ||
        (b.destination_port_name || '').toLowerCase().includes(q) ||
        (b.provider_company || b.provider_name || '').toLowerCase().includes(q) ||
        (b.cargo_type_name || '').toLowerCase().includes(q)
      );
    });
  }, [bookings, searchQuery]);

  const handleToggleSnapshot = async (bookingId) => {
    if (expandedSnapshotId === bookingId) {
      setExpandedSnapshotId(null);
      return;
    }
    setExpandedSnapshotId(bookingId);
    if (!bookingDetailsMap[bookingId]) {
      try {
        const res = await api.getBookingDetails(bookingId);
        if (res.data) {
          setBookingDetailsMap((prev) => ({ ...prev, [bookingId]: res.data }));
        }
      } catch (_err) {
        // Handled gracefully by fallback
      }
    }
  };

  const handleInspectBooking = async (bookingId) => {
    setInspectLoading(true);
    setInspectedBooking({ booking_id: bookingId, loading: true });
    try {
      const res = await api.getBookingDetails(bookingId);
      setInspectedBooking(res.data);
      if (res.data) {
        setBookingDetailsMap((prev) => ({ ...prev, [bookingId]: res.data }));
      }
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        text: err.message || `Failed to load audit trail for booking #${bookingId}.`,
      });
      setInspectedBooking(null);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setFeedbackBanner(null);

    try {
      const res = await api.cancelTraderBooking(cancelTarget.booking_id, selectedTraderId);
      setFeedbackBanner({
        type: 'success',
        text: `Booking #${cancelTarget.booking_id} cancelled. Restored ${cancelTarget.booked_cbm} CBM and ${cancelTarget.booked_weight}t capacity back to the listing.`,
      });
      setCancelTarget(null);
      await loadBookings();
      refreshCatalog();
      if (inspectedBooking && inspectedBooking.booking_id === cancelTarget.booking_id) {
        setInspectedBooking(res.data);
      }
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        text: err.message || 'Cancellation rejected by database.',
      });
      setCancelTarget(null);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="workspace-page">
      {/* Header Banner */}
      <div className="workspace-hero-banner">
        <div className="workspace-banner-inner">
          <div>
            <nav className="workspace-breadcrumb" aria-label="Breadcrumb">
              <Link to="/" className="breadcrumb-link">ShipSpace</Link>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-link">Trader Workspace</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">My Bookings</span>
            </nav>
            <div className="section-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text">TRADER SHIPMENT MANAGEMENT</span>
            </div>
            <h1 className="workspace-title">My LCL Cargo Bookings</h1>
            <p className="workspace-subtitle">
              Track confirmed shipments, inspect shipment status history, or cancel active
              reservations with automatic capacity restoration.
            </p>
          </div>

          {/* Trader Account Switcher inside Page Header */}
          <div className="workspace-switcher-box">
            <label htmlFor="trader-page-select" className="switcher-label">
              <UserCheck size={14} className="text-orange" /> Active Trader Account
            </label>
            <select
              id="trader-page-select"
              className="switcher-select"
              value={selectedTraderId}
              onChange={(e) => setSelectedTraderId(Number(e.target.value))}
            >
              {traders.map((t) => (
                <option key={t.user_id} value={t.user_id}>
                  #{t.user_id} — {t.company_name || t.name} ({t.name})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="workspace-container">
        {/* KPI Summary Cards */}
        <div className="kpi-grid-4">
          <div className="kpi-card">
            <span className="kpi-label">Trader Account</span>
            <strong className="kpi-value kpi-value-sm">
              {activeTrader?.company_name || activeTrader?.name || `Trader #${selectedTraderId}`}
            </strong>
            <span className="kpi-sub">{activeTrader?.email}</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Bookings Shown</span>
            <strong className="kpi-value">{summaryMetrics.totalCount}</strong>
            <span className="kpi-sub">{summaryMetrics.confirmedCount} Confirmed Active</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Active Volume Booked</span>
            <strong className="kpi-value">{summaryMetrics.activeCbm} CBM</strong>
            <span className="kpi-sub">Confirmed &amp; Completed</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Active Freight Value</span>
            <strong className="kpi-value text-orange">
              ${Number(summaryMetrics.totalValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </strong>
            <span className="kpi-sub">Excludes cancelled bookings</span>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackBanner && (
          <div
            className={`alert-banner ${
              feedbackBanner.type === 'success' ? 'alert-success' : 'alert-error'
            }`}
            role="status"
          >
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 size={20} />
            ) : (
              <AlertTriangle size={20} />
            )}
            <div className="alert-content-grow">
              <p>{feedbackBanner.text}</p>
            </div>
            <button
              type="button"
              className="alert-dismiss-btn"
              onClick={() => setFeedbackBanner(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="section-toolbar-card">
          <div className="status-filter-pills">
            {[
              { value: '', label: 'All Bookings' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ].map((tab) => (
              <button
                key={tab.value || 'all'}
                type="button"
                className={`filter-tab-btn ${statusFilter === tab.value ? 'active' : ''}`}
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="table-search-box">
            <Search size={14} style={{ color: '#94a3b8' }} />
            <input
              type="text"
              className="table-search-input"
              placeholder="Search by route, port, provider..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                onClick={() => setSearchQuery('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="toolbar-right-actions">
            <button
              type="button"
              className="btn-secondary-sm"
              onClick={loadBookings}
              disabled={loading}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <Link to="/search" className="btn-orange-primary btn-sm">
              <Search size={14} />
              <span>New Booking</span>
            </Link>
          </div>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="alert-banner alert-error">
            <AlertTriangle size={18} />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Bookings List */}
        {loading ? (
          <div className="bookings-stack">
            {[1, 2, 3].map((n) => (
              <div key={n} className="booking-row-card skeleton-card">
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line skeleton-body" />
              </div>
            ))}
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="empty-state-card">
            <FileText size={38} className="text-orange" />
            <h3>No Bookings Found</h3>
            <p>
              {searchQuery
                ? `No shipments matching "${searchQuery}" for ${activeTrader?.company_name || `Trader #${selectedTraderId}`}.`
                : `No shipments found under "${statusFilter || 'all'}" status for ${activeTrader?.company_name || `Trader #${selectedTraderId}`}.`}
            </p>
            {searchQuery ? (
              <button type="button" className="btn-secondary-outline" onClick={() => setSearchQuery('')}>
                Clear Search Filter
              </button>
            ) : (
              <Link to="/search" className="btn-orange-primary">
                Search Available LCL Capacity <ArrowRight size={15} />
              </Link>
            )}
          </div>
        ) : (
          <div className="bookings-stack">
            {filteredBookings.map((b) => {
              const canCancel =
                b.booking_status === 'confirmed' || b.booking_status === 'pending';
              const detail = bookingDetailsMap[b.booking_id] || null;
              const summary = detail?.itemised_cost_summary || null;
              const isItemised = detail ? !detail.is_legacy_booking : false;
              const displayTotal = isItemised
                ? Number(summary?.total_all_in_cost ?? b.total_price)
                : Number(b.total_price);

              return (
                <article key={b.booking_id} className="booking-row-card">
                  <div className="booking-row-header">
                    <div className="booking-id-group">
                      <span className="booking-ref-badge">Booking #{b.booking_id}</span>
                      <span className={`status-badge status-${b.booking_status}`}>
                        {b.booking_status}
                      </span>
                      <span className="booking-listing-ref">
                        Listing #{b.listing_id} ({b.listing_status})
                      </span>
                      {detail && (
                        <span
                          className={`cost-mode-pill ${
                            isItemised ? 'cost-mode-itemised' : 'cost-mode-legacy'
                          }`}
                        >
                          {isItemised
                            ? `${detail.charge_snapshots?.length || 0} Frozen Charge Lines`
                            : 'Legacy Base Freight'}
                        </span>
                      )}
                    </div>

                    <div className="booking-timestamp">
                      <Clock size={13} />
                      <span>Booked {new Date(b.booking_date).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="booking-row-body">
                    {/* Route */}
                    <div className="booking-route-col">
                      <div className="booking-ports-inline">
                        <span className="port-code-badge">{b.origin_port_code}</span>
                        <strong>{b.origin_port_name}</strong>
                        <ArrowRight size={15} className="text-orange" />
                        <span className="port-code-badge">{b.destination_port_code}</span>
                        <strong>{b.destination_port_name}</strong>
                      </div>
                      <div className="booking-provider-sub">
                        <Building2 size={14} className="text-muted" />
                        <span>Provider: <strong>{b.provider_company || b.provider_name}</strong></span>
                        <span className="dot-sep">&bull;</span>
                        <span>Cargo: <strong>{b.cargo_type_name}</strong></span>
                      </div>
                    </div>

                    {/* Schedule */}
                    <div className="booking-dates-col">
                      <div>
                        <span className="metric-caption">Departure</span>
                        <strong>{new Date(b.departure_date).toLocaleDateString()}</strong>
                      </div>
                      <div>
                        <span className="metric-caption">Arrival</span>
                        <strong>{new Date(b.arrival_date).toLocaleDateString()}</strong>
                      </div>
                    </div>

                    {/* Quantities */}
                    <div className="booking-quantities-col">
                      <div className="qty-chip">
                        <Box size={14} className="text-orange" />
                        <span>{Number(b.booked_cbm).toFixed(2)} CBM</span>
                      </div>
                      <div className="qty-chip">
                        <Scale size={14} className="text-orange" />
                        <span>
                          {Number(b.booked_weight).toFixed(2)} t (
                          {Math.round(Number(b.booked_weight) * 1000).toLocaleString()} kg)
                        </span>
                      </div>
                    </div>

                    {/* Total & Actions */}
                    <div className="booking-actions-col">
                      <div className="booking-price-display">
                        <span className="metric-caption">
                          {isItemised ? 'Frozen All-In Total' : 'Total Charged'}
                        </span>
                        <strong className="booking-price-amount">
                          ${displayTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </strong>
                        {isItemised && (
                          <span className="text-muted-sm">
                            Base: ${Number(b.total_price).toFixed(2)}
                          </span>
                        )}
                      </div>

                      <div className="booking-btn-group">
                        <button
                          type="button"
                          className="btn-secondary-sm"
                          onClick={() => handleToggleSnapshot(b.booking_id)}
                        >
                          <Lock size={13} />
                          <span>
                            {expandedSnapshotId === b.booking_id
                              ? 'Hide Snapshot'
                              : 'Cost Snapshot'}
                          </span>
                        </button>

                        <button
                          type="button"
                          className="btn-secondary-sm"
                          onClick={() => handleInspectBooking(b.booking_id)}
                        >
                          <History size={14} />
                          <span>Audit Trail</span>
                        </button>

                        {canCancel && (
                          <button
                            type="button"
                            className="btn-danger-sm"
                            onClick={() => setCancelTarget(b)}
                          >
                            <XCircle size={14} />
                            <span>Cancel</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {expandedSnapshotId === b.booking_id && (
                    <div style={{ marginTop: '12px' }}>
                      <SavedBookingSnapshotBreakdown booking={detail || b} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel Booking Confirmation Modal */}
      {cancelTarget && (
        <div className="modal-backdrop" onClick={() => !cancelling && setCancelTarget(null)}>
          <div
            className="modal-card modal-card-sm confirm-dialog-danger"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">CONFIRM CANCELLATION</span>
                <h3 className="modal-title">Cancel Booking #{cancelTarget.booking_id}?</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCancelTarget(null)}
                disabled={cancelling}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="confirm-warning-box">
                <AlertTriangle size={18} className="confirm-warning-icon" />
                <div>
                  <strong>Are you sure you want to cancel this reservation?</strong>
                  <p style={{ marginTop: '3px', fontSize: '12px' }}>
                    This action will immediately release reserved freight capacity back to the provider's active listing.
                  </p>
                </div>
              </div>

              <div className="confirm-details-card">
                <div className="confirm-details-row">
                  <span>Shipment Route</span>
                  <strong>{cancelTarget.origin_port_code} &rarr; {cancelTarget.destination_port_code}</strong>
                </div>
                <div className="confirm-details-row">
                  <span>Capacity Released</span>
                  <strong>{cancelTarget.booked_cbm} CBM &middot; {cancelTarget.booked_weight} tonnes</strong>
                </div>
                <div className="confirm-details-row">
                  <span>Freight Total</span>
                  <strong>${Number(cancelTarget.total_price || 0).toFixed(2)}</strong>
                </div>
              </div>

              <p className="modal-helper-text" style={{ fontSize: '12px' }}>
                Once cancelled, the reserved capacity will be immediately returned to the listing and a status change record will be created.
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary-outline"
                onClick={() => setCancelTarget(null)}
                disabled={cancelling}
              >
                Keep Booking
              </button>
              <button
                type="button"
                className="btn-sm-action btn-action-danger"
                style={{ padding: '9px 18px', fontSize: '13px' }}
                onClick={handleConfirmCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Releasing Capacity...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Booking Details & Audit History Modal */}
      {inspectedBooking && (
        <div className="modal-backdrop" onClick={() => setInspectedBooking(null)}>
          <div
            className="modal-card modal-card-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">BOOKING DETAILS &amp; HISTORY</span>
                <h3 className="modal-title">Booking #{inspectedBooking.booking_id} Details</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setInspectedBooking(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {inspectLoading || inspectedBooking.loading ? (
                <p>Loading booking details and status history...</p>
              ) : (
                <>
                  <div className="booking-receipt-grid">
                    <div className="receipt-item">
                      <span className="receipt-label">Current Status</span>
                      <span className={`status-badge status-${inspectedBooking.booking_status}`}>
                        {inspectedBooking.booking_status}
                      </span>
                    </div>
                    <div className="receipt-item">
                      <span className="receipt-label">Trader</span>
                      <span className="receipt-value">
                        {inspectedBooking.trader_company || inspectedBooking.trader_name}
                      </span>
                    </div>
                    <div className="receipt-item">
                      <span className="receipt-label">Provider</span>
                      <span className="receipt-value">
                        {inspectedBooking.provider_company || inspectedBooking.provider_name}
                      </span>
                    </div>
                    <div className="receipt-item">
                      <span className="receipt-label">Route</span>
                      <span className="receipt-value">
                        {inspectedBooking.origin_port_code} &rarr;{' '}
                        {inspectedBooking.destination_port_code}
                      </span>
                    </div>
                    <div className="receipt-item">
                      <span className="receipt-label">Booked Capacity</span>
                      <span className="receipt-value">
                        {inspectedBooking.booked_cbm} CBM / {inspectedBooking.booked_weight} t
                      </span>
                    </div>
                    <div className="receipt-item">
                      <span className="receipt-label">Base Freight (booking.total_price)</span>
                      <span className="receipt-value">
                        ${Number(inspectedBooking.total_price).toFixed(2)} USD
                      </span>
                    </div>
                  </div>

                  {/* Frozen Booking Price Snapshot */}
                  <SavedBookingSnapshotBreakdown booking={inspectedBooking} />

                  <h4 className="audit-section-heading">
                    <History size={16} className="text-orange" /> Status History Timeline
                  </h4>

                  {!inspectedBooking.status_history ||
                  inspectedBooking.status_history.length === 0 ? (
                    <p className="modal-helper-text">No status transition history entries found.</p>
                  ) : (
                    <div className="audit-timeline-list">
                      {inspectedBooking.status_history.map((h) => (
                        <div key={h.history_id} className="audit-timeline-item">
                          <div className="audit-timeline-dot" />
                          <div className="audit-timeline-content">
                            <div className="audit-transition-line">
                              <span className="audit-old-status">
                                {h.old_status || 'INITIAL CREATE'}
                              </span>
                              <ArrowRight size={13} />
                              <span className={`status-badge status-${h.new_status}`}>
                                {h.new_status}
                              </span>
                              <span className="audit-id-tag">History #{h.history_id}</span>
                            </div>
                            <span className="audit-timestamp">
                              {new Date(h.changed_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-orange-primary"
                onClick={() => setInspectedBooking(null)}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
