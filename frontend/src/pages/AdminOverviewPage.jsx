import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { api } from '../api/client';
import { useIdentity } from '../context/IdentityContext';

export default function AdminOverviewPage() {
  const { ports, selectedAdminId, refreshCatalog } = useIdentity();

  const [activeTab, setActiveTab] = useState('routes'); // 'routes' | 'providers' | 'audit' | 'reference'
  const [summary, setSummary] = useState(null);
  const [providerListings, setProviderListings] = useState([]);
  const [routeOverview, setRouteOverview] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [auditHistory, setAuditHistory] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
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
      const [sumRes, provRes, routeRes, usersRes, histRes] = await Promise.all([
        api.getAdminSummary(),
        api.getAdminProviderUtilization(),
        api.getAdminCapacityOverview(),
        api.getAdminUsers(roleFilter ? { role: roleFilter } : {}),
        api.getAdminBookingHistory(),
      ]);

      setSummary(sumRes.data || null);
      setProviderListings(provRes.data || []);
      setRouteOverview(routeRes.data || []);
      setAllUsers(usersRes.data || []);
      setAuditHistory(histRes.data || []);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to load administrative analytics.',
      });
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

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
            <div className="section-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text">PLATFORM ADMINISTRATION &amp; ANALYTICS</span>
            </div>
            <h1 className="workspace-title">ShipSpace Executive Overview</h1>
            <p className="workspace-subtitle">
              Real-time analytical reporting powered by PostgreSQL views{' '}
              <code>v_admin_platform_summary</code>, <code>v_admin_capacity_overview</code>,{' '}
              <code>v_provider_listing_utilization</code>, and <code>booking_status_history</code>.
            </p>
          </div>

          <div className="workspace-context-card">
            <span className="context-card-label">DATABASE SCHEMA</span>
            <strong className="context-card-name">shipspace (PostgreSQL)</strong>
            <span className="context-card-sub">14 Normalized Tables · 5 Views · 5 Triggers</span>
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
                ? Number(summary.total_providers) +
                  Number(summary.total_traders) +
                  Number(summary.total_admins)
                : 12}
            </strong>
            <span className="kpi-sub">
              {summary?.total_providers ?? 6} Providers &middot; {summary?.total_traders ?? 5}{' '}
              Traders &middot; {summary?.total_admins ?? 1} Admin
            </span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Maritime Network</span>
            <strong className="kpi-value">
              {summary?.total_ports ?? 12} Ports / {summary?.total_routes ?? 24} Routes
            </strong>
            <span className="kpi-sub">
              Platform CBM Utilization: {summary?.platform_cbm_utilization_pct ?? '0.00'}%
            </span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Capacity Listings</span>
            <strong className="kpi-value">{summary?.total_listings_count ?? 45}</strong>
            <span className="kpi-sub">
              {summary?.open_listings ?? 45} Open &middot; {summary?.full_listings ?? 0} Full
              &middot; {summary?.closed_listings ?? 0} Closed
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

        {/* Admin Section Tabs */}
        <div className="section-toolbar-card">
          <div className="status-filter-pills">
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
              onClick={() => setActiveTab('routes')}
            >
              <BarChart3 size={15} />
              <span>Route Capacity Overview ({routeOverview.length})</span>
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'providers' ? 'active' : ''}`}
              onClick={() => setActiveTab('providers')}
            >
              <Building2 size={15} />
              <span>Provider Listing Utilization ({providerListings.length})</span>
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              <History size={15} />
              <span>Users &amp; Audit History</span>
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'reference' ? 'active' : ''}`}
              onClick={() => setActiveTab('reference')}
            >
              <Database size={15} />
              <span>Reference Catalog Admin</span>
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
                  Live aggregation from PostgreSQL view <code>shipspace.v_admin_capacity_overview</code>
                </p>
              </div>
            </div>

            <div className="table-responsive">
              <table className="shipspace-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Corridor</th>
                    <th>Listings (Open / Total)</th>
                    <th>Booked / Published CBM</th>
                    <th>Route CBM Utilization</th>
                    <th>Active Bookings</th>
                    <th>Active Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {routeOverview.map((r) => {
                    const pct = Number(r.route_cbm_utilization_pct || 0);
                    return (
                      <tr key={r.route_id}>
                        <td>#{r.route_id}</td>
                        <td>
                          <strong>{r.route_code}</strong>
                          <div className="text-muted-sm">
                            {r.origin_port} &rarr; {r.destination_port} ({r.typical_transit_days}d)
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
                            <span>{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td>{r.total_active_bookings}</td>
                        <td>
                          <strong className="text-orange">
                            $
                            {Number(r.total_active_revenue || 0).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })}
                          </strong>
                        </td>
                      </tr>
                    );
                  })}
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
                  Live query from PostgreSQL view <code>shipspace.v_provider_listing_utilization</code>
                </p>
              </div>
            </div>

            <div className="table-responsive">
              <table className="shipspace-table">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Logistics Provider</th>
                    <th>Route</th>
                    <th>Departure</th>
                    <th>Status</th>
                    <th>Booked / Total CBM</th>
                    <th>CBM Utilization</th>
                    <th>Active Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {providerListings.map((p) => {
                    const pct = Number(p.cbm_utilization_pct || 0);
                    return (
                      <tr key={p.listing_id}>
                        <td>#{p.listing_id}</td>
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
                            <span>{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td>
                          <strong className="text-orange">
                            $
                            {Number(p.total_active_revenue || 0).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })}
                          </strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 3: USERS DIRECTORY & BOOKING AUDIT HISTORY */}
        {activeTab === 'audit' && (
          <div className="admin-split-2col">
            {/* Booking Status Audit Log */}
            <section className="data-table-card">
              <div className="table-card-header">
                <div>
                  <h3>Booking Status Audit Trail</h3>
                  <p>
                    Populated automatically by trigger <code>trg_record_booking_status_history</code>
                  </p>
                </div>
              </div>

              <div className="table-responsive">
                <table className="shipspace-table">
                  <thead>
                    <tr>
                      <th>Audit #</th>
                      <th>Booking</th>
                      <th>Changed By</th>
                      <th>Transition</th>
                      <th>Reason &amp; Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditHistory.map((h) => (
                      <tr key={h.history_id}>
                        <td>#{h.history_id}</td>
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
                          <span className="audit-old-status">{h.old_status || 'NEW'}</span>{' '}
                          <ArrowRight size={12} />{' '}
                          <span className={`status-badge status-${h.new_status}`}>
                            {h.new_status}
                          </span>
                        </td>
                        <td className="text-muted-sm">
                          <div>{h.reason}</div>
                          <div>{new Date(h.changed_at).toLocaleString()}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* User Directory */}
            <section className="data-table-card">
              <div className="table-card-header">
                <div>
                  <h3>Platform User Directory ({allUsers.length})</h3>
                  <p>Registered Providers, Traders &amp; Administrators</p>
                </div>
                <select
                  className="form-select form-select-sm"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="">All Roles</option>
                  <option value="provider">Providers</option>
                  <option value="trader">Traders</option>
                  <option value="admin">Admins</option>
                </select>
              </div>

              <div className="table-responsive">
                <table className="shipspace-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Role</th>
                      <th>Company / Name</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map((u) => (
                      <tr key={u.user_id}>
                        <td>#{u.user_id}</td>
                        <td>
                          <span className={`role-badge role-${u.role}`}>{u.role}</span>
                        </td>
                        <td>
                          <strong>{u.company_name || u.name}</strong>
                          {u.company_name && <div className="text-muted-sm">{u.name}</div>}
                        </td>
                        <td className="text-muted-sm">{u.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: REFERENCE CATALOG CREATION FORMS */}
        {activeTab === 'reference' && (
          <div className="admin-forms-3col">
            {/* Create Port */}
            <form className="form-panel-card" onSubmit={handleCreatePort}>
              <span className="modal-eyebrow">POST /api/admin/ports</span>
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
                <PlusCircle size={15} /> Create Port
              </button>
            </form>

            {/* Create Route */}
            <form className="form-panel-card" onSubmit={handleCreateRoute}>
              <span className="modal-eyebrow">POST /api/admin/routes</span>
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
              <span className="modal-eyebrow">POST /api/admin/cargo-types</span>
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
                <PlusCircle size={15} /> Create Cargo Type
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
