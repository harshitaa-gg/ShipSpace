import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  PlusCircle,
  Ship,
  PackageCheck,
  Calendar,
  Box,
  Scale,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  X,
  Search,
  Clock,
  Lock,
  SlidersHorizontal,
} from 'lucide-react';
import { api } from '../api/client';
import { useIdentity } from '../context/IdentityContext';
import ProviderPricingModal from '../components/ProviderPricingModal';

export function isListingCutoffValid(cutoffValue, nowDate = new Date()) {
  if (!cutoffValue) return false;
  const todayYmd = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(nowDate.getDate()).padStart(2, '0')}`;

  if (typeof cutoffValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cutoffValue.trim())) {
    return cutoffValue.trim() >= todayYmd;
  }

  const parsed = new Date(cutoffValue);
  if (Number.isNaN(parsed.getTime())) return false;
  const cutoffYmd = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(parsed.getDate()).padStart(2, '0')}`;
  return cutoffYmd >= todayYmd;
}

export function getListingStatusActions(item, nowDate = new Date()) {
  const availCbmVal = parseFloat(item?.available_cbm ?? 0);
  const availWeightVal = parseFloat(item?.available_weight ?? 0);
  const cutoffValid = isListingCutoffValid(item?.cutoff_date, nowDate);
  const status = item?.status;

  const activeOrCompletedBookings =
    Number(item?.active_booking_count || 0) +
    Number(item?.confirmed_booking_count || 0) +
    Number(item?.completed_booking_count || 0);

  const canReopen =
    status !== 'open' &&
    status !== 'cancelled' &&
    availCbmVal > 0 &&
    availWeightVal > 0 &&
    cutoffValid;

  const canClose = status === 'open';

  const canCancel = status !== 'cancelled' && activeOrCompletedBookings === 0;

  return { canReopen, canClose, canCancel, availCbmVal, availWeightVal, cutoffValid };
}

export default function ProviderDashboardPage() {
  const {
    providers,
    selectedProviderId,
    setSelectedProviderId,
    activeProvider,
    routes,
    cargoTypes,
    refreshCatalog,
  } = useIdentity();

  const [activeTab, setActiveTab] = useState('listings'); // 'listings' | 'create' | 'bookings'
  const [listings, setListings] = useState([]);
  const [listingStatusFilter, setListingStatusFilter] = useState('');
  const [listingSearchQuery, setListingSearchQuery] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('');
  const [utilizationMeta, setUtilizationMeta] = useState(null);
  const [providerBookings, setProviderBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [updatingListingId, setUpdatingListingId] = useState(null);
  const [cancellingBookingId, setCancellingBookingId] = useState(null);

  // Cancellation modal states
  const [cancelBookingTarget, setCancelBookingTarget] = useState(null);
  const [cancelBookingReason, setCancelBookingReason] = useState('Voyage schedule adjustment');
  const [cancelListingTarget, setCancelListingTarget] = useState(null);

  // Feature A: Itemised Pricing Editor Modal state
  const [pricingEditorListing, setPricingEditorListing] = useState(null);
  const [openPricingAfterCreate, setOpenPricingAfterCreate] = useState(false);

  // Create Listing Form State (includes cutoff_date <= departure_date < arrival_date)
  const [routeId, setRouteId] = useState('');
  const [cutoffDate, setCutoffDate] = useState('2026-11-10');
  const [departureDate, setDepartureDate] = useState('2026-11-15');
  const [arrivalDate, setArrivalDate] = useState('2026-12-04');
  const [totalCbm, setTotalCbm] = useState('45');
  const [totalWeight, setTotalWeight] = useState('24');
  const [pricePerCbm, setPricePerCbm] = useState('92');
  const [pricePerTonne, setPricePerTonne] = useState('115');
  const [minimumCharge, setMinimumCharge] = useState('260');
  const [selectedCargoTypeIds, setSelectedCargoTypeIds] = useState([1, 5]);
  const [creatingListing, setCreatingListing] = useState(false);

  const loadProviderWorkspace = useCallback(async () => {
    if (!selectedProviderId) return;
    setLoading(true);
    try {
      const [listingsRes, bookingsRes] = await Promise.all([
        api.getProviderListings(selectedProviderId),
        api.getProviderBookings(selectedProviderId),
      ]);
      setListings(listingsRes.data || []);
      setUtilizationMeta(listingsRes.meta?.utilization || null);
      setProviderBookings(bookingsRes.data || []);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to load provider dashboard data.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedProviderId]);

  useEffect(() => {
    loadProviderWorkspace();
  }, [loadProviderWorkspace]);

  // Default route selection once routes load
  useEffect(() => {
    if (!routeId && routes.length > 0) {
      setRouteId(String(routes[0].route_id));
    }
  }, [routes, routeId]);

  const toggleCargoTypeCheckbox = (id) => {
    const numId = Number(id);
    setSelectedCargoTypeIds((prev) =>
      prev.includes(numId) ? prev.filter((item) => item !== numId) : [...prev, numId]
    );
  };

  const handleCreateListing = async (e) => {
    e.preventDefault();
    setFeedback(null);

    if (!routeId) {
      setFeedback({ type: 'error', text: 'Please select a shipping route.' });
      return;
    }
    if (selectedCargoTypeIds.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Please select at least one supported cargo classification.',
      });
      return;
    }

    setCreatingListing(true);
    try {
      const res = await api.createProviderListing({
        provider_id: Number(selectedProviderId),
        route_id: Number(routeId),
        cutoff_date: cutoffDate,
        departure_date: departureDate,
        arrival_date: arrivalDate,
        total_cbm: Number(totalCbm),
        total_weight: Number(totalWeight),
        price_per_cbm: Number(pricePerCbm),
        price_per_tonne: Number(pricePerTonne),
        minimum_charge: Number(minimumCharge),
        cargo_type_ids: selectedCargoTypeIds,
      });

      setFeedback({
        type: 'success',
        text: `Published new Capacity Listing #${res.data.listing_id} (${res.data.origin_port_code} → ${res.data.destination_port_code}) with ${res.data.total_cbm} CBM.`,
      });
      await loadProviderWorkspace();
      refreshCatalog();
      setActiveTab('listings');
      if (openPricingAfterCreate && res.data) {
        setPricingEditorListing(res.data);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to publish capacity listing.',
      });
    } finally {
      setCreatingListing(false);
    }
  };

  const handleStatusChange = async (listingId, newStatus) => {
    setUpdatingListingId(listingId);
    setFeedback(null);
    try {
      await api.updateProviderListingStatus(listingId, {
        provider_id: Number(selectedProviderId),
        status: newStatus,
      });
      setFeedback({
        type: 'success',
        text: `Updated Listing #${listingId} status to "${newStatus}".`,
      });
      await loadProviderWorkspace();
      refreshCatalog();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || `Could not update Listing #${listingId} status.`,
      });
      await loadProviderWorkspace();
    } finally {
      setUpdatingListingId(null);
    }
  };

  const isDateOrderValid = useMemo(() => {
    if (!cutoffDate || !departureDate || !arrivalDate) return false;
    return cutoffDate <= departureDate && departureDate < arrivalDate;
  }, [cutoffDate, departureDate, arrivalDate]);

  const filteredListings = useMemo(() => {
    let rows = listings;
    if (listingStatusFilter) {
      rows = rows.filter((l) => l.status === listingStatusFilter);
    }
    if (listingSearchQuery.trim()) {
      const q = listingSearchQuery.toLowerCase().trim();
      rows = rows.filter((l) => {
        return (
          String(l.listing_id).includes(q) ||
          (l.route_code || '').toLowerCase().includes(q) ||
          (l.origin_port_code || '').toLowerCase().includes(q) ||
          (l.origin_port_name || '').toLowerCase().includes(q) ||
          (l.destination_port_code || '').toLowerCase().includes(q) ||
          (l.destination_port_name || '').toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [listings, listingStatusFilter, listingSearchQuery]);

  const filteredProviderBookings = useMemo(() => {
    if (!bookingStatusFilter) return providerBookings;
    return providerBookings.filter((b) => b.booking_status === bookingStatusFilter);
  }, [providerBookings, bookingStatusFilter]);

  const executeProviderCancelBooking = async () => {
    if (!cancelBookingTarget) return;
    setCancellingBookingId(cancelBookingTarget.booking_id);
    setFeedback(null);
    try {
      await api.cancelProviderBooking(
        cancelBookingTarget.booking_id,
        Number(selectedProviderId),
        cancelBookingReason
      );
      setFeedback({
        type: 'success',
        text: `Cancelled Booking #${cancelBookingTarget.booking_id} and restored ${cancelBookingTarget.booked_cbm} CBM to Listing #${cancelBookingTarget.listing_id}.`,
      });
      setCancelBookingTarget(null);
      await loadProviderWorkspace();
      refreshCatalog();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Could not cancel booking.',
      });
      setCancelBookingTarget(null);
    } finally {
      setCancellingBookingId(null);
    }
  };

  const executeCancelListing = async () => {
    if (!cancelListingTarget) return;
    const listingId = cancelListingTarget.listing_id;
    setUpdatingListingId(listingId);
    setFeedback(null);
    try {
      await api.updateProviderListingStatus(listingId, {
        provider_id: Number(selectedProviderId),
        status: 'cancelled',
      });
      setFeedback({
        type: 'success',
        text: `Cancelled Listing #${listingId}.`,
      });
      setCancelListingTarget(null);
      await loadProviderWorkspace();
      refreshCatalog();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || `Could not cancel Listing #${listingId}.`,
      });
      setCancelListingTarget(null);
      await loadProviderWorkspace();
    } finally {
      setUpdatingListingId(null);
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
              <span className="breadcrumb-link">Provider Workspace</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">Capacity Management</span>
            </nav>
            <div className="section-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text">LOGISTICS PROVIDER PORTAL</span>
            </div>
            <h1 className="workspace-title">Provider Capacity &amp; Booking Operations</h1>
            <p className="workspace-subtitle">
              Publish LCL container space, monitor fleet utilization, and manage trader bookings.
            </p>
          </div>

          <div className="workspace-switcher-box">
            <label htmlFor="provider-page-select" className="switcher-label">
              <Building2 size={14} className="text-orange" /> Active Logistics Provider
            </label>
            <select
              id="provider-page-select"
              className="switcher-select"
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(Number(e.target.value))}
            >
              {providers.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  #{p.user_id} — {p.company_name || p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="workspace-container">
        {/* Provider Utilization KPI Strip */}
        <div className="kpi-grid-4">
          <div className="kpi-card">
            <span className="kpi-label">Active Provider</span>
            <strong className="kpi-value kpi-value-sm">
              {activeProvider?.company_name || activeProvider?.name || `Provider #${selectedProviderId}`}
            </strong>
            <span className="kpi-sub">{activeProvider?.email}</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Capacity Listings</span>
            <strong className="kpi-value">
              {utilizationMeta?.total_listings ?? listings.length}
            </strong>
            <span className="kpi-sub">
              {utilizationMeta?.open_listings ??
                listings.filter((l) => l.status === 'open').length}{' '}
              Open &middot; {utilizationMeta?.full_listings ?? 0} Full
            </span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Fleet CBM Utilization</span>
            <strong className="kpi-value">
              {utilizationMeta?.overall_cbm_utilization_pct ?? '0.00'}%
            </strong>
            <span className="kpi-sub">
              {utilizationMeta?.total_cbm_booked ?? 0} /{' '}
              {utilizationMeta?.total_cbm_offered ?? 0} CBM Booked
            </span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Active Freight Revenue</span>
            <strong className="kpi-value text-orange">
              $
              {Number(utilizationMeta?.confirmed_revenue || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </strong>
            <span className="kpi-sub">
              Across {utilizationMeta?.confirmed_bookings ?? providerBookings.length} active bookings
            </span>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`alert-banner ${
              feedback.type === 'success' ? 'alert-success' : 'alert-error'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 size={20} />
            ) : (
              <AlertTriangle size={20} />
            )}
            <div className="alert-content-grow">
              <p>{feedback.text}</p>
            </div>
            <button
              type="button"
              className="alert-dismiss-btn"
              onClick={() => setFeedback(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="section-toolbar-card">
          <div className="status-filter-pills">
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'listings' ? 'active' : ''}`}
              onClick={() => setActiveTab('listings')}
            >
              <Ship size={15} />
              <span>My Capacity Listings ({listings.length})</span>
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'bookings' ? 'active' : ''}`}
              onClick={() => setActiveTab('bookings')}
            >
              <PackageCheck size={15} />
              <span>Trader Bookings ({providerBookings.length})</span>
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => setActiveTab('create')}
            >
              <PlusCircle size={15} />
              <span>Publish New Listing</span>
            </button>
          </div>

          <div className="toolbar-right-actions">
            <button
              type="button"
              className="btn-secondary-sm"
              onClick={loadProviderWorkspace}
              disabled={loading}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* TAB 1: PROVIDER CAPACITY LISTINGS */}
        {activeTab === 'listings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="table-filter-bar">
              <div className="status-filter-pills">
                {[
                  { value: '', label: 'All Listings' },
                  { value: 'open', label: 'Open' },
                  { value: 'full', label: 'Full' },
                  { value: 'closed', label: 'Closed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ].map((st) => (
                  <button
                    key={st.value || 'all'}
                    type="button"
                    className={`filter-tab-btn ${listingStatusFilter === st.value ? 'active' : ''}`}
                    onClick={() => setListingStatusFilter(st.value)}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <div className="table-search-box">
                <Search size={14} style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  className="table-search-input"
                  placeholder="Filter by route, port or listing ID..."
                  value={listingSearchQuery}
                  onChange={(e) => setListingSearchQuery(e.target.value)}
                />
                {listingSearchQuery && (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                    onClick={() => setListingSearchQuery('')}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="empty-state-card">Loading provider listings...</div>
            ) : filteredListings.length === 0 ? (
              <div className="empty-state-card">
                <Ship size={38} className="text-orange" />
                <h3>No Listings Found</h3>
                <p>
                  {listingSearchQuery || listingStatusFilter
                    ? 'No capacity listings matched your search or status filters.'
                    : 'Publish your first LCL container capacity listing for this provider.'}
                </p>
                {listingSearchQuery || listingStatusFilter ? (
                  <button
                    type="button"
                    className="btn-secondary-outline"
                    onClick={() => {
                      setListingSearchQuery('');
                      setListingStatusFilter('');
                    }}
                  >
                    Clear Filters
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-orange-primary"
                    onClick={() => setActiveTab('create')}
                  >
                    <PlusCircle size={15} /> Publish Listing
                  </button>
                )}
              </div>
            ) : (
              <div className="listings-grid">
                {filteredListings.map((item) => {
                const totalCbmVal = parseFloat(item.total_cbm || 1);
                const { canReopen, canClose, canCancel, availCbmVal } =
                  getListingStatusActions(item);
                const bookedPct = Math.min(
                  100,
                  Math.max(0, Math.round(((totalCbmVal - availCbmVal) / totalCbmVal) * 100))
                );

                return (
                  <article key={item.listing_id} className="listing-card">
                    <div className="listing-card-top">
                      <div className="listing-provider-info">
                        <span className="listing-id-chip">Listing #{item.listing_id}</span>
                        <span className="text-muted-sm">
                          {item.active_booking_count || 0} active{' '}
                          {Number(item.active_booking_count) === 1 ? 'booking' : 'bookings'}
                        </span>
                      </div>
                      <span className={`status-badge status-${item.status}`}>{item.status}</span>
                    </div>

                    <div className="listing-route-box">
                      <div className="listing-port-col">
                        <span className="port-code-badge">{item.origin_port_code}</span>
                        <strong className="port-city-name">{item.origin_port_name}</strong>
                      </div>
                      <div className="listing-transit-connector">
                        <span className="transit-days-label">
                          Cutoff: {new Date(item.cutoff_date).toLocaleDateString()}
                        </span>
                        <div className="transit-line">
                          <ArrowRight size={15} className="transit-arrow" />
                        </div>
                      </div>
                      <div className="listing-port-col listing-port-col-right">
                        <span className="port-code-badge">{item.destination_port_code}</span>
                        <strong className="port-city-name">{item.destination_port_name}</strong>
                      </div>
                    </div>

                    <div className="listing-metrics-row">
                      <div className="listing-schedule-col">
                        <div className="schedule-pair">
                          <Calendar size={14} className="text-muted" />
                          <div>
                            <span className="metric-caption">Departs</span>
                            <strong>{new Date(item.departure_date).toLocaleDateString()}</strong>
                          </div>
                        </div>
                        <div className="schedule-pair">
                          <Calendar size={14} className="text-muted" />
                          <div>
                            <span className="metric-caption">Arrives</span>
                            <strong>{new Date(item.arrival_date).toLocaleDateString()}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="listing-capacity-col">
                        <div className="capacity-bar-header">
                          <span>
                            Remaining: <strong>{availCbmVal.toFixed(2)}</strong> /{' '}
                            {totalCbmVal.toFixed(2)} CBM
                          </span>
                          <span className="capacity-pct">{bookedPct}% booked</span>
                        </div>
                        <div className="capacity-progress-track">
                          <div
                            className="capacity-progress-fill"
                            style={{ width: `${100 - bookedPct}%` }}
                          />
                        </div>
                        <div className="capacity-weight-sub">
                          <Scale size={13} /> Weight Free:{' '}
                          <strong>
                            {Number(item.available_weight).toFixed(2)} /{' '}
                            {Number(item.total_weight).toFixed(2)} t
                          </strong>
                        </div>
                      </div>
                    </div>

                    {item.supported_cargo_types && (
                      <div className="listing-cargo-tags">
                        {item.supported_cargo_types.split(',').map((t, idx) => (
                          <span key={idx} className="cargo-tag-chip">
                            {t.trim()}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="listing-card-footer">
                      <div className="listing-rates-group">
                        <div className="rate-pill">
                          <span className="rate-label">CBM Rate</span>
                          <strong className="rate-val">
                            ${Number(item.price_per_cbm).toFixed(2)}
                          </strong>
                        </div>
                        <div className="rate-pill">
                          <span className="rate-label">Tonne Rate</span>
                          <strong className="rate-val">
                            ${Number(item.price_per_tonne).toFixed(2)}
                          </strong>
                        </div>
                        <div className="rate-pill">
                          <span className="rate-label">Min</span>
                          <strong className="rate-val">
                            ${Number(item.minimum_charge).toFixed(2)}
                          </strong>
                        </div>
                      </div>

                      <div className="provider-status-controls">
                        <button
                          type="button"
                          className="btn-secondary-sm"
                          onClick={() => setPricingEditorListing(item)}
                        >
                          <SlidersHorizontal size={13} />
                          <span>Itemised Pricing</span>
                        </button>
                        {canReopen && (
                          <button
                            type="button"
                            className="btn-secondary-sm"
                            disabled={updatingListingId === item.listing_id}
                            onClick={() => handleStatusChange(item.listing_id, 'open')}
                          >
                            Reopen
                          </button>
                        )}
                        {canClose && (
                          <button
                            type="button"
                            className="btn-secondary-sm"
                            disabled={updatingListingId === item.listing_id}
                            onClick={() => handleStatusChange(item.listing_id, 'closed')}
                          >
                            Close Listing
                          </button>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            className="btn-danger-sm"
                            disabled={updatingListingId === item.listing_id}
                            onClick={() => setCancelListingTarget(item)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TRADER BOOKINGS ON PROVIDER LISTINGS */}
        {activeTab === 'bookings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="table-filter-bar">
              <div className="status-filter-pills">
                {[
                  { value: '', label: 'All Bookings' },
                  { value: 'confirmed', label: 'Confirmed' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ].map((st) => (
                  <button
                    key={st.value || 'all'}
                    type="button"
                    className={`filter-tab-btn ${bookingStatusFilter === st.value ? 'active' : ''}`}
                    onClick={() => setBookingStatusFilter(st.value)}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bookings-stack">
              {filteredProviderBookings.length === 0 ? (
                <div className="empty-state-card">
                  <PackageCheck size={38} className="text-orange" />
                  <h3>No Bookings Found</h3>
                  <p>
                    {bookingStatusFilter
                      ? `No bookings with "${bookingStatusFilter}" status found on your listings.`
                      : 'When traders book space on your capacity listings, they will appear here.'}
                  </p>
                </div>
              ) : (
                filteredProviderBookings.map((b) => (
                  <article key={b.booking_id} className="booking-row-card">
                    <div className="booking-row-header">
                      <div className="booking-id-group">
                        <span className="booking-ref-badge">Booking #{b.booking_id}</span>
                        <span className={`status-badge status-${b.booking_status}`}>
                          {b.booking_status}
                        </span>
                        <span className="booking-listing-ref">Listing #{b.listing_id}</span>
                      </div>
                      <span className="booking-timestamp">
                        Booked {new Date(b.booking_date).toLocaleString()}
                      </span>
                    </div>

                    <div className="booking-row-body">
                      <div className="booking-route-col">
                        <div className="booking-ports-inline">
                          <span className="port-code-badge">{b.origin_port_code}</span>
                          <strong>{b.origin_port_name}</strong>
                          <ArrowRight size={15} className="text-orange" />
                          <span className="port-code-badge">{b.destination_port_code}</span>
                          <strong>{b.destination_port_name}</strong>
                        </div>
                        <div className="booking-provider-sub">
                          <span>
                            Trader: <strong>{b.trader_company || `Trader #${b.trader_id}`}</strong>
                          </span>
                          <span className="dot-sep">&bull;</span>
                          <span>
                            Cargo: <strong>{b.cargo_type_name}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="booking-quantities-col">
                        <div className="qty-chip">
                          <Box size={14} className="text-orange" />
                          <span>{Number(b.booked_cbm).toFixed(2)} CBM</span>
                        </div>
                        <div className="qty-chip">
                          <Scale size={14} className="text-orange" />
                          <span>{Number(b.booked_weight).toFixed(2)} t</span>
                        </div>
                      </div>

                      <div className="booking-actions-col">
                        <div className="booking-price-display">
                          <span className="metric-caption">Freight Revenue</span>
                          <strong className="booking-price-amount">
                            ${Number(b.total_price).toFixed(2)}
                          </strong>
                        </div>

                        {b.booking_status === 'confirmed' && (
                          <button
                            type="button"
                            className="btn-danger-sm"
                            disabled={cancellingBookingId === b.booking_id}
                            onClick={() => setCancelBookingTarget(b)}
                          >
                            <XCircle size={14} />
                            <span>Cancel &amp; Restore</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PUBLISH NEW CAPACITY LISTING */}
        {activeTab === 'create' && (
          <section className="form-panel-card">
            <div className="form-panel-header">
              <div>
                <span className="modal-eyebrow">NEW CONTAINER SPACE OFFERING</span>
                <h3>Publish LCL Capacity Listing</h3>
                <p>
                  Set route corridor, schedule dates, available volume/weight, and tariff rates for this voyage.
                </p>
              </div>
              <button
                type="button"
                className="btn-preset-chip"
                onClick={() => {
                  setCutoffDate('2026-11-20');
                  setDepartureDate('2026-11-25');
                  setArrivalDate('2026-12-12');
                  setTotalCbm('50');
                  setTotalWeight('26');
                  setPricePerCbm('88');
                  setPricePerTonne('110');
                  setMinimumCharge('240');
                  setSelectedCargoTypeIds([1, 3, 5]);
                }}
              >
                <Sparkles size={14} />
                <span>Fill Sample Voyage Values</span>
              </button>
            </div>

            <form className="provider-create-form" onSubmit={handleCreateListing}>
              <div className="form-group">
                <label className="form-label" htmlFor="create-route">
                  Trade Route Corridor
                </label>
                <select
                  id="create-route"
                  className="form-select"
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  required
                >
                  <option value="">Select maritime route...</option>
                  {routes.map((r) => (
                    <option key={r.route_id} value={r.route_id}>
                      Route #{r.route_id}: {r.origin_port_code} ({r.origin_port_name}) &rarr;{' '}
                      {r.destination_port_code} ({r.destination_port_name}) ·{' '}
                      {r.typical_transit_days} days
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row-3col">
                <div className="form-group">
                  <label className="form-label" htmlFor="create-cutoff-date">
                    Booking Cutoff Date
                  </label>
                  <input
                    id="create-cutoff-date"
                    type="date"
                    className="form-input"
                    value={cutoffDate}
                    onChange={(e) => setCutoffDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="create-dep-date">
                    Departure Date
                  </label>
                  <input
                    id="create-dep-date"
                    type="date"
                    className="form-input"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="create-arr-date">
                    Estimated Arrival Date
                  </label>
                  <input
                    id="create-arr-date"
                    type="date"
                    className="form-input"
                    value={arrivalDate}
                    onChange={(e) => setArrivalDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              {!isDateOrderValid && (
                <div style={{ color: '#b91c1c', fontSize: '12px', marginTop: '4px' }}>
                  <AlertTriangle size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  Cutoff date must be on or before departure date, and departure must be before arrival date.
                </div>
              )}

              <div className="form-row-2col">
                <div className="form-group">
                  <label className="form-label" htmlFor="create-total-cbm">
                    Total Volume Capacity (CBM)
                  </label>
                  <input
                    id="create-total-cbm"
                    type="number"
                    step="0.5"
                    min="1"
                    className="form-input"
                    value={totalCbm}
                    onChange={(e) => setTotalCbm(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="create-total-weight">
                    Total Weight Capacity (Tonnes)
                  </label>
                  <input
                    id="create-total-weight"
                    type="number"
                    step="0.5"
                    min="1"
                    className="form-input"
                    value={totalWeight}
                    onChange={(e) => setTotalWeight(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row-3col">
                <div className="form-group">
                  <label className="form-label" htmlFor="create-rate-cbm">
                    Price per CBM (USD)
                  </label>
                  <input
                    id="create-rate-cbm"
                    type="number"
                    step="0.01"
                    min="1"
                    className="form-input"
                    value={pricePerCbm}
                    onChange={(e) => setPricePerCbm(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="create-rate-tonne">
                    Price per Tonne (USD)
                  </label>
                  <input
                    id="create-rate-tonne"
                    type="number"
                    step="0.01"
                    min="1"
                    className="form-input"
                    value={pricePerTonne}
                    onChange={(e) => setPricePerTonne(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="create-min-charge">
                    Minimum Charge Floor (USD)
                  </label>
                  <input
                    id="create-min-charge"
                    type="number"
                    step="0.01"
                    min="1"
                    className="form-input"
                    value={minimumCharge}
                    onChange={(e) => setMinimumCharge(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <span className="form-label">Supported Cargo Classifications</span>
                <div className="checkbox-pills-grid">
                  {cargoTypes.map((ct) => {
                    const checked = selectedCargoTypeIds.includes(Number(ct.cargo_type_id));
                    return (
                      <label
                        key={ct.cargo_type_id}
                        className={`checkbox-pill-card ${checked ? 'checked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCargoTypeCheckbox(ct.cargo_type_id)}
                        />
                        <div>
                          <strong>{ct.name}</strong>
                          <span>{ct.description}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label
                  className={`checkbox-pill-card ${openPricingAfterCreate ? 'checked' : ''}`}
                  style={{ maxWidth: '100%' }}
                >
                  <input
                    type="checkbox"
                    checked={openPricingAfterCreate}
                    onChange={(e) => setOpenPricingAfterCreate(e.target.checked)}
                  />
                  <div>
                    <strong>Configure Itemised All-In Pricing &amp; Charge Catalogue Next</strong>
                    <span>
                      Automatically open the Feature A Itemised Pricing Editor right after
                      publishing this listing to configure origin, ocean, and destination surcharges.
                    </span>
                  </div>
                </label>
              </div>

              <div className="form-submit-row">
                <button
                  type="button"
                  className="btn-secondary-outline"
                  onClick={() => setActiveTab('listings')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-orange-primary"
                  disabled={creatingListing || !isDateOrderValid}
                >
                  <PlusCircle size={16} />
                  <span>{creatingListing ? 'Publishing...' : 'Publish Capacity Listing'}</span>
                </button>
              </div>
            </form>
          </section>
        )}
      </div>

      {/* Feature A: Provider Itemised Pricing & Rules Editor Modal */}
      {pricingEditorListing && (
        <ProviderPricingModal
          listing={pricingEditorListing}
          providerId={Number(selectedProviderId)}
          onClose={() => setPricingEditorListing(null)}
          onSaved={() => {
            loadProviderWorkspace();
            refreshCatalog();
          }}
        />
      )}

      {/* Provider Cancel Booking Confirmation Modal */}
      {cancelBookingTarget && (
        <div className="modal-backdrop" onClick={() => !cancellingBookingId && setCancelBookingTarget(null)}>
          <div
            className="modal-card modal-card-sm confirm-dialog-danger"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">PROVIDER CANCEL ACTION</span>
                <h3 className="modal-title">Cancel Reservation #{cancelBookingTarget.booking_id}?</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCancelBookingTarget(null)}
                disabled={Boolean(cancellingBookingId)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="confirm-warning-box">
                <AlertTriangle size={18} className="confirm-warning-icon" />
                <div>
                  <strong>Cancel Trader Booking and Release Reserved Capacity</strong>
                  <p style={{ marginTop: '3px', fontSize: '12px' }}>
                    This action will cancel the trader's cargo reservation and immediately restore {cancelBookingTarget.booked_cbm} CBM and {cancelBookingTarget.booked_weight}t back to Listing #{cancelBookingTarget.listing_id}.
                  </p>
                </div>
              </div>

              <div className="confirm-details-card">
                <div className="confirm-details-row">
                  <span>Trader Shipper</span>
                  <strong>{cancelBookingTarget.trader_company || `Trader #${cancelBookingTarget.trader_id}`}</strong>
                </div>
                <div className="confirm-details-row">
                  <span>Route</span>
                  <strong>{cancelBookingTarget.origin_port_code} &rarr; {cancelBookingTarget.destination_port_code}</strong>
                </div>
                <div className="confirm-details-row">
                  <span>Capacity to Restore</span>
                  <strong>{cancelBookingTarget.booked_cbm} CBM &middot; {cancelBookingTarget.booked_weight} tonnes</strong>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="cancel-booking-reason">
                  Cancellation Reason / Log Note
                </label>
                <input
                  id="cancel-booking-reason"
                  type="text"
                  className="form-input"
                  value={cancelBookingReason}
                  onChange={(e) => setCancelBookingReason(e.target.value)}
                  placeholder="e.g. Voyage schedule adjustment, vessel mechanical delay..."
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary-outline"
                onClick={() => setCancelBookingTarget(null)}
                disabled={Boolean(cancellingBookingId)}
              >
                Keep Booking
              </button>
              <button
                type="button"
                className="btn-sm-action btn-action-danger"
                style={{ padding: '9px 18px', fontSize: '13px' }}
                onClick={executeProviderCancelBooking}
                disabled={Boolean(cancellingBookingId)}
              >
                {cancellingBookingId ? 'Releasing Capacity...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider Cancel Listing Confirmation Modal */}
      {cancelListingTarget && (
        <div className="modal-backdrop" onClick={() => !updatingListingId && setCancelListingTarget(null)}>
          <div
            className="modal-card modal-card-sm confirm-dialog-danger"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">CONFIRM LISTING CANCELLATION</span>
                <h3 className="modal-title">Cancel Listing #{cancelListingTarget.listing_id}?</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCancelListingTarget(null)}
                disabled={Boolean(updatingListingId)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="confirm-warning-box">
                <AlertTriangle size={18} className="confirm-warning-icon" />
                <div>
                  <strong>Cancel Entire Capacity Listing</strong>
                  <p style={{ marginTop: '3px', fontSize: '12px' }}>
                    Cancelling will mark this listing as <code>cancelled</code> and prevent all future trader bookings. Per business rules, listings with active or confirmed bookings cannot be cancelled.
                  </p>
                </div>
              </div>

              <div className="confirm-details-card">
                <div className="confirm-details-row">
                  <span>Route Corridor</span>
                  <strong>{cancelListingTarget.origin_port_code} &rarr; {cancelListingTarget.destination_port_code}</strong>
                </div>
                <div className="confirm-details-row">
                  <span>Available Capacity</span>
                  <strong>{cancelListingTarget.available_cbm} CBM &middot; {cancelListingTarget.available_weight} tonnes</strong>
                </div>
                <div className="confirm-details-row">
                  <span>Current Status</span>
                  <strong>{cancelListingTarget.status}</strong>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary-outline"
                onClick={() => setCancelListingTarget(null)}
                disabled={Boolean(updatingListingId)}
              >
                Keep Listing Active
              </button>
              <button
                type="button"
                className="btn-sm-action btn-action-danger"
                style={{ padding: '9px 18px', fontSize: '13px' }}
                onClick={executeCancelListing}
                disabled={Boolean(updatingListingId)}
              >
                {updatingListingId ? 'Cancelling Listing...' : 'Confirm Cancel Listing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
