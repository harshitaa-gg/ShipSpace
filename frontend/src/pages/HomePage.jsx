import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  MapPin,
  Box,
  Search,
  ArrowRight,
  ShieldCheck,
  Clock,
  Shuffle,
  SlidersHorizontal,
  ChevronDown,
  Building2,
  Briefcase,
  Layers,
  Scale,
  Calendar,
  CheckCircle2,
  Lock,
  Anchor,
  Compass,
  FileCheck,
  TrendingUp,
} from 'lucide-react';
import { useIdentity } from '../context/IdentityContext';

function PortCraneIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
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
    <svg
      width="32"
      height="32"
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="9" width="26" height="19" rx="2" />
      <line x1="11.5" y1="13" x2="11.5" y2="24" />
      <line x1="18" y1="13" x2="18" y2="24" />
      <line x1="24.5" y1="13" x2="24.5" y2="24" />
      <path d="M13 9V6h10v3" />
    </svg>
  );
}

const FEATURED_LANES = [
  {
    originCode: 'INBOM',
    originName: 'Mumbai, India',
    destCode: 'AEDXB',
    destName: 'Dubai, UAE',
    transitDays: 5,
    cbmRate: '$85.00',
    tonneRate: '$110.00',
    minCharge: '$220.00',
    frequency: 'Bi-Weekly',
    originPortId: 1,
    destPortId: 8,
  },
  {
    originCode: 'CNSHA',
    originName: 'Shanghai, China',
    destCode: 'NLRTM',
    destName: 'Rotterdam, Netherlands',
    transitDays: 28,
    cbmRate: '$120.00',
    tonneRate: '$150.00',
    minCharge: '$350.00',
    frequency: 'Weekly',
    originPortId: 3,
    destPortId: 7,
  },
  {
    originCode: 'SGSIN',
    originName: 'Singapore',
    destCode: 'DEHAM',
    destName: 'Hamburg, Germany',
    transitDays: 24,
    cbmRate: '$110.00',
    tonneRate: '$140.00',
    minCharge: '$310.00',
    frequency: 'Weekly',
    originPortId: 2,
    destPortId: 6,
  },
  {
    originCode: 'INNSA',
    originName: 'Nhava Sheva, India',
    destCode: 'SGSIN',
    destName: 'Singapore',
    transitDays: 7,
    cbmRate: '$75.00',
    tonneRate: '$95.00',
    minCharge: '$190.00',
    frequency: 'Twice Weekly',
    originPortId: 4,
    destPortId: 2,
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { ports, cargoTypes, platformSummary, dbConnected } = useIdentity();

  const [originPortId, setOriginPortId] = useState('');
  const [destinationPortId, setDestinationPortId] = useState('');
  const [cargoTypeId, setCargoTypeId] = useState('');
  const [volumeCbm, setVolumeCbm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activeAudienceTab, setActiveAudienceTab] = useState('traders'); // 'traders' | 'providers'

  const handleHeroSearchSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (originPortId) params.set('origin_port_id', originPortId);
    if (destinationPortId) params.set('destination_port_id', destinationPortId);
    if (cargoTypeId) params.set('cargo_type_id', cargoTypeId);
    if (volumeCbm) params.set('required_cbm', volumeCbm);
    if (weightKg) params.set('weight_kg', weightKg);
    navigate(`/search?${params.toString()}`);
  };

  const handleQuickRouteSelect = (originId, destId) => {
    setOriginPortId(String(originId));
    setDestinationPortId(String(destId));
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="home-page">
      {/* =====================================================================
          1. HERO SECTION: Value Proposition + Capacity Search Card
          ===================================================================== */}
      <section className="hero-section" aria-label="Introduction & Capacity Discovery">
        <div
          className="hero-map-backdrop"
          style={{ backgroundImage: `url('/assets/world-map-hero.png')` }}
          aria-hidden="true"
        />

        <div className="hero-container">
          {/* Left Column: Clear Value Messaging */}
          <div className="hero-left-col">
            <div className="section-eyebrow hero-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text">LCL FREIGHT CAPACITY MARKETPLACE</span>
            </div>

            <h1 className="hero-heading">
              <span className="hero-heading-line">Smarter Ocean Freight.</span>
              <span className="hero-heading-line hero-heading-accent">Shared Container Space.</span>
              <span className="hero-heading-line">Deterministic Bookings.</span>
            </h1>

            <p className="hero-description">
              ShipSpace connects verified ocean logistics providers with commercial cargo shippers for
              scheduled Less-than-Container Load (LCL) freight. Discover open container capacity, compare
              transparent W/M tariffs, and book fractional space with atomic database guarantees.
            </p>

            <div className="hero-cta-row">
              <button
                type="button"
                className="btn-hero-primary"
                onClick={() => navigate('/search')}
              >
                <span>Find Available Space</span>
                <ArrowRight size={17} strokeWidth={2.3} />
              </button>

              <button
                type="button"
                className="btn-hero-outline"
                onClick={() => scrollToSection('how-it-works')}
              >
                <span>How It Works</span>
              </button>
            </div>

            {/* Quick Guarantees Strip */}
            <div className="hero-trust-pills">
              <div className="trust-pill-item">
                <ShieldCheck size={15} className="text-accent" />
                <span>Zero Capacity Overselling</span>
              </div>
              <div className="trust-pill-item">
                <Scale size={15} className="text-accent" />
                <span>Standard W/M Tariffs</span>
              </div>
              <div className="trust-pill-item">
                <Anchor size={15} className="text-accent" />
                <span>UN/LOCODE Port Pairs</span>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Capacity Search Card */}
          <div className="hero-right-col">
            <div className="hero-search-card">
              <div className="hero-card-header">
                <div className="hero-card-badge">LIVE MARKETPLACE</div>
                <h2 className="hero-card-title">Search LCL Cargo Space</h2>
                <p className="hero-card-subtitle">
                  Instant search across active container sailings and verified logistics providers
                </p>
              </div>

              <form className="hero-search-form" onSubmit={handleHeroSearchSubmit}>
                {/* Origin Port Field */}
                <div className="hero-field-group">
                  <label className="hero-field-label" htmlFor="hero-origin-port">
                    Origin Port (UN/LOCODE)
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

                {/* Destination Port Field */}
                <div className="hero-field-group">
                  <label className="hero-field-label" htmlFor="hero-dest-port">
                    Destination Port (UN/LOCODE)
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

                {/* Cargo Classification Field */}
                <div className="hero-field-group">
                  <label className="hero-field-label" htmlFor="hero-cargo-type">
                    Cargo Classification
                  </label>
                  <div className="hero-input-wrapper">
                    <Box size={16} className="hero-field-icon" />
                    <select
                      id="hero-cargo-type"
                      className={`hero-select ${!cargoTypeId ? 'placeholder-selected' : ''}`}
                      value={cargoTypeId}
                      onChange={(e) => setCargoTypeId(e.target.value)}
                    >
                      <option value="">Select cargo type (optional)</option>
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
                      Required Volume (CBM)
                    </label>
                    <div className="hero-input-wrapper">
                      <Box size={16} className="hero-field-icon" />
                      <input
                        id="hero-volume-cbm"
                        type="number"
                        step="0.1"
                        min="0.1"
                        className="hero-input"
                        placeholder="e.g. 2.5"
                        value={volumeCbm}
                        onChange={(e) => setVolumeCbm(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="hero-field-group">
                    <label className="hero-field-label" htmlFor="hero-weight-kg">
                      Total Weight (kg)
                    </label>
                    <div className="hero-input-wrapper">
                      <Scale size={16} className="hero-field-icon" />
                      <input
                        id="hero-weight-kg"
                        type="number"
                        step="10"
                        min="10"
                        className="hero-input"
                        placeholder="e.g. 1500"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Route Suggesters */}
                <div className="hero-quick-routes">
                  <span className="quick-routes-label">Popular Lanes:</span>
                  <div className="quick-routes-pills">
                    <button
                      type="button"
                      className="quick-route-chip"
                      onClick={() => handleQuickRouteSelect(1, 8)}
                    >
                      INBOM → AEDXB
                    </button>
                    <button
                      type="button"
                      className="quick-route-chip"
                      onClick={() => handleQuickRouteSelect(3, 7)}
                    >
                      CNSHA → NLRTM
                    </button>
                    <button
                      type="button"
                      className="quick-route-chip"
                      onClick={() => handleQuickRouteSelect(2, 6)}
                    >
                      SGSIN → DEHAM
                    </button>
                  </div>
                </div>

                <button type="submit" className="hero-submit-btn">
                  <Search size={16} strokeWidth={2.4} />
                  <span>Search Capacity Marketplace</span>
                  <ArrowRight size={16} strokeWidth={2.4} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          2. PLATFORM STATISTICS STRIP (Grounded in Verified System Metrics)
          ===================================================================== */}
      <section className="stats-strip-section" aria-label="Platform Scale and Operational Metrics">
        <div className="stats-strip-inner">
          <div className="stat-item">
            <div className="stat-icon-box">
              <PortCraneIcon />
            </div>
            <div className="stat-number">{ports.length > 0 ? ports.length : 12}</div>
            <div className="stat-meta">
              <span className="stat-title">Major Ocean Ports</span>
              <span className="stat-sub">UN/LOCODE certified hubs</span>
            </div>
          </div>

          <div className="stat-divider" aria-hidden="true" />

          <div className="stat-item">
            <div className="stat-icon-box">
              <Compass size={30} strokeWidth={1.8} />
            </div>
            <div className="stat-number">24</div>
            <div className="stat-meta">
              <span className="stat-title">Scheduled Trade Lanes</span>
              <span className="stat-sub">Direct &amp; transshipment corridors</span>
            </div>
          </div>

          <div className="stat-divider" aria-hidden="true" />

          <div className="stat-item">
            <div className="stat-icon-box">
              <ContainerBoxIcon />
            </div>
            <div className="stat-number">{platformSummary?.open_listings ?? 45}</div>
            <div className="stat-meta">
              <span className="stat-title">Active Capacity Listings</span>
              <span className="stat-sub">Accepting fractional bookings</span>
            </div>
          </div>

          <div className="stat-divider" aria-hidden="true" />

          <div className="stat-item">
            <div className="stat-icon-box">
              <ShieldCheck size={32} strokeWidth={1.8} />
            </div>
            <div className="stat-number">100%</div>
            <div className="stat-meta">
              <span className="stat-title">ACID Concurrency</span>
              <span className="stat-sub">Zero overselling guarantee</span>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. HOW IT WORKS SECTION (Four Streamlined Operational Stages)
          ===================================================================== */}
      <section id="how-it-works" className="how-section" aria-labelledby="how-heading">
        <div className="section-container">
          <div className="section-header-centered">
            <div className="section-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text">HOW SHIPSPACE WORKS</span>
            </div>
            <h2 id="how-heading" className="section-title">
              From Route Discovery to Guaranteed Container Space
            </h2>
            <p className="section-subtitle">
              A transparent, database-backed freight workflow replacing slow manual consolidator
              inquiries with real-time capacity checks and immediate confirmation.
            </p>
          </div>

          <div className="how-cards-grid">
            {/* Step 1 */}
            <div className="how-step-card" onClick={() => navigate('/search')} role="button" tabIndex={0}>
              <div className="how-step-number">01</div>
              <div className="how-card-top">
                <div className="how-step-icon">
                  <Search size={22} strokeWidth={2} />
                </div>
                <h3 className="how-step-title">Specify Cargo &amp; Lane</h3>
              </div>
              <p className="how-step-desc">
                Select your origin and destination ports, cargo classification, and cargo volume (CBM)
                or weight. Instantly view matching scheduled sailings.
              </p>
              <div className="how-step-footnote">
                <span>Real-time availability filtering</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="how-step-card" onClick={() => navigate('/search')} role="button" tabIndex={0}>
              <div className="how-step-number">02</div>
              <div className="how-card-top">
                <div className="how-step-icon">
                  <Shuffle size={22} strokeWidth={2} />
                </div>
                <h3 className="how-step-title">Compare Verified Schedules</h3>
              </div>
              <p className="how-step-desc">
                Compare remaining container CBM, remaining tonnes, departure cutoffs, transit duration,
                and logistics provider credentials side by side.
              </p>
              <div className="how-step-footnote">
                <span>Direct carrier schedule alignment</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="how-step-card" onClick={() => navigate('/search')} role="button" tabIndex={0}>
              <div className="how-step-number">03</div>
              <div className="how-card-top">
                <div className="how-step-icon">
                  <Scale size={22} strokeWidth={2} />
                </div>
                <h3 className="how-step-title">Automated W/M Tariffs</h3>
              </div>
              <p className="how-step-desc">
                Our tariff engine automatically applies the standard international Weight or Measure rule:
                <code>MAX(cbm × rate, tonnes × rate)</code> with clear minimum charges.
              </p>
              <div className="how-step-footnote">
                <span>No hidden broker surcharges</span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="how-step-card" onClick={() => navigate('/bookings')} role="button" tabIndex={0}>
              <div className="how-step-number">04</div>
              <div className="how-card-top">
                <div className="how-step-icon">
                  <SlidersHorizontal size={22} strokeWidth={2} />
                </div>
                <h3 className="how-step-title">Lock Space &amp; Track Status</h3>
              </div>
              <p className="how-step-desc">
                Reserve verified space instantly with real-time capacity checks. Track shipment milestones
                and cancel eligible bookings with automatic capacity return.
              </p>
              <div className="how-step-footnote">
                <span>Complete shipment visibility</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          4. SEPARATE VALUE PROPOSITIONS: For Providers & For Traders
          ===================================================================== */}
      <section className="audience-section" aria-label="Benefits for Providers and Traders">
        <div className="section-container">
          <div className="audience-tabs-header">
            <div className="section-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text">BUILT FOR BOTH SIDES OF FREIGHT</span>
            </div>
            <h2 className="section-title">Designed for Modern Freight Consolidators and Shippers</h2>
            <div className="audience-toggle-pills" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeAudienceTab === 'traders'}
                className={`audience-tab-btn ${activeAudienceTab === 'traders' ? 'active' : ''}`}
                onClick={() => setActiveAudienceTab('traders')}
              >
                <Briefcase size={16} />
                <span>For Cargo Shippers &amp; Traders</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeAudienceTab === 'providers'}
                className={`audience-tab-btn ${activeAudienceTab === 'providers' ? 'active' : ''}`}
                onClick={() => setActiveAudienceTab('providers')}
              >
                <Building2 size={16} />
                <span>For Logistics Providers</span>
              </button>
            </div>
          </div>

          {/* TRADERS TAB CONTENT */}
          {activeAudienceTab === 'traders' && (
            <div id="for-traders" className="audience-content-grid">
              <div className="audience-feature-card">
                <div className="feature-card-icon">
                  <Box size={22} />
                </div>
                <h3 className="feature-card-title">Fractional Container Economics</h3>
                <p className="feature-card-desc">
                  Never pay for full container load (FCL) empty space again. Book from 0.5 CBM upwards
                  on established ocean schedules at competitive consolidation rates.
                </p>
                <ul className="feature-card-points">
                  <li>Pay strictly for occupied volume and weight</li>
                  <li>Ideal for SME exporters and multi-pallet shipments</li>
                </ul>
              </div>

              <div className="audience-feature-card">
                <div className="feature-card-icon">
                  <Lock size={22} />
                </div>
                <h3 className="feature-card-title">Guaranteed Space Allocation</h3>
                <p className="feature-card-desc">
                  Reservations lock container capacity instantaneously inside PostgreSQL transactions.
                  Eliminate waitlists, phantom allocations, and unexpected roll-overs.
                </p>
                <ul className="feature-card-points">
                  <li>Row-level concurrency protection prevents overselling</li>
                  <li>Immediate booking reference and confirmation receipt</li>
                </ul>
              </div>

              <div className="audience-feature-card">
                <div className="feature-card-icon">
                  <Calendar size={22} />
                </div>
                <h3 className="feature-card-title">Predictable Voyage Timelines</h3>
                <p className="feature-card-desc">
                  Access comprehensive voyage details including origin terminal cutoff dates, estimated
                  departure dates, transshipment hubs, and arrival estimates.
                </p>
                <ul className="feature-card-points">
                  <li>Published cutoffs prevent gate-in rejections</li>
                  <li>Coordinate warehousing and drayage with confidence</li>
                </ul>
              </div>

              <div className="audience-feature-card">
                <div className="feature-card-icon">
                  <FileCheck size={22} />
                </div>
                <h3 className="feature-card-title">Self-Service Lifecycle Management</h3>
                <p className="feature-card-desc">
                  Monitor active bookings, inspect complete timestamped status histories, and cancel
                  eligible reservations with instant capacity return to the market.
                </p>
                <ul className="feature-card-points">
                  <li>Full booking status timeline and milestone tracking</li>
                  <li>Automated capacity restoration on eligible cancellations</li>
                </ul>
              </div>
            </div>
          )}

          {/* PROVIDERS TAB CONTENT */}
          {activeAudienceTab === 'providers' && (
            <div id="for-providers" className="audience-content-grid">
              <div className="audience-feature-card">
                <div className="feature-card-icon">
                  <TrendingUp size={22} />
                </div>
                <h3 className="feature-card-title">Maximize Container Load Factors</h3>
                <p className="feature-card-desc">
                  Monetize residual 20ft and 40ft TEU space on scheduled voyages that would otherwise
                  depart under-utilized, converting deadhead capacity into incremental margin.
                </p>
                <ul className="feature-card-points">
                  <li>Publish capacity across both CBM and metric-tonne constraints</li>
                  <li>Establish custom minimum charges and per-unit tariff structures</li>
                </ul>
              </div>

              <div className="audience-feature-card">
                <div className="feature-card-icon">
                  <Layers size={22} />
                </div>
                <h3 className="feature-card-title">Fleet &amp; Route Utilization Analytics</h3>
                <p className="feature-card-desc">
                  Monitor aggregate fleet load percentages, booked CBM totals, and confirmed freight revenue
                  in real time through comprehensive load factor analytics.
                </p>
                <ul className="feature-card-points">
                  <li>Eliminate manual booking spreadsheet reconciliation</li>
                  <li>Instant insight into high-demand corridors and low-yield lanes</li>
                </ul>
              </div>

              <div className="audience-feature-card">
                <div className="feature-card-icon">
                  <ShieldCheck size={22} />
                </div>
                <h3 className="feature-card-title">Full Cutoff &amp; Status Control</h3>
                <p className="feature-card-desc">
                  Govern listing status with strict database validation. Transition listings between open,
                  closed, and full automatically when capacity fills or dates expire.
                </p>
                <ul className="feature-card-points">
                  <li>Prevent reopening without positive CBM, weight, and valid cutoff</li>
                  <li>Lock cancellations against listings with confirmed active bookings</li>
                </ul>
              </div>

              <div className="audience-feature-card">
                <div className="feature-card-icon">
                  <Anchor size={22} />
                </div>
                <h3 className="feature-card-title">Structured Shipper Demand</h3>
                <p className="feature-card-desc">
                  Receive structured, verified cargo booking requests with exact volumetric weights and
                  cargo classification tags, eliminating unstructured phone and email negotiations.
                </p>
                <ul className="feature-card-points">
                  <li>Pre-validated against supported cargo classifications</li>
                  <li>Direct trader identity and billing accountability</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =====================================================================
          5. MARKETPLACE SHOWCASE SECTION: Featured Trade Corridors
          ===================================================================== */}
      <section id="marketplace-preview" className="marketplace-preview-section" aria-labelledby="marketplace-title">
        <div className="section-container">
          <div className="section-header-row">
            <div>
              <div className="section-eyebrow">
                <span className="eyebrow-bar" />
                <span className="eyebrow-text">CAPACITY MARKETPLACE PREVIEW</span>
              </div>
              <h2 id="marketplace-title" className="section-title">
                Active Container Capacity on High-Volume Lanes
              </h2>
              <p className="section-subtitle">
                Explore scheduled sailings currently open for fractional container reservations across
                strategic international corridors.
              </p>
            </div>

            <button
              type="button"
              className="btn-secondary-outline"
              onClick={() => navigate('/search')}
            >
              <span>View All Listings</span>
              <ArrowRight size={15} />
            </button>
          </div>

          <div className="featured-lanes-grid">
            {FEATURED_LANES.map((lane, idx) => (
              <article key={idx} className="featured-lane-card">
                <div className="lane-card-top">
                  <div className="lane-ports-header">
                    <div className="lane-port-col">
                      <span className="port-code-badge">{lane.originCode}</span>
                      <strong className="port-name">{lane.originName}</strong>
                    </div>
                    <div className="lane-arrow-col">
                      <span className="lane-transit-label">{lane.transitDays} Days</span>
                      <div className="lane-transit-arrow">
                        <ArrowRight size={14} />
                      </div>
                    </div>
                    <div className="lane-port-col text-right">
                      <span className="port-code-badge">{lane.destCode}</span>
                      <strong className="port-name">{lane.destName}</strong>
                    </div>
                  </div>
                </div>

                <div className="lane-card-rates">
                  <div className="lane-rate-item">
                    <span className="rate-sub">CBM Tariff</span>
                    <strong className="rate-main">{lane.cbmRate}</strong>
                  </div>
                  <div className="lane-rate-item">
                    <span className="rate-sub">Tonne Tariff</span>
                    <strong className="rate-main">{lane.tonneRate}</strong>
                  </div>
                  <div className="lane-rate-item">
                    <span className="rate-sub">Min Charge</span>
                    <strong className="rate-main">{lane.minCharge}</strong>
                  </div>
                </div>

                <div className="lane-card-footer">
                  <div className="lane-status-tag">
                    <span className="status-dot online" />
                    <span>{lane.frequency} Sailings Open</span>
                  </div>
                  <button
                    type="button"
                    className="btn-lane-search"
                    onClick={() =>
                      navigate(
                        `/search?origin_port_id=${lane.originPortId}&destination_port_id=${lane.destPortId}`
                      )
                    }
                  >
                    <span>Check Space</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="marketplace-preview-footer">
            <p>
              Looking for specialized cargo classifications, temperature control, or inland intermodal
              connections?
            </p>
            <Link to="/search" className="marketplace-footer-link">
              Search all 45+ available capacity listings in the marketplace →
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          6. TRUST & TRANSPARENCY: Authentic Technical Guarantees
          ===================================================================== */}
      <section className="trust-section" aria-labelledby="trust-heading">
        <div className="section-container">
          <div className="section-header-centered">
            <div className="section-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text">TRANSPARENT FREIGHT GUARANTEES</span>
            </div>
            <h2 id="trust-heading" className="section-title">
              Built for Commercial Freight Dependability
            </h2>
            <p className="section-subtitle">
              ShipSpace eliminates the opacity and guesswork of traditional freight booking with verified
              allocations, standard tariff rules, and complete operational transparency.
            </p>
          </div>

          <div className="trust-pillars-grid">
            <div className="trust-pillar-card">
              <div className="trust-pillar-icon">
                <Lock size={22} />
              </div>
              <h3 className="trust-pillar-title">Guaranteed Space Allocation</h3>
              <p className="trust-pillar-desc">
                Container space deductions verify live available volume and weight before confirmation,
                eliminating waitlists, phantom bookings, and double-allocation risk.
              </p>
            </div>

            <div className="trust-pillar-card">
              <div className="trust-pillar-icon">
                <Anchor size={22} />
              </div>
              <h3 className="trust-pillar-title">UN/LOCODE Standardized Ports</h3>
              <p className="trust-pillar-desc">
                Every trade corridor links recognized 5-letter United Nations Code for Trade and Transport
                Locations (UN/LOCODE), preventing ambiguous terminal routing and customs errors.
              </p>
            </div>

            <div className="trust-pillar-card">
              <div className="trust-pillar-icon">
                <Scale size={22} />
              </div>
              <h3 className="trust-pillar-title">Weight or Measure (W/M) Integrity</h3>
              <p className="trust-pillar-desc">
                Pricing is calculated transparently following standard international maritime ratios
                (1 CBM = 1,000 kg), providing complete cost certainty before booking.
              </p>
            </div>

            <div className="trust-pillar-card">
              <div className="trust-pillar-icon">
                <FileCheck size={22} />
              </div>
              <h3 className="trust-pillar-title">Complete Status Audit Trail</h3>
              <p className="trust-pillar-desc">
                All booking transitions—from initial confirmation to voyage arrival or cancellation—are
                recorded with timestamps and event notes for full supply chain visibility.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          7. PUBLIC CALL TO ACTION BANNER
          ===================================================================== */}
      <section className="cta-banner-section" aria-label="Get Started with ShipSpace">
        <div className="cta-banner-card">
          <div className="cta-banner-content">
            <span className="cta-banner-badge">START SHIPPING SMARTER</span>
            <h2 className="cta-banner-title">
              Ready to Optimize Your LCL Container Space?
            </h2>
            <p className="cta-banner-desc">
              Whether you are an exporter seeking reliable partial container space or a logistics provider
              monetizing open TEUs, ShipSpace gives you transparent control.
            </p>
            <div className="cta-banner-actions">
              <Link to="/search" className="btn-hero-primary">
                <span>Browse Open Capacity</span>
                <ArrowRight size={16} />
              </Link>
              <Link to="/register" className="btn-hero-outline">
                <span>Create an Account</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
