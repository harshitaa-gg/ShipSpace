import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Box,
  Search,
  ArrowRight,
  Play,
  Share2,
  Users,
  Globe,
  ShieldCheck,
  Coins,
  Clock,
  FileSearch,
  Shuffle,
  ClipboardCheck,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import { useIdentity } from '../context/IdentityContext';

/**
 * Custom SVG icons matching the reference screenshot's statistics strip
 */
function PortCraneIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" stroke="#334e68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 31h26" />
      <path d="M9 31V11l7-5 7 5v20" />
      <path d="M6 11h24" />
      <path d="M9 17h14" />
      <path d="M9 23h14" />
      <path d="M26 11v9" />
      <rect x="23" y="20" width="6" height="5" rx="1" />
    </svg>
  );
}

function ContainerBoxIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" stroke="#334e68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="9" width="26" height="19" rx="2" />
      <line x1="11.5" y1="13" x2="11.5" y2="24" />
      <line x1="18" y1="13" x2="18" y2="24" />
      <line x1="24.5" y1="13" x2="24.5" y2="24" />
      <path d="M13 9V6h10v3" />
    </svg>
  );
}

function WeightBlockIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <path d="M12 3a3 3 0 0 0-2.65 4.4L5.6 19.2A2 2 0 0 0 7.5 22h9a2 2 0 0 0 1.9-2.8L14.65 7.4A3 3 0 0 0 12 3zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
    </svg>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { ports, cargoTypes } = useIdentity();

  const [originPortId, setOriginPortId] = useState('');
  const [destinationPortId, setDestinationPortId] = useState('');
  const [cargoTypeId, setCargoTypeId] = useState('');
  const [volumeCbm, setVolumeCbm] = useState('');
  const [weightKg, setWeightKg] = useState('');

  const handleHeroSearchSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (originPortId) params.set('origin_port_id', originPortId);
    if (destinationPortId) params.set('destination_port_id', destinationPortId);
    if (cargoTypeId) params.set('cargo_type_id', cargoTypeId);
    if (volumeCbm) params.set('required_cbm', volumeCbm);
    if (weightKg) {
      // Hero card displays Weight (kg) e.g. 1000; pass weight_kg so Search page converts to tonnes (1000 kg = 1.0 t)
      params.set('weight_kg', weightKg);
    }
    navigate(`/search?${params.toString()}`);
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="home-page">
      {/* =====================================================================
          1. HERO SECTION (Deep Navy with Flat World Map & Search Card)
          ===================================================================== */}
      <section className="hero-section">
        {/* World map graphic positioned across center-right of the hero */}
        <div
          className="hero-map-backdrop"
          style={{ backgroundImage: `url('/assets/world-map-hero.png')` }}
          aria-hidden="true"
        />

        <div className="hero-container">
          {/* Left Marketing Column */}
          <div className="hero-left-col">
            <div className="section-eyebrow hero-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text">LESS-THAN-CONTAINER-LOAD (LCL)</span>
            </div>

            <h1 className="hero-heading">
              <span className="hero-heading-line">Global shipping.</span>
              <span className="hero-heading-line hero-heading-orange">Shared capacity.</span>
              <span className="hero-heading-line">Smarter logistics.</span>
            </h1>

            <p className="hero-description">
              Find and book LCL cargo space from trusted logistics providers. Compare routes, check
              real-time capacity and move your cargo with confidence.
            </p>

            <div className="hero-cta-row">
              <button
                type="button"
                className="btn-hero-primary"
                onClick={() => navigate('/search')}
              >
                <span>Find Cargo Space</span>
                <ArrowRight size={17} strokeWidth={2.3} />
              </button>

              <button
                type="button"
                className="btn-hero-outline"
                onClick={() => scrollToSection('about-shipspace')}
              >
                <span>Learn More</span>
                <Play size={14} className="play-triangle-icon" />
              </button>
            </div>
          </div>

          {/* Right Search Card ("Find LCL Cargo Space") */}
          <div className="hero-right-col">
            <div className="hero-search-card">
              <div className="hero-card-header">
                <h2 className="hero-card-title">Find LCL Cargo Space</h2>
                <p className="hero-card-subtitle">
                  Search available capacity from
                  <br />
                  our network of logistics providers
                </p>
              </div>

              <form className="hero-search-form" onSubmit={handleHeroSearchSubmit}>
                {/* Origin Port */}
                <div className="hero-field-group">
                  <label className="hero-field-label" htmlFor="hero-origin-port">
                    Origin Port
                  </label>
                  <div className="hero-input-wrapper">
                    <MapPin size={16} className="hero-field-icon" />
                    <select
                      id="hero-origin-port"
                      className={`hero-select ${!originPortId ? 'placeholder-selected' : ''}`}
                      value={originPortId}
                      onChange={(e) => setOriginPortId(e.target.value)}
                    >
                      <option value="">Select origin port</option>
                      {ports.map((port) => (
                        <option key={port.port_id} value={port.port_id}>
                          {port.port_code} — {port.port_name} ({port.country})
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="hero-select-chevron" />
                  </div>
                </div>

                {/* Destination Port */}
                <div className="hero-field-group">
                  <label className="hero-field-label" htmlFor="hero-dest-port">
                    Destination Port
                  </label>
                  <div className="hero-input-wrapper">
                    <MapPin size={16} className="hero-field-icon" />
                    <select
                      id="hero-dest-port"
                      className={`hero-select ${!destinationPortId ? 'placeholder-selected' : ''}`}
                      value={destinationPortId}
                      onChange={(e) => setDestinationPortId(e.target.value)}
                    >
                      <option value="">Select destination port</option>
                      {ports.map((port) => (
                        <option key={port.port_id} value={port.port_id}>
                          {port.port_code} — {port.port_name} ({port.country})
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="hero-select-chevron" />
                  </div>
                </div>

                {/* Cargo Type */}
                <div className="hero-field-group">
                  <label className="hero-field-label" htmlFor="hero-cargo-type">
                    Cargo Type
                  </label>
                  <div className="hero-input-wrapper">
                    <Box size={16} className="hero-field-icon" />
                    <select
                      id="hero-cargo-type"
                      className={`hero-select ${!cargoTypeId ? 'placeholder-selected' : ''}`}
                      value={cargoTypeId}
                      onChange={(e) => setCargoTypeId(e.target.value)}
                    >
                      <option value="">Select cargo type</option>
                      {cargoTypes.map((ct) => (
                        <option key={ct.cargo_type_id} value={ct.cargo_type_id}>
                          {ct.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="hero-select-chevron" />
                  </div>
                </div>

                {/* Volume (CBM) & Weight (kg) */}
                <div className="hero-field-row-2col">
                  <div className="hero-field-group">
                    <label className="hero-field-label" htmlFor="hero-volume-cbm">
                      Volume (CBM)
                    </label>
                    <div className="hero-input-wrapper">
                      <Box size={16} className="hero-field-icon" />
                      <input
                        id="hero-volume-cbm"
                        type="number"
                        step="0.1"
                        min="0.1"
                        className="hero-input"
                        placeholder="e.g. 1.5"
                        value={volumeCbm}
                        onChange={(e) => setVolumeCbm(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="hero-field-group">
                    <label className="hero-field-label" htmlFor="hero-weight-kg">
                      Weight (kg)
                    </label>
                    <div className="hero-input-wrapper">
                      <span className="hero-field-icon">
                        <WeightBlockIcon size={16} />
                      </span>
                      <input
                        id="hero-weight-kg"
                        type="number"
                        step="10"
                        min="10"
                        className="hero-input"
                        placeholder="e.g. 1000"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <button type="submit" className="hero-submit-btn">
                  <Search size={16} strokeWidth={2.4} />
                  <span>Search Listings</span>
                  <ArrowRight size={16} strokeWidth={2.4} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          2. PLATFORM STATISTICS STRIP
          ===================================================================== */}
      <section className="stats-strip-section" aria-label="Platform Statistics">
        <div className="stats-strip-inner">
          <div className="stat-item">
            <div className="stat-icon-box">
              <PortCraneIcon />
            </div>
            <div className="stat-number">12</div>
            <div className="stat-meta">
              <span className="stat-title">Major Ports</span>
              <span className="stat-sub">Across key trade hubs</span>
            </div>
          </div>

          <div className="stat-divider" aria-hidden="true" />

          <div className="stat-item">
            <div className="stat-icon-box">
              <Share2 size={31} strokeWidth={1.9} color="#334e68" />
            </div>
            <div className="stat-number">24</div>
            <div className="stat-meta">
              <span className="stat-title">Active Routes</span>
              <span className="stat-sub">Domestic &amp; International</span>
            </div>
          </div>

          <div className="stat-divider" aria-hidden="true" />

          <div className="stat-item">
            <div className="stat-icon-box">
              <ContainerBoxIcon />
            </div>
            <div className="stat-number">45</div>
            <div className="stat-meta">
              <span className="stat-title">Capacity Listings</span>
              <span className="stat-sub">Available now</span>
            </div>
          </div>

          <div className="stat-divider" aria-hidden="true" />

          <div className="stat-item">
            <div className="stat-icon-box">
              <Users size={32} strokeWidth={1.9} color="#334e68" />
            </div>
            <div className="stat-number">10+</div>
            <div className="stat-meta">
              <span className="stat-title">Logistics Providers</span>
              <span className="stat-sub">Trusted partners</span>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. ABOUT SHIPSPACE SECTION
          ===================================================================== */}
      <section id="about-shipspace" className="about-section">
        <div className="about-inner">
          {/* Left Column: Text + CTA */}
          <div className="about-left-col">
            <div className="section-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text-muted">ABOUT SHIPSPACE</span>
            </div>

            <h2 className="about-heading">
              Connecting
              <br />
              Global Trade
            </h2>

            <p className="about-paragraph">
              ShipSpace is a database-centred platform that connects logistics providers with
              traders for efficient and reliable LCL (Less-than-Container-Load) shipments. We make
              it easy to find, book and manage cargo space — with complete transparency and
              real-time capacity information.
            </p>

            <button
              type="button"
              className="btn-about-outline"
              onClick={() => navigate('/search')}
            >
              <span>Learn More</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Center Column: Container Ship Image */}
          <div className="about-center-col">
            <div className="about-image-frame">
              <img
                src="/assets/container-ship-about.jpg"
                alt="Loaded container vessel docked at port terminal at sunset"
                className="about-ship-img"
              />
            </div>
          </div>

          {/* Right Column: 4 Feature Rows */}
          <div className="about-right-col">
            <div className="about-feature-item">
              <div className="about-feature-icon-circle">
                <Globe size={20} strokeWidth={1.9} />
              </div>
              <div className="about-feature-text">
                <h3 className="about-feature-title">Wide Network</h3>
                <p className="about-feature-desc">
                  Access multiple logistics providers and global routes.
                </p>
              </div>
            </div>

            <div className="about-feature-item">
              <div className="about-feature-icon-circle">
                <ShieldCheck size={20} strokeWidth={1.9} />
              </div>
              <div className="about-feature-text">
                <h3 className="about-feature-title">Reliable &amp; Secure</h3>
                <p className="about-feature-desc">
                  Database-backed booking with strict capacity checks.
                </p>
              </div>
            </div>

            <div className="about-feature-item">
              <div className="about-feature-icon-circle">
                <Coins size={20} strokeWidth={1.9} />
              </div>
              <div className="about-feature-text">
                <h3 className="about-feature-title">Cost Efficient</h3>
                <p className="about-feature-desc">Pay only for the space you use.</p>
              </div>
            </div>

            <div className="about-feature-item">
              <div className="about-feature-icon-circle">
                <Clock size={20} strokeWidth={1.9} />
              </div>
              <div className="about-feature-text">
                <h3 className="about-feature-title">Real-Time Updates</h3>
                <p className="about-feature-desc">
                  Live capacity, schedules and status tracking.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          4. HOW IT WORKS SECTION
          ===================================================================== */}
      <section id="how-it-works" className="how-section">
        <div className="how-inner">
          {/* Left Header Block matching the screenshot */}
          <div className="how-left-col">
            <div className="section-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text-muted">HOW IT WORKS</span>
            </div>

            <h2 className="how-heading">From Search to Shipment</h2>
            <p className="how-subtext">
              Four streamlined steps backed by PostgreSQL stored procedures and real-time capacity
              verification.
            </p>
          </div>

          {/* Right 4 Step Cards */}
          <div className="how-cards-grid">
            <div className="how-step-card" onClick={() => navigate('/search')}>
              <div className="how-card-top">
                <div className="how-step-icon">
                  <FileSearch size={20} strokeWidth={1.9} />
                </div>
                <h3 className="how-step-title">Search</h3>
              </div>
              <p className="how-step-desc">
                Select your origin port, destination port, cargo type, volume and weight.
              </p>
            </div>

            <div className="how-step-card" onClick={() => navigate('/search')}>
              <div className="how-card-top">
                <div className="how-step-icon">
                  <Shuffle size={20} strokeWidth={1.9} />
                </div>
                <h3 className="how-step-title">Compare</h3>
              </div>
              <p className="how-step-desc">
                Compare available CBM, departure schedules and automated tariff quotes.
              </p>
            </div>

            <div className="how-step-card" onClick={() => navigate('/search')}>
              <div className="how-card-top">
                <div className="how-step-icon">
                  <ClipboardCheck size={20} strokeWidth={1.9} />
                </div>
                <h3 className="how-step-title">Book</h3>
              </div>
              <p className="how-step-desc">
                Lock container capacity instantly with row-level concurrency protection.
              </p>
            </div>

            <div className="how-step-card" onClick={() => navigate('/bookings')}>
              <div className="how-card-top">
                <div className="how-step-icon">
                  <SlidersHorizontal size={20} strokeWidth={1.9} />
                </div>
                <h3 className="how-step-title">Manage</h3>
              </div>
              <p className="how-step-desc">
                Track booking confirmations, view status history or cancel with capacity restore.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
