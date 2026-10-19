import React from 'react';
import { Link } from 'react-router-dom';
import { ShipSpaceLogoIcon } from './NavbarAndSidebar';
import { useIdentity } from '../context/IdentityContext';
import { Database, ShieldCheck, Mail, MapPin } from 'lucide-react';

export default function Footer() {
  const { dbConnected, platformSummary } = useIdentity();

  return (
    <footer className="app-footer">
      <div className="footer-inner">
        {/* Column 1: Brand & LCL Purpose */}
        <div className="footer-brand-col">
          <div className="footer-logo-row">
            <ShipSpaceLogoIcon size={28} />
            <span className="footer-brand-name">ShipSpace</span>
          </div>
          <p className="footer-desc">
            Digital marketplace for Less-than-Container Load (LCL) freight capacity. We connect
            asset-operating logistics providers with global cargo shippers for fractional container
            sharing backed by deterministic database concurrency controls.
          </p>
          <div className="footer-status-badge" title="Live Express & PostgreSQL connection status">
            <span className={`status-dot ${dbConnected ? 'online' : 'offline'}`} />
            <span>
              {dbConnected
                ? `PostgreSQL Connected · ${platformSummary?.open_listings ?? 45} Active Listings`
                : 'Backend API Offline'}
            </span>
          </div>
          <div className="footer-standards-row">
            <span className="footer-standard-tag">
              <ShieldCheck size={13} />
              <span>ACID Guarantees</span>
            </span>
            <span className="footer-standard-tag">
              <Database size={13} />
              <span>Row-Level Locks</span>
            </span>
          </div>
        </div>

        {/* Column 2: Marketplace Navigation */}
        <div className="footer-links-col">
          <h4 className="footer-col-title">Marketplace</h4>
          <ul className="footer-link-list">
            <li>
              <Link to="/search">Find Open Capacity</Link>
            </li>
            <li>
              <a href="/#how-it-works">How It Works</a>
            </li>
            <li>
              <a href="/#for-providers">For Logistics Providers</a>
            </li>
            <li>
              <a href="/#for-traders">For Cargo Shippers</a>
            </li>
            <li>
              <a href="/#marketplace-preview">Featured Trade Lanes</a>
            </li>
            <li>
              <Link to="/bookings">Trader Reservations</Link>
            </li>
            <li>
              <Link to="/provider">Provider Capacity Fleet</Link>
            </li>
            <li>
              <Link to="/admin">Platform Operations</Link>
            </li>
          </ul>
        </div>

        {/* Column 3: Account & Access */}
        <div className="footer-links-col">
          <h4 className="footer-col-title">Account &amp; Security</h4>
          <ul className="footer-link-list">
            <li>
              <Link to="/login">Sign In</Link>
            </li>
            <li>
              <Link to="/register">Create Account</Link>
            </li>
            <li>
              <Link to="/forgot-password">Reset Password</Link>
            </li>
            <li>
              <span className="footer-text-muted">Enterprise Access &amp; SSO</span>
            </li>
            <li>
              <span className="footer-text-muted">Role-Based Access Control (RBAC)</span>
            </li>
            <li>
              <span className="footer-text-muted">API Rate Limits &amp; Audit Logs</span>
            </li>
          </ul>
        </div>

        {/* Column 4: Trade Corridors & Support */}
        <div className="footer-links-col">
          <h4 className="footer-col-title">Global Trade Lanes</h4>
          <ul className="footer-link-list">
            <li className="footer-hub-item">
              <MapPin size={13} className="text-muted" />
              <span>INBOM (Mumbai) ↔ AEDXB (Dubai)</span>
            </li>
            <li className="footer-hub-item">
              <MapPin size={13} className="text-muted" />
              <span>CNSHA (Shanghai) ↔ NLRTM (Rotterdam)</span>
            </li>
            <li className="footer-hub-item">
              <MapPin size={13} className="text-muted" />
              <span>SGSIN (Singapore) ↔ DEHAM (Hamburg)</span>
            </li>
            <li className="footer-hub-item">
              <MapPin size={13} className="text-muted" />
              <span>INNSA (Nhava Sheva) ↔ SGSIN (Singapore)</span>
            </li>
          </ul>
          <div className="footer-contact-box">
            <span className="footer-contact-label">Platform Support</span>
            <a href="mailto:support@shipspace.lcl" className="footer-contact-link">
              <Mail size={13} />
              <span>support@shipspace.lcl</span>
            </a>
          </div>
        </div>
      </div>

      <div className="footer-bottom-bar">
        <div className="footer-copy-text">
          &copy; {new Date().getFullYear()} ShipSpace Technologies. LCL Freight Capacity Marketplace.
          All rights reserved.
        </div>
        <div className="footer-bottom-links">
          <span>W/M Tariff Standard (1 CBM = 1,000 kg)</span>
          <span className="footer-dot-sep">·</span>
          <span>UN/LOCODE Standardized Ports</span>
          <span className="footer-dot-sep">·</span>
          <span>Deterministic Capacity Allocation</span>
        </div>
      </div>
    </footer>
  );
}
