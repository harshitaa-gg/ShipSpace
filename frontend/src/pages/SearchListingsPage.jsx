import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search,
  MapPin,
  Box,
  Scale,
  Calendar,
  ArrowRight,
  SlidersHorizontal,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Building2,
  Ship,
  CheckCircle2,
  Package,
  FileText,
  Clock,
} from 'lucide-react';
import { api } from '../api/client';
import { useIdentity } from '../context/IdentityContext';
import BookingModal from '../components/BookingModal';

export default function SearchListingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { ports, cargoTypes, activeTrader } = useIdentity();

  // Filter state initialized from URL query params
  const [originPortId, setOriginPortId] = useState(searchParams.get('origin_port_id') || '');
  const [destinationPortId, setDestinationPortId] = useState(
    searchParams.get('destination_port_id') || ''
  );
  const [cargoTypeId, setCargoTypeId] = useState(searchParams.get('cargo_type_id') || '');
  const [requiredCbm, setRequiredCbm] = useState(searchParams.get('required_cbm') || '');

  // Support both weight_kg (from Hero card) and required_weight (tonnes)
  const initialWeightKgParam = searchParams.get('weight_kg');
  const initialWeightTonnesParam = searchParams.get('required_weight');

  const [weightUnit, setWeightUnit] = useState(initialWeightKgParam ? 'kg' : 'tonnes');
  const [weightInput, setWeightInput] = useState(() => {
    if (initialWeightKgParam) return initialWeightKgParam;
    if (initialWeightTonnesParam) return initialWeightTonnesParam;
    return '';
  });
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'price');

  // Listings data & mode ('search' when using /api/trader/listings/search, 'catalog' when browsing all open listings)
  const [listings, setListings] = useState([]);
  const [searchMode, setSearchMode] = useState('catalog');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [bookingListing, setBookingListing] = useState(null);

  // Convert current weightInput to tonnes for backend API calls
  const requiredWeightTonnes = useMemo(() => {
    const val = parseFloat(weightInput);
    if (!Number.isFinite(val) || val <= 0) return '';
    return weightUnit === 'kg' ? Number((val / 1000).toFixed(4)) : val;
  }, [weightInput, weightUnit]);

  const handleUnitSwitch = (newUnit) => {
    if (newUnit === weightUnit) return;
    const num = parseFloat(weightInput);
    if (Number.isFinite(num) && num > 0) {
      if (newUnit === 'kg') {
        setWeightInput(String(Math.round(num * 1000)));
      } else {
        setWeightInput(String(Number((num / 1000).toFixed(3))));
      }
    }
    setWeightUnit(newUnit);
  };

  const executeQuery = useCallback(
    async ({
      origin = originPortId,
      destination = destinationPortId,
      cargo = cargoTypeId,
      cbm = requiredCbm,
      weightTonnes = requiredWeightTonnes,
      sort = sortBy,
    } = {}) => {
      setLoading(true);
      setErrorMsg(null);

      const hasAllFiveSearchParams =
        Boolean(origin) &&
        Boolean(destination) &&
        Boolean(cargo) &&
        Number(cbm) > 0 &&
        Number(weightTonnes) > 0;

      try {
        if (hasAllFiveSearchParams) {
          if (Number(origin) === Number(destination)) {
            setErrorMsg('Origin port and destination port must be different.');
            setListings([]);
            setLoading(false);
            return;
          }

          setSearchMode('search');
          const res = await api.searchTraderListings({
            origin_port_id: Number(origin),
            destination_port_id: Number(destination),
            cargo_type_id: Number(cargo),
            required_cbm: Number(cbm),
            required_weight: Number(weightTonnes),
            sort,
          });
          setListings(res.data || []);
        } else {
          // Load open marketplace catalog from GET /api/trader/listings and apply any partial filters
          setSearchMode('catalog');
          const res = await api.getOpenListings({ limit: 100, offset: 0 });
          let rows = res.data || [];

          if (origin) {
            const origPort = ports.find((p) => Number(p.port_id) === Number(origin));
            rows = rows.filter(
              (r) =>
                Number(r.origin_port_id) === Number(origin) ||
                (origPort && r.origin_port_code === origPort.port_code)
            );
          }
          if (destination) {
            const destPort = ports.find((p) => Number(p.port_id) === Number(destination));
            rows = rows.filter(
              (r) =>
                Number(r.destination_port_id) === Number(destination) ||
                (destPort && r.destination_port_code === destPort.port_code)
            );
          }
          if (cargo) {
            const selectedCargoObj = cargoTypes.find(
              (c) => Number(c.cargo_type_id) === Number(cargo)
            );
            if (selectedCargoObj && selectedCargoObj.name) {
              rows = rows.filter((r) =>
                (r.supported_cargo_types || '')
                  .toLowerCase()
                  .includes(selectedCargoObj.name.toLowerCase())
              );
            }
          }
          if (Number(cbm) > 0) {
            rows = rows.filter((r) => Number(r.available_cbm) >= Number(cbm));
          }
          if (Number(weightTonnes) > 0) {
            rows = rows.filter((r) => Number(r.available_weight) >= Number(weightTonnes));
          }

          // Compute estimated_total_price if CBM or weight is provided
          const effCbm = Number(cbm) > 0 ? Number(cbm) : 1;
          const effWeight = Number(weightTonnes) > 0 ? Number(weightTonnes) : 1;
          rows = rows.map((r) => {
            if (r.estimated_total_price !== undefined) return r;
            const est = Math.max(
              effCbm * Number(r.price_per_cbm || 0),
              effWeight * Number(r.price_per_tonne || 0),
              Number(r.minimum_charge || 0)
            );
            return {
              ...r,
              estimated_total_price: est.toFixed(2),
            };
          });

          if (sort === 'departure') {
            rows.sort(
              (a, b) => new Date(a.departure_date).getTime() - new Date(b.departure_date).getTime()
            );
          } else {
            rows.sort(
              (a, b) => Number(a.estimated_total_price) - Number(b.estimated_total_price)
            );
          }

          setListings(rows);
        }
      } catch (err) {
        setErrorMsg(err.message || 'Failed to load capacity listings from backend.');
        setListings([]);
      } finally {
        setLoading(false);
      }
    },
    [
      originPortId,
      destinationPortId,
      cargoTypeId,
      requiredCbm,
      requiredWeightTonnes,
      sortBy,
      cargoTypes,
    ]
  );

  // Run initial query on mount
  useEffect(() => {
    executeQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const nextParams = new URLSearchParams();
    if (originPortId) nextParams.set('origin_port_id', originPortId);
    if (destinationPortId) nextParams.set('destination_port_id', destinationPortId);
    if (cargoTypeId) nextParams.set('cargo_type_id', cargoTypeId);
    if (requiredCbm) nextParams.set('required_cbm', requiredCbm);
    if (requiredWeightTonnes) nextParams.set('required_weight', String(requiredWeightTonnes));
    if (sortBy) nextParams.set('sort', sortBy);
    setSearchParams(nextParams);

    executeQuery({
      origin: originPortId,
      destination: destinationPortId,
      cargo: cargoTypeId,
      cbm: requiredCbm,
      weightTonnes: requiredWeightTonnes,
      sort: sortBy,
    });
  };

  const handleResetFilters = () => {
    setOriginPortId('');
    setDestinationPortId('');
    setCargoTypeId('');
    setRequiredCbm('');
    setWeightInput('');
    setSortBy('price');
    setSearchParams({});
    executeQuery({
      origin: '',
      destination: '',
      cargo: '',
      cbm: '',
      weightTonnes: '',
      sort: 'price',
    });
  };

  // One-click preset for Mumbai (INNSA, ID 1) -> Rotterdam (NLRTM, ID 8), General Cargo (ID 1), 5 CBM, 2 Tonnes
  const handleFillSampleRoute = () => {
    const innsa = ports.find((p) => p.port_code === 'INNSA') || ports[0];
    const nlrtm = ports.find((p) => p.port_code === 'NLRTM') || ports[1];
    const genCargo =
      cargoTypes.find((c) => c.name.toLowerCase().includes('general')) || cargoTypes[0];

    const oId = innsa ? String(innsa.port_id) : '1';
    const dId = nlrtm ? String(nlrtm.port_id) : '8';
    const cId = genCargo ? String(genCargo.cargo_type_id) : '1';

    setOriginPortId(oId);
    setDestinationPortId(dId);
    setCargoTypeId(cId);
    setRequiredCbm('5');
    setWeightUnit('tonnes');
    setWeightInput('2');
    setSortBy('price');

    executeQuery({
      origin: oId,
      destination: dId,
      cargo: cId,
      cbm: '5',
      weightTonnes: 2,
      sort: 'price',
    });
  };

  return (
    <div className="workspace-page">
      {/* Page Header Banner */}
      <div className="workspace-hero-banner">
        <div className="workspace-banner-inner">
          <div>
            <nav className="workspace-breadcrumb" aria-label="Breadcrumb">
              <Link to="/" className="breadcrumb-link">ShipSpace</Link>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-link">Trader Workspace</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">Capacity Discovery</span>
            </nav>
            <div className="section-eyebrow">
              <span className="eyebrow-bar" />
              <span className="eyebrow-text">TRADER CAPACITY MARKETPLACE</span>
            </div>
            <h1 className="workspace-title">Search &amp; Book LCL Cargo Space</h1>
            <p className="workspace-subtitle">
              Query live container capacity across global trade lanes and reserve space with
              database-enforced tariff calculation.
            </p>
          </div>

          <div className="workspace-context-card">
            <span className="context-card-label">BOOKING AS TRADER</span>
            <strong className="context-card-name">
              #{activeTrader?.user_id || 7} — {activeTrader?.company_name || activeTrader?.name || 'Aarav Textiles Export House'}
            </strong>
            <span className="context-card-sub">{activeTrader?.email || 'aarav@aaravtextiles.in'}</span>
            <Link
              to="/bookings"
              className="context-card-sub"
              style={{
                marginTop: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                color: '#fdba74',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '11.5px',
              }}
            >
              <FileText size={12} /> View My Bookings &rarr;
            </Link>
          </div>
        </div>
      </div>

      <div className="workspace-container">
        {/* Search Filter Card */}
        <section className="search-filter-panel" aria-label="Search Filters">
          <div className="filter-panel-top">
            <div className="filter-panel-title-group">
              <SlidersHorizontal size={18} className="text-orange" />
              <h2>Route, Cargo &amp; Capacity Requirements</h2>
              <span className={`mode-pill ${searchMode === 'search' ? 'mode-exact' : 'mode-catalog'}`}>
                {searchMode === 'search'
                  ? 'Exact Tariff Search (/api/trader/listings/search)'
                  : 'Open Marketplace Catalog (/api/trader/listings)'}
              </span>
            </div>

            <div className="filter-preset-actions">
              <button
                type="button"
                className="btn-preset-chip"
                onClick={handleFillSampleRoute}
              >
                <Sparkles size={14} />
                <span>Sample: INNSA &rarr; NLRTM (5 CBM / 2t)</span>
              </button>
              <button
                type="button"
                className="btn-reset-link"
                onClick={handleResetFilters}
              >
                <RefreshCw size={13} />
                <span>Show All Open Listings</span>
              </button>
            </div>
          </div>

          <form className="search-filter-grid" onSubmit={handleFormSubmit}>
            {/* Origin Port */}
            <div className="form-group">
              <label className="form-label" htmlFor="search-origin">
                <MapPin size={14} className="text-orange" /> Origin Port
              </label>
              <select
                id="search-origin"
                className="form-select"
                value={originPortId}
                onChange={(e) => setOriginPortId(e.target.value)}
              >
                <option value="">All Origin Ports</option>
                {ports.map((p) => (
                  <option key={p.port_id} value={p.port_id}>
                    {p.port_code} — {p.port_name} ({p.country})
                  </option>
                ))}
              </select>
            </div>

            {/* Destination Port */}
            <div className="form-group">
              <label className="form-label" htmlFor="search-destination">
                <MapPin size={14} className="text-orange" /> Destination Port
              </label>
              <select
                id="search-destination"
                className="form-select"
                value={destinationPortId}
                onChange={(e) => setDestinationPortId(e.target.value)}
              >
                <option value="">All Destination Ports</option>
                {ports.map((p) => (
                  <option key={p.port_id} value={p.port_id}>
                    {p.port_code} — {p.port_name} ({p.country})
                  </option>
                ))}
              </select>
            </div>

            {/* Cargo Type */}
            <div className="form-group">
              <label className="form-label" htmlFor="search-cargo">
                <Package size={14} className="text-orange" /> Cargo Type
              </label>
              <select
                id="search-cargo"
                className="form-select"
                value={cargoTypeId}
                onChange={(e) => setCargoTypeId(e.target.value)}
              >
                <option value="">All Cargo Types</option>
                {cargoTypes.map((c) => (
                  <option key={c.cargo_type_id} value={c.cargo_type_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Required Volume (CBM) */}
            <div className="form-group">
              <label className="form-label" htmlFor="search-cbm">
                <Box size={14} className="text-orange" /> Volume (CBM)
              </label>
              <input
                id="search-cbm"
                type="number"
                step="0.1"
                min="0.1"
                className="form-input"
                placeholder="e.g. 5.0"
                value={requiredCbm}
                onChange={(e) => setRequiredCbm(e.target.value)}
              />
            </div>

            {/* Required Weight with Tonnes / kg toggle */}
            <div className="form-group">
              <div className="form-label-with-toggle">
                <label className="form-label" htmlFor="search-weight">
                  <Scale size={14} className="text-orange" /> Weight ({weightUnit})
                </label>
                <div className="unit-toggle-pills">
                  <button
                    type="button"
                    className={`unit-pill ${weightUnit === 'tonnes' ? 'active' : ''}`}
                    onClick={() => handleUnitSwitch('tonnes')}
                  >
                    t
                  </button>
                  <button
                    type="button"
                    className={`unit-pill ${weightUnit === 'kg' ? 'active' : ''}`}
                    onClick={() => handleUnitSwitch('kg')}
                  >
                    kg
                  </button>
                </div>
              </div>
              <input
                id="search-weight"
                type="number"
                step={weightUnit === 'kg' ? '10' : '0.1'}
                min={weightUnit === 'kg' ? '10' : '0.01'}
                className="form-input"
                placeholder={weightUnit === 'kg' ? 'e.g. 2000' : 'e.g. 2.0'}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
              />
            </div>

            {/* Sort Order & Submit */}
            <div className="form-group">
              <label className="form-label" htmlFor="search-sort">
                Sort Results By
              </label>
              <div className="search-action-inline">
                <select
                  id="search-sort"
                  className="form-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="price">Lowest Estimated Price</option>
                  <option value="departure">Earliest Departure Date</option>
                </select>
                <button type="submit" className="btn-orange-primary search-btn-submit">
                  <Search size={16} />
                  <span>Search</span>
                </button>
              </div>
            </div>
          </form>

          {searchMode === 'catalog' && (
            <div className="search-helper-strip">
              <span>
                Tip: Select all 5 criteria (Origin, Destination, Cargo Type, Volume &amp; Weight) to
                run the exact PostgreSQL tariff search endpoint, or browse filtered open listings
                below.
              </span>
            </div>
          )}
        </section>

        {/* Error State */}
        {errorMsg && (
          <div className="alert-banner alert-error" role="alert">
            <AlertCircle size={20} />
            <div>
              <strong>Search Error</strong>
              <p>{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Results Header */}
        <div className="results-toolbar">
          <div className="results-count-text">
            {loading ? (
              <span>Querying PostgreSQL capacity listings...</span>
            ) : (
              <span>
                Showing <strong>{listings.length}</strong> available LCL capacity{' '}
                {listings.length === 1 ? 'listing' : 'listings'}
                {requiredCbm && requiredWeightTonnes
                  ? ` for ${requiredCbm} CBM / ${requiredWeightTonnes} tonnes`
                  : ''}
              </span>
            )}
          </div>
        </div>

        {/* Loading / Empty / Listing Cards */}
        {loading ? (
          <div className="listings-grid">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="listing-card skeleton-card">
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line skeleton-body" />
                <div className="skeleton-line skeleton-footer" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="empty-state-card">
            <Ship size={40} className="text-orange" />
            <h3>No Matching Capacity Listings Found</h3>
            <p>
              No open listings matched your exact route, cargo type, or remaining capacity criteria.
              Try relaxing your filters or browsing all open listings.
            </p>
            <div className="empty-state-actions">
              <button type="button" className="btn-orange-primary" onClick={handleResetFilters}>
                Browse All Open Listings
              </button>
              <button
                type="button"
                className="btn-secondary-outline"
                onClick={handleFillSampleRoute}
              >
                Load Sample Route (INNSA &rarr; NLRTM)
              </button>
            </div>
          </div>
        ) : (
          <div className="listings-grid">
            {listings.map((item) => {
              const totalCbm = parseFloat(item.total_cbm || item.available_cbm || 1);
              const availCbm = parseFloat(item.available_cbm || 0);
              const availWeight = parseFloat(item.available_weight || 0);
              const cbmPercentRemaining = Math.min(
                100,
                Math.max(0, Math.round((availCbm / totalCbm) * 100))
              );

              return (
                <article key={item.listing_id} className="listing-card">
                  {/* Top Bar: Provider + Listing ID + Status */}
                  <div className="listing-card-top">
                    <div className="listing-provider-info">
                      <Building2 size={16} className="text-orange" />
                      <span className="listing-provider-name">
                        {item.provider_company || item.provider_name}
                      </span>
                      <span className="listing-id-chip">Listing #{item.listing_id}</span>
                    </div>
                    <span className={`status-badge status-${item.status || 'open'}`}>
                      <CheckCircle2 size={12} /> {item.status || 'open'}
                    </span>
                  </div>

                  {/* Route Corridor */}
                  <div className="listing-route-box">
                    <div className="listing-port-col">
                      <span className="port-code-badge">{item.origin_port_code}</span>
                      <strong className="port-city-name">{item.origin_port_name}</strong>
                      <span className="port-country-sub">{item.origin_country}</span>
                    </div>

                    <div className="listing-transit-connector">
                      <span className="transit-days-label">
                        {item.typical_transit_days
                          ? `${item.typical_transit_days} Days Transit`
                          : 'Direct LCL'}
                      </span>
                      <div className="transit-line">
                        <span className="transit-dot" />
                        <ArrowRight size={15} className="transit-arrow" />
                      </div>
                      {item.distance_nm && (
                        <span className="transit-nm-label">
                          {Number(item.distance_nm).toLocaleString()} NM
                        </span>
                      )}
                    </div>

                    <div className="listing-port-col listing-port-col-right">
                      <span className="port-code-badge">{item.destination_port_code}</span>
                      <strong className="port-city-name">{item.destination_port_name}</strong>
                      <span className="port-country-sub">{item.destination_country}</span>
                    </div>
                  </div>

                  {/* Schedule & Capacity Gauges */}
                  <div className="listing-metrics-row">
                    <div className="listing-schedule-col">
                      <div className="schedule-pair">
                        <Calendar size={14} className="text-muted" />
                        <div>
                          <span className="metric-caption">Departure</span>
                          <strong>{new Date(item.departure_date).toLocaleDateString()}</strong>
                        </div>
                      </div>
                      <div className="schedule-pair">
                        <Calendar size={14} className="text-muted" />
                        <div>
                          <span className="metric-caption">Arrival</span>
                          <strong>{new Date(item.arrival_date).toLocaleDateString()}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="listing-capacity-col">
                      <div className="capacity-bar-header">
                        <span>
                          Available Volume: <strong>{availCbm.toFixed(2)} CBM</strong>
                          {item.total_cbm ? ` / ${Number(item.total_cbm).toFixed(0)} CBM` : ''}
                        </span>
                        <span className="capacity-pct">{cbmPercentRemaining}% free</span>
                      </div>
                      <div className="capacity-progress-track">
                        <div
                          className="capacity-progress-fill"
                          style={{ width: `${cbmPercentRemaining}%` }}
                        />
                      </div>
                      <div className="capacity-weight-sub">
                        <Scale size={13} /> Available Weight:{' '}
                        <strong>
                          {availWeight.toFixed(2)} t ({Math.round(availWeight * 1000).toLocaleString()}{' '}
                          kg)
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Supported Cargo Tags */}
                  {item.supported_cargo_types && (
                    <div className="listing-cargo-tags">
                      {item.supported_cargo_types.split(',').map((tag, i) => (
                        <span key={i} className="cargo-tag-chip">
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Bottom Tariff & Book Action */}
                  <div className="listing-card-footer">
                    <div className="listing-rates-group">
                      <div className="rate-pill">
                        <span className="rate-label">Volume Rate</span>
                        <strong className="rate-val">
                          ${Number(item.price_per_cbm).toFixed(2)}/CBM
                        </strong>
                      </div>
                      <div className="rate-pill">
                        <span className="rate-label">Weight Rate</span>
                        <strong className="rate-val">
                          ${Number(item.price_per_tonne).toFixed(2)}/t
                        </strong>
                      </div>
                      <div className="rate-pill">
                        <span className="rate-label">Min Charge</span>
                        <strong className="rate-val">
                          ${Number(item.minimum_charge).toFixed(2)}
                        </strong>
                      </div>
                    </div>

                    <div className="listing-cta-group">
                      <div className="estimated-price-block">
                        <span className="est-price-label">
                          {requiredCbm && requiredWeightTonnes ? 'Estimated Total' : 'Starting From'}
                        </span>
                        <strong className="est-price-value">
                          ${Number(item.estimated_total_price || item.minimum_charge).toFixed(2)}
                        </strong>
                      </div>

                      <button
                        type="button"
                        className="btn-orange-primary"
                        onClick={() => setBookingListing(item)}
                      >
                        <span>Book Space</span>
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      {bookingListing && (
        <BookingModal
          listing={bookingListing}
          initialCbm={requiredCbm}
          initialWeightTonnes={requiredWeightTonnes}
          initialCargoTypeId={cargoTypeId}
          onClose={() => setBookingListing(null)}
          onBookingSuccess={() => {
            // Refresh listing capacity after booking
            executeQuery();
          }}
        />
      )}
    </div>
  );
}
