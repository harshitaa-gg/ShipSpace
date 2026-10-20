import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  History,
  Database,
  RefreshCw,
  ArrowRight,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  Users,
  Search,
  Scale,
  Box,
  Ship,
  MapPin,
  Clock,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../api/client';
import { useIdentity } from '../context/IdentityContext';

export default function AdminOverviewPage() {
  const { ports, selectedAdminId, refreshCatalog } = useIdentity();

  // Navigation tab: 'routes' | 'providers' | 'bookings' | 'users' | 'audit' | 'reference'
  const [activeTab, setActiveTab] = useState('routes');

  // Analytical data states from PostgreSQL views & tables
  const [summary, setSummary] = useState(null);
  const [routeOverview, setRouteOverview] = useState([]);
  const [providerListings, setProviderListings] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [auditHistory, setAuditHistory] = useState([]);

  // Search & Filter states
  const [routeSearchQuery, setRouteSearchQuery] = useState('');
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Reference Data Creation States
  const [newPortName, setNewPortName] = useState('');
  const [newPortCountry, setNewPortCountry] = useState('');
  const [newPortCode, setNewPortCode] = useState('');

  const [newRouteOrigin, setNewRouteOrigin] = useState('');
  const [newRouteDest, setNewRouteDest] = useState('');
  const [newRouteDays, setNewRouteDays] = useState('');

  const [newCargoName, setNewCargoName] = useState('');
  const [newCargoDesc, setNewCargoDesc] = useState('');

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, provRes, routeRes, usersRes, histRes, bookingsRes] = await Promise.all([
        api.getAdminSummary(),
        api.getAdminProviderUtilization(),
        api.getAdminCapacityOverview(),
        api.getAdminUsers(roleFilter ? { role: roleFilter } : {}),
        api.getAdminBookingHistory(),
        api.getAdminBookings(bookingStatusFilter ? { status: bookingStatusFilter } : {}),
      ]);

      setSummary(sumRes.data || null);
      setProviderListings(provRes.data || []);
      setRouteOverview(routeRes.data || []);
      setAllUsers(usersRes.data || []);
      setAuditHistory(histRes.data || []);
      setAllBookings(bookingsRes.data || []);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to load administrative analytics from backend.',
      });
    } finally {
      setLoading(false);
    }
  }, [roleFilter, bookingStatusFilter]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Filtered Route Capacity Data
  const filteredRoutes = useMemo(() => {
    if (!routeSearchQuery.trim()) return routeOverview;
    const q = routeSearchQuery.toLowerCase().trim();
    return routeOverview.filter(
      (r) =>
        String(r.route_id).includes(q) ||
        (r.route_code || '').toLowerCase().includes(q) ||
        (r.origin_port || '').toLowerCase().includes(q) ||
        (r.destination_port || '').toLowerCase().includes(q)
    );
  }, [routeOverview, routeSearchQuery]);

  // Filtered Provider Utilization Data
  const filteredProviders = useMemo(() => {
    if (!providerSearchQuery.trim()) return providerListings;
    const q = providerSearchQuery.toLowerCase().trim();
    return providerListings.filter(
      (p) =>
        String(p.listing_id).includes(q) ||
        (p.provider_company_name || p.provider_company || '').toLowerCase().includes(q) ||
        (p.route_code || '').toLowerCase().includes(q)
    );
  }, [providerListings, providerSearchQuery]);

  // Filtered Platform Bookings Data
  const filteredBookings = useMemo(() => {
    let rows = allBookings;
    if (bookingStatusFilter) {
      rows = rows.filter((b) => b.booking_status === bookingStatusFilter);
    }
    if (bookingSearchQuery.trim()) {
      const q = bookingSearchQuery.toLowerCase().trim();
      rows = rows.filter(
        (b) =>
          String(b.booking_id).includes(q) ||
          String(b.listing_id).includes(q) ||
          (b.trader_company || b.trader_name || '').toLowerCase().includes(q) ||
          (b.provider_company || b.provider_name || '').toLowerCase().includes(q) ||
          (b.origin_port_code || '').toLowerCase().includes(q) ||
          (b.destination_port_code || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [allBookings, bookingStatusFilter, bookingSearchQuery]);

  // Filtered User Directory Data
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return allUsers;
    const q = userSearchQuery.toLowerCase().trim();
    return allUsers.filter(
      (u) =>
        String(u.user_id).includes(q) ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.company_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
    );
  }, [allUsers, userSearchQuery]);

  // Filtered Audit History Data
  const filteredAudit = useMemo(() => {
    if (!auditSearchQuery.trim()) return auditHistory;
    const q = auditSearchQuery.toLowerCase().trim();
    return auditHistory.filter(
      (h) =>
        String(h.history_id).includes(q) ||
        String(h.booking_id).includes(q) ||
        (h.trader_company_name || '').toLowerCase().includes(q) ||
        (h.changed_by_name || '').toLowerCase().includes(q) ||
        (h.reason || '').toLowerCase().includes(q) ||
        (h.new_status || '').toLowerCase().includes(q)
    );
  }, [auditHistory, auditSearchQuery]);

  const handleCreatePort = async (e) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await api.createPort({
        name: newPortName,
        country: newPortCountry,
        un_locode: newPortCode.toUpperCase(),
        admin_id: selectedAdminId || 27,
      });
      setFeedback({
        type: 'success',
        text: `Created Port #${res.data.port_id}: ${res.data.port_code} — ${res.data.port_name}.`,
      });
      setNewPortName('');
      setNewPortCountry('');
      setNewPortCode('');
      refreshCatalog();
      loadAdminData();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to create port.' });
    }
  };

  const handleCreateRoute = async (e) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await api.createRoute({
        origin_port_id: Number(newRouteOrigin),
        destination_port_id: Number(newRouteDest),
        typical_transit_days: Number(newRouteDays),
        admin_id: selectedAdminId || 27,
      });
      setFeedback({
        type: 'success',
        text: `Created Maritime Route #${res.data.route_id} (${res.data.route_code}).`,
      });
      setNewRouteOrigin('');
      setNewRouteDest('');
      setNewRouteDays('');
      refreshCatalog();
      loadAdminData();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to create route.' });
    }
  };

  const handleCreateCargoType = async (e) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await api.createCargoType({
        name: newCargoName,
        description: newCargoDesc,
        admin_id: selectedAdminId || 27,
      });
      setFeedback({
        type: 'success',
        text: `Created Cargo Type #${res.data.cargo_type_id}: ${res.data.name}.`,
      });
      setNewCargoName('');
      setNewCargoDesc('');
      refreshCatalog();
      loadAdminData();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to create cargo type.' });
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
              <span className="breadcrumb-link">Platform Admin</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">System Overview &amp; Management</span>
            </nav>
            <div className="section-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text">PLATFORM ADMINISTRATION &amp; ANALYTICS</span>
            </div>
            <h1 className="workspace-title">ShipSpace Executive Administration</h1>
            <p className="workspace-subtitle">
              Platform overview, route capacity monitoring, provider fleet utilization, and user management.
            </p>
          </div>

          <div className="workspace-context-card">
            <span className="context-card-label">PLATFORM DATA</span>
            <strong className="context-card-name">Operational Summary</strong>
            <span className="context-card-sub">All Routes &amp; Listings Active</span>
          </div>
        </div>
      </div>

      <div className="workspace-container">
        {/* Executive Summary KPI Cards (from v_admin_platform_summary) */}
        <div className="kpi-grid-4">
          <div className="kpi-card">
            <span className="kpi-label">Registered Accounts</span>
            <strong className="kpi-value">
              {summary
                ? Number(summary.total_providers || 0) +
                  Number(summary.total_traders || 0) +
                  Number(summary.total_admins || 0)
                : allUsers.length > 0
                ? allUsers.length
                : '—'}
            </strong>
            <span className="kpi-sub">
              {summary?.total_providers ?? (allUsers.filter((u) => u.role === 'provider').length || 0)} Providers &middot;{' '}
              {summary?.total_traders ?? (allUsers.filter((u) => u.role === 'trader').length || 0)} Traders &middot;{' '}
              {summary?.total_admins ?? (allUsers.filter((u) => u.role === 'admin').length || 0)} Admin
            </span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Maritime Network</span>
            <strong className="kpi-value">
              {summary ? `${summary.total_ports ?? 0} Ports / ${summary.total_routes ?? 0} Routes` : '—'}
            </strong>
            <span className="kpi-sub">
              Platform CBM Utilization: {summary?.platform_cbm_utilization_pct ?? '0.00'}%
            </span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Capacity Listings</span>
            <strong className="kpi-value">{summary?.total_listings_count ?? '—'}</strong>
            <span className="kpi-sub">
              {summary?.open_listings ?? 0} Open &middot; {summary?.full_listings ?? 0} Full &middot;{' '}
              {summary?.closed_listings ?? 0} Closed
            </span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Active Freight Revenue</span>
            <strong className="kpi-value text-orange">
              $
              {Number(summary?.active_booking_revenue || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </strong>
            <span className="kpi-sub">
              {summary?.confirmed_bookings ?? 0} Confirmed &middot;{' '}
              {summary?.completed_bookings ?? 0} Completed &middot;{' '}
              {summary?.cancelled_bookings ?? 0} Cancelled
            </span>
          </div>
        </div>

        {/* Feedback Alert */}
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

        {/* Admin Navigation Tabs */}
        <div className="section-toolbar-card">
          <div className="status-filter-pills">
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
              onClick={() => setActiveTab('routes')}
            >
              <BarChart3 size={15} />
              <span>Route Overview ({routeOverview.length})</span>
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'providers' ? 'active' : ''}`}
              onClick={() => setActiveTab('providers')}
            >
              <Building2 size={15} />
              <span>Provider Utilization ({providerListings.length})</span>
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'bookings' ? 'active' : ''}`}
              onClick={() => setActiveTab('bookings')}
            >
              <FileText size={15} />
              <span>All Bookings ({allBookings.length})</span>
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <Users size={15} />
              <span>Users ({allUsers.length})</span>
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              <History size={15} />
              <span>Trigger Audit Trail ({auditHistory.length})</span>
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'reference' ? 'active' : ''}`}
              onClick={() => setActiveTab('reference')}
            >
              <Database size={15} />
              <span>Master Data</span>
            </button>
          </div>

          <div className="toolbar-right-actions">
            <button
              type="button"
              className="btn-secondary-sm"
              onClick={loadAdminData}
              disabled={loading}
            >
              <RefreshCw size={14} />
              <span>Refresh Views</span>
            </button>
          </div>
        </div>

        {/* TAB 1: ROUTE CAPACITY OVERVIEW TABLE (v_admin_capacity_overview) */}
        {activeTab === 'routes' && (
          <section className="data-table-card">
            <div className="table-card-header">
              <div>
                <h3>Route-Level Capacity &amp; Utilization Overview</h3>
                <p>
                  Aggregated capacity across all active maritime corridors
                </p>
              </div>

              <div className="table-search-box">
                <Search size={14} style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  className="table-search-input"
                  placeholder="Filter by route or port..."
                  value={routeSearchQuery}
                  onChange={(e) => setRouteSearchQuery(e.target.value)}
                />
                {routeSearchQuery && (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                    onClick={() => setRouteSearchQuery('')}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="table-responsive">
              <table className="shipspace-table">
                <thead>
                  <tr>
                    <th>Route ID</th>
                    <th>Corridor</th>
                    <th>Listings (Open / Total)</th>
                    <th>Booked / Published CBM</th>
                    <th>Route CBM Utilization</th>
                    <th>Active Bookings</th>
                    <th>Active Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoutes.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '32px' }}>
                        No route records matched your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredRoutes.map((r) => {
                      const pct = Number(r.route_cbm_utilization_pct || 0);
                      return (
                        <tr key={r.route_id}>
                          <td className="font-mono">#{r.route_id}</td>
                          <td>
                            <strong>{r.route_code}</strong>
                            <div className="text-muted-sm">
                              {r.origin_port} &rarr; {r.destination_port} ({r.typical_transit_days}d transit)
                            </div>
                          </td>
                          <td>
                            <span className="status-badge status-open">
                              {r.open_listings_count} open
                            </span>{' '}
                            / {r.total_listings_count} total
                          </td>
                          <td>
                            <strong>{Number(r.total_booked_cbm).toFixed(2)}</strong> /{' '}
                            {Number(r.total_published_cbm).toFixed(2)} CBM
                          </td>
                          <td>
                            <div className="table-progress-cell">
                              <div className="capacity-progress-track">
                                <div
                                  className="capacity-progress-fill"
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                              <span className="font-mono">{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="font-mono">{r.total_active_bookings}</td>
                          <td>
                            <strong className="text-orange font-mono">
                              $
                              {Number(r.total_active_revenue || 0).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                              })}
                            </strong>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 2: PROVIDER LISTING UTILIZATION TABLE (v_provider_listing_utilization) */}
        {activeTab === 'providers' && (
          <section className="data-table-card">
            <div className="table-card-header">
              <div>
                <h3>Provider Listing Utilization &amp; Revenue Report</h3>
                <p>
                  Listing-level breakdown of capacity commitment and revenue
                </p>
              </div>

              <div className="table-search-box">
                <Search size={14} style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  className="table-search-input"
                  placeholder="Filter by provider or corridor..."
                  value={providerSearchQuery}
                  onChange={(e) => setProviderSearchQuery(e.target.value)}
                />
                {providerSearchQuery && (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                    onClick={() => setProviderSearchQuery('')}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="table-responsive">
              <table className="shipspace-table">
                <thead>
                  <tr>
                    <th>Listing ID</th>
                    <th>Logistics Provider</th>
                    <th>Route</th>
                    <th>Departure Date</th>
                    <th>Status</th>
                    <th>Booked / Total CBM</th>
                    <th>CBM Utilization</th>
                    <th>Active Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProviders.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '32px' }}>
                        No provider listings matched your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredProviders.map((p) => {
                      const pct = Number(p.cbm_utilization_pct || 0);
                      return (
                        <tr key={p.listing_id}>
                          <td className="font-mono">#{p.listing_id}</td>
                          <td>
                            <strong>{p.provider_company_name || p.provider_company}</strong>
                          </td>
                          <td>{p.route_code}</td>
                          <td>{new Date(p.departure_date).toLocaleDateString()}</td>
                          <td>
                            <span className={`status-badge status-${p.status}`}>{p.status}</span>
                          </td>
                          <td>
                            <strong>{Number(p.booked_cbm || 0).toFixed(2)}</strong> /{' '}
                            {Number(p.total_cbm || 0).toFixed(2)} CBM
                          </td>
                          <td>
                            <div className="table-progress-cell">
                              <div className="capacity-progress-track">
                                <div
                                  className="capacity-progress-fill"
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                              <span className="font-mono">{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td>
                            <strong className="text-orange font-mono">
                              $
                              {Number(p.total_active_revenue || 0).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                              })}
                            </strong>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 3: ALL PLATFORM BOOKINGS MANAGEMENT (GET /api/admin/bookings) */}
        {activeTab === 'bookings' && (
          <section className="data-table-card">
            <div className="table-card-header">
              <div>
                <h3>Platform Bookings Management</h3>
                <p>
                  Complete cargo reservation manifests across all international trade lanes
                </p>
              </div>

              <div className="table-actions-group">
                <div className="status-filter-pills">
                  {[
                    { value: '', label: 'All' },
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

                <div className="table-search-box">
                  <Search size={14} style={{ color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="table-search-input"
                    placeholder="Search by ID, trader, provider..."
                    value={bookingSearchQuery}
                    onChange={(e) => setBookingSearchQuery(e.target.value)}
                  />
                  {bookingSearchQuery && (
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                      onClick={() => setBookingSearchQuery('')}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="shipspace-table">
                <thead>
                  <tr>
                    <th>Booking ID</th>
                    <th>Trader Shipper</th>
                    <th>Logistics Provider</th>
                    <th>Route Corridor</th>
                    <th>Cargo Type</th>
                    <th>Booked Volume &amp; Weight</th>
                    <th>Freight Total</th>
                    <th>Status</th>
                    <th>Booking Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '32px' }}>
                        No platform bookings found matching the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredBookings.map((b) => (
                      <tr key={b.booking_id}>
                        <td className="font-mono">
                          <strong>#{b.booking_id}</strong>
                          <div className="text-muted-sm">List #{b.listing_id}</div>
                        </td>
                        <td>
                          <strong>{b.trader_company || `Trader #${b.trader_id}`}</strong>
                        </td>
                        <td>
                          <strong>{b.provider_company || `Provider #${b.provider_id}`}</strong>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="port-code-badge">{b.origin_port_code}</span>
                            <ArrowRight size={12} className="text-orange" />
                            <span className="port-code-badge">{b.destination_port_code}</span>
                          </div>
                          <div className="text-muted-sm">
                            {b.origin_port_name} &rarr; {b.destination_port_name}
                          </div>
                        </td>
                        <td>{b.cargo_type_name || 'Standard LCL'}</td>
                        <td className="font-mono">
                          <strong>{Number(b.booked_cbm).toFixed(2)} CBM</strong>
                          <div className="text-muted-sm">{Number(b.booked_weight).toFixed(2)} tonnes</div>
                        </td>
                        <td>
                          <strong className="text-orange font-mono">
                            ${Number(b.total_price || 0).toFixed(2)}
                          </strong>
                        </td>
                        <td>
                          <span className={`status-badge status-${b.booking_status}`}>
                            {b.booking_status}
                          </span>
                        </td>
                        <td className="text-muted-sm font-mono">
                          {new Date(b.booking_date).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 4: USERS & ORGANIZATION DIRECTORY */}
        {activeTab === 'users' && (
          <section className="data-table-card">
            <div className="table-card-header">
              <div>
                <h3>Platform User Directory ({allUsers.length})</h3>
                <p>Commercial Shippers (Traders), Asset Carriers (Providers) &amp; Administrators</p>
              </div>

              <div className="table-actions-group">
                <select
                  className="form-select form-select-sm"
                  style={{ height: '38px', width: 'auto' }}
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="">All Platform Roles</option>
                  <option value="provider">Logistics Providers</option>
                  <option value="trader">Cargo Traders</option>
                  <option value="admin">Platform Admins</option>
                </select>

                <div className="table-search-box">
                  <Search size={14} style={{ color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="table-search-input"
                    placeholder="Search by name, company, email..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                  />
                  {userSearchQuery && (
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                      onClick={() => setUserSearchQuery('')}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="shipspace-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Role</th>
                    <th>Entity / Company Name</th>
                    <th>Primary Contact</th>
                    <th>Work Email</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '32px' }}>
                        No users found matching the query.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.user_id}>
                        <td className="font-mono">#{u.user_id}</td>
                        <td>
                          <span className={`role-badge role-${u.role}`}>{u.role}</span>
                        </td>
                        <td>
                          <strong>{u.company_name || u.name}</strong>
                        </td>
                        <td>{u.name}</td>
                        <td className="text-muted-sm font-mono">{u.email}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 5: TRIGGER AUDIT HISTORY (booking_status_history) */}
        {activeTab === 'audit' && (
          <section className="data-table-card">
            <div className="table-card-header">
              <div>
                <h3>Booking Status Audit Trail</h3>
                <p>
                  System log tracking booking status transitions and operational actions
                </p>
              </div>

              <div className="table-search-box">
                <Search size={14} style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  className="table-search-input"
                  placeholder="Filter by booking or actor..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                />
                {auditSearchQuery && (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                    onClick={() => setAuditSearchQuery('')}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="table-responsive">
              <table className="shipspace-table">
                <thead>
                  <tr>
                    <th>Audit ID</th>
                    <th>Booking Reference</th>
                    <th>Changed By</th>
                    <th>Status Transition</th>
                    <th>Reason / Action Note</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px' }}>
                        No audit history rows matched your search.
                      </td>
                    </tr>
                  ) : (
                    filteredAudit.map((h) => (
                      <tr key={h.history_id}>
                        <td className="font-mono">#{h.history_id}</td>
                        <td>
                          <strong>Booking #{h.booking_id}</strong>
                          <div className="text-muted-sm">
                            {h.trader_company_name || `Listing #${h.listing_id}`}
                          </div>
                        </td>
                        <td>
                          <strong>{h.changed_by_name}</strong>
                          <div className="text-muted-sm">{h.changed_by_role}</div>
                        </td>
                        <td>
                          <span className="audit-old-status">{h.old_status || 'INITIAL'}</span>{' '}
                          <ArrowRight size={12} style={{ margin: '0 4px', verticalAlign: 'middle' }} />{' '}
                          <span className={`status-badge status-${h.new_status}`}>
                            {h.new_status}
                          </span>
                        </td>
                        <td>
                          <div style={{ maxWidth: '300px', fontSize: '12.5px' }}>{h.reason || 'Status update committed'}</div>
                        </td>
                        <td className="text-muted-sm font-mono">
                          {new Date(h.changed_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 6: MASTER DATA CATALOG FORMS */}
        {activeTab === 'reference' && (
          <div className="admin-forms-3col">
            {/* Create Port */}
            <form className="form-panel-card" onSubmit={handleCreatePort}>
              <span className="modal-eyebrow">SEAPORT DIRECTORY</span>
              <h3>Register New Seaport</h3>
              <div className="form-group">
                <label className="form-label">Port Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Port of Busan"
                  value={newPortName}
                  onChange={(e) => setNewPortName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Country</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. South Korea"
                  value={newPortCountry}
                  onChange={(e) => setNewPortCountry(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">UN/LOCODE (5 chars, e.g. KRPUS)</label>
                <input
                  type="text"
                  maxLength={5}
                  className="form-input"
                  placeholder="e.g. KRPUS"
                  value={newPortCode}
                  onChange={(e) => setNewPortCode(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-orange-primary full-width">
                <PlusCircle size={15} /> Register Port
              </button>
            </form>

            {/* Create Route */}
            <form className="form-panel-card" onSubmit={handleCreateRoute}>
              <span className="modal-eyebrow">SHIPPING LANES</span>
              <h3>Create Maritime Route</h3>
              <div className="form-group">
                <label className="form-label">Origin Port</label>
                <select
                  className="form-select"
                  value={newRouteOrigin}
                  onChange={(e) => setNewRouteOrigin(e.target.value)}
                  required
                >
                  <option value="">Select origin...</option>
                  {ports.map((p) => (
                    <option key={p.port_id} value={p.port_id}>
                      {p.port_code} — {p.port_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Destination Port</label>
                <select
                  className="form-select"
                  value={newRouteDest}
                  onChange={(e) => setNewRouteDest(e.target.value)}
                  required
                >
                  <option value="">Select destination...</option>
                  {ports.map((p) => (
                    <option key={p.port_id} value={p.port_id}>
                      {p.port_code} — {p.port_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Typical Transit Days</label>
                <input
                  type="number"
                  min="1"
                  className="form-input"
                  placeholder="e.g. 14"
                  value={newRouteDays}
                  onChange={(e) => setNewRouteDays(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-orange-primary full-width">
                <PlusCircle size={15} /> Create Route
              </button>
            </form>

            {/* Create Cargo Type */}
            <form className="form-panel-card" onSubmit={handleCreateCargoType}>
              <span className="modal-eyebrow">CARGO CLASSIFICATIONS</span>
              <h3>Add Cargo Classification</h3>
              <div className="form-group">
                <label className="form-label">Classification Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Pharmaceutical Cold-Chain"
                  value={newCargoName}
                  onChange={(e) => setNewCargoName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Handling requirements..."
                  value={newCargoDesc}
                  onChange={(e) => setNewCargoDesc(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-orange-primary full-width">
                <PlusCircle size={15} /> Add Cargo Type
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
