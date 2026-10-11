import React from 'react';
import { Link } from 'react-router-dom';
import { ShipSpaceLogoIcon } from './NavbarAndSidebar';
import { useIdentity } from '../context/IdentityContext';

export default function Footer() {
  const { dbConnected, platformSummary } = useIdentity();

  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <div className="footer-brand-col">
          <div className="footer-logo-row">
            <ShipSpaceLogoIcon size={26} />
            <span className="footer-brand-name">ShipSpace</span>
          </div>
          <p className="footer-desc">
            Database-centred LCL (Less-than-Container-Load) shipping capacity marketplace connecting
            logistics providers and global traders with real-time PostgreSQL capacity control.
          </p>
          <div className="footer-status-badge">
            <span className={`status-dot ${dbConnected ? 'online' : 'offline'}`} />
            <span>
              {dbConnected
                ? `PostgreSQL Connected · ${platformSummary?.open_listings ?? 45} Active Listings`
                : 'Backend API Disconnected'}
            </span>
          </div>
        </div>

        <div className="footer-links-col">
          <h4 className="footer-col-title">Platform</h4>
          <ul className="footer-link-list">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/search">Search Cargo Space</Link></li>
            <li><Link to="/bookings">Trader Bookings</Link></li>
            <li><Link to="/provider">Provider Dashboard</Link></li>
            <li><Link to="/admin">Admin Overview</Link></li>
          </ul>
        </div>

        <div className="footer-links-col">
          <h4 className="footer-col-title">Database &amp; Architecture</h4>
          <ul className="footer-link-list">
            <li><span>sp_create_booking (Row-Locked)</span></li>
            <li><span>sp_cancel_booking (Capacity Restore)</span></li>
            <li><span>fn_calculate_booking_price</span></li>
            <li><span>trg_booking_status_audit</span></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom-bar">
        <span>&copy; {new Date().getFullYear()} ShipSpace LCL Marketplace. Built with React, Express &amp; PostgreSQL.</span>
        <span className="footer-phase-tag">DBMS Phase 8 Full-Stack Application</span>
      </div>
    </footer>
  );
}
