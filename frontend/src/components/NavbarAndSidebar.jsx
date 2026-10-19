import React, { useState } from 'react';
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
} from 'lucide-react';
import { useIdentity } from '../context/IdentityContext';

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
              <button
                type="button"
                className="topbar-link topbar-link-btn"
                onClick={() => scrollToSection('how-it-works')}
              >
                How It Works
              </button>
              <button
                type="button"
                className="topbar-link topbar-link-btn"
                onClick={() => scrollToSection('for-providers')}
              >
                For Providers
              </button>
              <button
                type="button"
                className="topbar-link topbar-link-btn"
                onClick={() => scrollToSection('for-traders')}
              >
                For Traders
              </button>
              <button
                type="button"
                className="topbar-link topbar-link-btn"
                onClick={() => scrollToSection('marketplace-preview')}
              >
                Marketplace
              </button>
            </nav>

            <div className="topbar-right-controls">
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

              {/* Sign In Navigation Link */}
              <Link to="/login" className="topbar-signin-btn">
                Sign In
              </Link>

              {/* Primary Get Started CTA Button */}
              <Link to="/register" className="topbar-getstarted-btn">
                Get Started
              </Link>

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
    </>
  );
}
