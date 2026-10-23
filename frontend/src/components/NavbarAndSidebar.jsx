import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  Home,
  Search,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Globe,
  ChevronDown,
  UserCheck,
  X,
  Building2,
  Briefcase,
  ShieldAlert,
  Database,
  Bell,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useIdentity } from '../context/IdentityContext';
import { api } from '../api/client';

/**
 * Custom 3D isometric shipping container cube icon matching the ShipSpace logo
 */
export function ShipSpaceLogoIcon({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shipspace-logo-svg"
      aria-hidden="true"
    >
      {/* Top Face */}
      <polygon points="18,3 32,10.5 18,18 4,10.5" fill="#FF7A2F" />
      <polygon points="18,5.5 28.5,11 18,16.5 7.5,11" fill="#F26522" />
      {/* Left Face */}
      <polygon points="4,10.5 18,18 18,33 4,25.5" fill="#E05316" />
      {/* Container ribs on left face */}
      <line x1="7.5" y1="14.5" x2="7.5" y2="25.2" stroke="#B83E0B" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="11" y1="16.4" x2="11" y2="27.1" stroke="#B83E0B" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="14.5" y1="18.2" x2="14.5" y2="28.9" stroke="#B83E0B" strokeWidth="1.4" strokeLinecap="round" />
      {/* Right Face */}
      <polygon points="18,18 32,10.5 32,25.5 18,33" fill="#C4420A" />
      {/* Container ribs on right face */}
      <line x1="21.5" y1="18.2" x2="21.5" y2="28.9" stroke="#963005" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="25" y1="16.4" x2="25" y2="27.1" stroke="#963005" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="28.5" y1="14.5" x2="28.5" y2="25.2" stroke="#963005" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const SIDEBAR_ITEMS = [
  {
    to: '/',
    labelLines: ['Home'],
    icon: Home,
    end: true,
  },
  {
    to: '/search',
    labelLines: ['Search', 'Listings'],
    icon: Search,
  },
  {
    to: '/bookings',
    labelLines: ['My', 'Bookings'],
    icon: FileText,
  },
  {
    to: '/provider',
    labelLines: ['Provider', 'Dashboard'],
    icon: LayoutDashboard,
  },
  {
    to: '/admin',
    labelLines: ['Admin', 'Overview'],
    icon: ShieldCheck,
  },
];

export default function NavbarAndSidebar({ sidebarCollapsed, onToggleSidebar }) {
  const [identityModalOpen, setIdentityModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const {
    traders,
    providers,
    admins,
    selectedTraderId,
    setSelectedTraderId,
    selectedProviderId,
    setSelectedProviderId,
    selectedAdminId,
    setSelectedAdminId,
    activeTrader,
    activeProvider,
    activeAdmin,
    dbConnected,
    isAuthenticated,
    logout,
  } = useIdentity();

  const location = useLocation();
  const navigate = useNavigate();

  const scrollToSection = (sectionId) => {
    setMobileNavOpen(false);
    if (location.pathname !== '/') {
      navigate(`/#${sectionId}`);
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    } else {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Show contextual active identity in the top bar based on current page
  const getCurrentContextBadge = () => {
    if (location.pathname.startsWith('/provider')) {
      return {
        role: 'Provider',
        name: activeProvider ? activeProvider.company_name || activeProvider.name : `Provider #${selectedProviderId}`,
        id: selectedProviderId,
      };
    }
    if (location.pathname.startsWith('/admin')) {
      return {
        role: 'Admin',
        name: activeAdmin ? activeAdmin.name : `Admin #${selectedAdminId}`,
        id: selectedAdminId,
      };
    }
    return {
      role: 'Trader',
      name: activeTrader ? activeTrader.company_name || activeTrader.name : `Trader #${selectedTraderId}`,
      id: selectedTraderId,
    };
  };

  const badge = getCurrentContextBadge();

  const loadNotifications = useCallback(async () => {
    if (!badge.id) return;
    setNotifLoading(true);
    try {
      const res = await api.getNotifications(badge.id);
      if (res?.data) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(Number(res.data.unread_count || 0));
      }
    } catch (_err) {
      // Ignore quietly if offline
    } finally {
      setNotifLoading(false);
    }
  }, [badge.id]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, location.pathname]);

  const handleMarkOneRead = async (notifId) => {
    try {
      await api.markNotificationRead(notifId, badge.id);
      await loadNotifications();
    } catch (_err) {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead(badge.id);
      await loadNotifications();
    } catch (_err) {
      // Ignore
    }
  };

  const handleRunDueReminders = async () => {
    setNotifLoading(true);
    try {
      await api.processReminders();
      await loadNotifications();
    } catch (_err) {
      setNotifLoading(false);
    }
  };

  return (
    <>
      {/* Persistent Left Dark Navy Sidebar */}
      <aside className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} aria-label="Primary Sidebar Navigation">
        <div className="sidebar-top-bar">
          <button
            type="button"
            className="sidebar-hamburger-btn"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label="Toggle navigation sidebar"
          >
            <Menu size={20} strokeWidth={2} />
          </button>
        </div>

        <nav className="sidebar-nav-list">
          {SIDEBAR_ITEMS.map((item) => {
            const IconComponent = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="sidebar-active-bar" aria-hidden="true" />
                <span className="sidebar-icon-wrap">
                  <IconComponent size={18} strokeWidth={2} />
                </span>
                {!sidebarCollapsed && (
                  <span className="sidebar-label-text">
                    {item.labelLines.map((line, idx) => (
                      <span key={idx} className="sidebar-label-line">
                        {line}
                      </span>
                    ))}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="sidebar-footer-status">
            <div className="sidebar-db-pill" title={dbConnected ? 'Connected to PostgreSQL via Express API' : 'Checking API connection'}>
              <span className={`status-dot ${dbConnected ? 'online' : 'offline'}`} />
              <span className="sidebar-db-text">{dbConnected ? 'Live API' : 'Offline'}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Light Top Navigation Bar */}
      <header className={`app-topbar ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
        <div className="topbar-inner">
          {/* Brand Logo + Tagline */}
          <div className="topbar-brand-group">
            <Link to="/" className="topbar-brand-link">
              <ShipSpaceLogoIcon size={28} />
              <span className="topbar-brand-name">ShipSpace</span>
            </Link>
            <span className="topbar-brand-divider" aria-hidden="true" />
            <span className="topbar-brand-tagline">Space for every shipment</span>
          </div>

          {/* Center Navigation Links & Controls */}
          <div className="topbar-actions-group">
            <nav className="topbar-links" aria-label="Top Navigation">
              <NavLink
                to="/"
                end
                className={({ isActive }) => `topbar-link ${isActive && !location.hash ? 'active' : ''}`}
              >
                Home
              </NavLink>
              <NavLink
                to="/search"
                className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}
              >
                Find Capacity
              </NavLink>
              <NavLink
                to="/bookings"
                className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}
              >
                My Bookings
              </NavLink>
              <button
                type="button"
                className="topbar-link topbar-link-btn"
                onClick={() => scrollToSection('how-it-works')}
              >
                How It Works
              </button>
            </nav>

            <div className="topbar-right-controls">
              {/* Feature B: In-App Notifications Bell */}
              <button
                type="button"
                className="topbar-identity-pill"
                style={{ padding: '6px 10px', position: 'relative' }}
                onClick={() => {
                  setNotificationsOpen(true);
                  loadNotifications();
                }}
                title={`Notifications for ${badge.role} #${badge.id}`}
              >
                <Bell size={15} className="text-orange" />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Alerts</span>
                {unreadCount > 0 && (
                  <span
                    style={{
                      background: '#dc2626',
                      color: '#fff',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '999px',
                      marginLeft: '2px',
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Active Demo Identity Switcher Pill */}
              <button
                type="button"
                className="topbar-identity-pill"
                onClick={() => setIdentityModalOpen(true)}
                title="Switch active account profile"
              >
                <UserCheck size={14} className="identity-pill-icon" />
                <span className="identity-pill-role">{badge.role}:</span>
                <span className="identity-pill-name">#{badge.id} {badge.name}</span>
              </button>

              {/* Sign In / Sign Out Navigation Link */}
              {isAuthenticated ? (
                <button
                  type="button"
                  className="topbar-signin-btn"
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  title="Sign out of ShipSpace"
                >
                  Sign Out
                </button>
              ) : (
                <>
                  <Link to="/login" className="topbar-signin-btn">
                    Sign In
                  </Link>
                  <Link to="/register" className="topbar-getstarted-btn">
                    Get Started
                  </Link>
                </>
              )}

              {/* Mobile Drawer Hamburger */}
              <button
                type="button"
                className="topbar-mobile-toggle"
                onClick={() => setMobileNavOpen((prev) => !prev)}
                aria-label="Toggle navigation menu"
                aria-expanded={mobileNavOpen}
              >
                {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Dropdown Drawer */}
        {mobileNavOpen && (
          <div className="topbar-mobile-drawer">
            <nav className="mobile-drawer-nav">
              <Link to="/" className="mobile-drawer-link" onClick={() => setMobileNavOpen(false)}>
                Home
              </Link>
              <Link to="/search" className="mobile-drawer-link" onClick={() => setMobileNavOpen(false)}>
                Find Capacity
              </Link>
              <button
                type="button"
                className="mobile-drawer-link mobile-drawer-btn"
                onClick={() => scrollToSection('how-it-works')}
              >
                How It Works
              </button>
              <button
                type="button"
                className="mobile-drawer-link mobile-drawer-btn"
                onClick={() => scrollToSection('for-providers')}
              >
                For Providers
              </button>
              <button
                type="button"
                className="mobile-drawer-link mobile-drawer-btn"
                onClick={() => scrollToSection('for-traders')}
              >
                For Traders
              </button>
              <button
                type="button"
                className="mobile-drawer-link mobile-drawer-btn"
                onClick={() => scrollToSection('marketplace-preview')}
              >
                Marketplace Preview
              </button>

              <div className="mobile-drawer-actions">
                {isAuthenticated ? (
                  <button
                    type="button"
                    className="btn-hero-outline full-width"
                    onClick={() => {
                      setMobileNavOpen(false);
                      logout();
                      navigate('/login');
                    }}
                  >
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="btn-hero-outline full-width"
                      onClick={() => setMobileNavOpen(false)}
                    >
                      <span>Sign In</span>
                    </Link>
                    <Link
                      to="/register"
                      className="btn-hero-primary full-width"
                      onClick={() => setMobileNavOpen(false)}
                    >
                      <span>Get Started</span>
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  className="btn-secondary-sm full-width"
                  onClick={() => {
                    setMobileNavOpen(false);
                    setIdentityModalOpen(true);
                  }}
                >
                  <UserCheck size={14} />
                  <span>Switch Account ({badge.role})</span>
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Account Switcher Modal */}
      {identityModalOpen && (
        <div className="modal-backdrop" onClick={() => setIdentityModalOpen(false)}>
          <div
            className="modal-card identity-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="identity-modal-title"
          >
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">ACCOUNT SWITCHER</span>
                <h3 id="identity-modal-title" className="modal-title">
                  Select Active ShipSpace Account
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIdentityModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-helper-text">
                Quickly switch between accounts to explore the platform from the perspective of a Trader, Logistics Provider, or Platform Administrator.
              </p>

              {/* Trader Selector */}
              <div className="identity-selector-group">
                <label className="identity-group-label" htmlFor="demo-trader-select">
                  <Briefcase size={16} className="text-orange" />
                  <span>Active Trader Account (Search Listings &amp; My Bookings)</span>
                </label>
                <select
                  id="demo-trader-select"
                  className="modal-select"
                  value={selectedTraderId}
                  onChange={(e) => setSelectedTraderId(Number(e.target.value))}
                >
                  {traders.map((t) => (
                    <option key={t.user_id} value={t.user_id}>
                      #{t.user_id} — {t.company_name || t.name} ({t.name} · {t.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Provider Selector */}
              <div className="identity-selector-group">
                <label className="identity-group-label" htmlFor="demo-provider-select">
                  <Building2 size={16} className="text-orange" />
                  <span>Active Logistics Provider (Provider Dashboard)</span>
                </label>
                <select
                  id="demo-provider-select"
                  className="modal-select"
                  value={selectedProviderId}
                  onChange={(e) => setSelectedProviderId(Number(e.target.value))}
                >
                  {providers.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      #{p.user_id} — {p.company_name || p.name} ({p.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Admin Selector */}
              <div className="identity-selector-group">
                <label className="identity-group-label" htmlFor="demo-admin-select">
                  <ShieldAlert size={16} className="text-orange" />
                  <span>Active Platform Administrator (Admin Overview)</span>
                </label>
                <select
                  id="demo-admin-select"
                  className="modal-select"
                  value={selectedAdminId}
                  onChange={(e) => setSelectedAdminId(Number(e.target.value))}
                >
                  {admins.map((a) => (
                    <option key={a.user_id} value={a.user_id}>
                      #{a.user_id} — {a.name} ({a.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="identity-quick-nav">
                <span className="quick-nav-caption">Jump directly to portal:</span>
                <div className="quick-nav-buttons">
                  <button
                    type="button"
                    className="btn-secondary-sm"
                    onClick={() => {
                      setIdentityModalOpen(false);
                      navigate('/bookings');
                    }}
                  >
                    Trader Bookings
                  </button>
                  <button
                    type="button"
                    className="btn-secondary-sm"
                    onClick={() => {
                      setIdentityModalOpen(false);
                      navigate('/provider');
                    }}
                  >
                    Provider Dashboard
                  </button>
                  <button
                    type="button"
                    className="btn-secondary-sm"
                    onClick={() => {
                      setIdentityModalOpen(false);
                      navigate('/admin');
                    }}
                  >
                    Admin Overview
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <div className="modal-db-indicator">
                <Database size={14} />
                <span>Live Account Sync</span>
              </div>
              <button
                type="button"
                className="btn-orange-primary"
                onClick={() => setIdentityModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feature B: In-App Notifications Modal */}
      {notificationsOpen && (
        <div className="modal-backdrop" onClick={() => setNotificationsOpen(false)}>
          <div
            className="modal-card modal-card-lg"
            style={{ maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">IN-APP ALERTS &amp; REMINDERS</span>
                <h3 className="modal-title">
                  Notifications for {badge.role} #{badge.id} ({badge.name})
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setNotificationsOpen(false)}
                aria-label="Close notifications"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#475569' }}>
                  <strong>{unreadCount}</strong> unread of <strong>{notifications.length}</strong> total alerts
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-secondary-sm"
                    onClick={handleRunDueReminders}
                    disabled={notifLoading}
                  >
                    <RefreshCw size={13} />
                    <span>Check Due Reminders</span>
                  </button>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="btn-orange-primary btn-sm"
                      onClick={handleMarkAllRead}
                      disabled={notifLoading}
                    >
                      <CheckCircle2 size={13} />
                      <span>Mark All Read</span>
                    </button>
                  )}
                </div>
              </div>

              {notifLoading ? (
                <p style={{ fontSize: '13px', color: '#64748b' }}>Loading notifications...</p>
              ) : notifications.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <Bell size={28} className="text-orange" style={{ marginBottom: '8px' }} />
                  <p style={{ margin: 0, fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                    No notifications yet for {badge.name}.
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Deadline changes, document review actions, rollover decisions, and 5d/2d/1d/day-of reminders appear here automatically.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {notifications.map((n) => (
                    <div
                      key={n.notification_id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: n.is_read ? '1px solid #e2e8f0' : '1px solid #fdba74',
                        background: n.is_read ? '#ffffff' : '#fff7ed',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '10px',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {!n.is_read && (
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ea580c', display: 'inline-block' }} />
                          )}
                          <strong style={{ fontSize: '13px', color: '#0f172a' }}>{n.title}</strong>
                          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                            {n.notification_type}
                          </span>
                          {n.booking_id && (
                            <span style={{ fontSize: '11px', color: '#ea580c', fontWeight: 600 }}>
                              Booking #{n.booking_id}
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '4px 0', fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
                          {n.message}
                        </p>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                      </div>

                      {!n.is_read && (
                        <button
                          type="button"
                          className="btn-ghost-sm"
                          onClick={() => handleMarkOneRead(n.notification_id)}
                          style={{ whiteSpace: 'nowrap', fontSize: '11px' }}
                        >
                          Mark Read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary-outline"
                onClick={() => setNotificationsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
