import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  X,
  Anchor,
  Calendar,
  Package,
  Scale,
  Box,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Calculator,
  UserCheck,
} from 'lucide-react';
import { api } from '../api/client';
import { useIdentity } from '../context/IdentityContext';
import { LiveQuoteBreakdown, SavedBookingSnapshotBreakdown } from './ItemisedCostBreakdown';

import { isListingCutoffValid } from '../pages/ProviderDashboardPage';

/**
 * Reusable modal to book LCL space on a selected capacity listing.
 * Calls POST /api/trader/bookings which executes shipspace.sp_create_booking in PostgreSQL.
 */
export default function BookingModal({
  listing,
  initialCbm = '',
  initialWeightTonnes = '',
  initialCargoTypeId = '',
  onClose,
  onBookingSuccess,
}) {
  const {
    traders,
    selectedTraderId,
    setSelectedTraderId,
    cargoTypes,
    refreshCatalog,
  } = useIdentity();

  const [traderId, setTraderId] = useState(selectedTraderId || 7);
  const [cargoTypeId, setCargoTypeId] = useState(
    initialCargoTypeId ? String(initialCargoTypeId) : ''
  );
  const [bookedCbm, setBookedCbm] = useState(
    initialCbm && Number(initialCbm) > 0 ? String(initialCbm) : '2.5'
  );
  const [weightUnit, setWeightUnit] = useState('tonnes'); // 'tonnes' | 'kg'
  const [weightInput, setWeightInput] = useState(() => {
    if (initialWeightTonnes && Number(initialWeightTonnes) > 0) {
      return String(initialWeightTonnes);
    }
    return '1.2';
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [createdBooking, setCreatedBooking] = useState(null);

  // Sync traderId with context
  useEffect(() => {
    if (selectedTraderId) {
      setTraderId(selectedTraderId);
    }
  }, [selectedTraderId]);

  // Prevent background page scroll while modal is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Filter cargo types strictly to those permitted on this listing
  const allowedCargoTypes = useMemo(() => {
    if (!listing || !cargoTypes || cargoTypes.length === 0) return cargoTypes || [];

    // Case 1: allowed_cargo_types is an array of objects
    if (Array.isArray(listing.allowed_cargo_types) && listing.allowed_cargo_types.length > 0) {
      const idSet = new Set(listing.allowed_cargo_types.map((c) => Number(c.id ?? c.cargo_type_id)));
      const filtered = cargoTypes.filter((ct) => idSet.has(Number(ct.cargo_type_id ?? ct.id)));
      if (filtered.length > 0) return filtered;
    }

    // Case 2: permitted_cargo_types_array is an array of names
    if (Array.isArray(listing.permitted_cargo_types_array) && listing.permitted_cargo_types_array.length > 0) {
      const nameSet = new Set(
        listing.permitted_cargo_types_array.map((s) => String(s).trim().toLowerCase())
      );
      const filtered = cargoTypes.filter((ct) =>
        nameSet.has(String(ct.name).trim().toLowerCase())
      );
      if (filtered.length > 0) return filtered;
    }

    // Case 3: supported_cargo_types or permitted_cargo_types is a string
    const typesStr = listing.supported_cargo_types || listing.permitted_cargo_types || '';
    if (typesStr) {
      const nameList = typesStr
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (nameList.length > 0) {
        const filtered = cargoTypes.filter((ct) =>
          nameList.some((allowed) => allowed === String(ct.name).trim().toLowerCase())
        );
        if (filtered.length > 0) return filtered;
      }
    }

    // Case 4: matched_cargo_type_id from search response
    if (listing.matched_cargo_type_id) {
      const filtered = cargoTypes.filter(
        (ct) => Number(ct.cargo_type_id ?? ct.id) === Number(listing.matched_cargo_type_id)
      );
      if (filtered.length > 0) return filtered;
    }

    return cargoTypes;
  }, [cargoTypes, listing]);

  // Keep selected cargoTypeId restricted to permitted classifications
  useEffect(() => {
    if (allowedCargoTypes.length === 0) return;

    const isCurrentAllowed = allowedCargoTypes.some(
      (ct) => String(ct.cargo_type_id ?? ct.id) === String(cargoTypeId)
    );

    if (!isCurrentAllowed) {
      const isInitialAllowed =
        initialCargoTypeId &&
        allowedCargoTypes.some(
          (ct) => String(ct.cargo_type_id ?? ct.id) === String(initialCargoTypeId)
        );
      const chosen = isInitialAllowed
        ? initialCargoTypeId
        : allowedCargoTypes[0].cargo_type_id ?? allowedCargoTypes[0].id;
      setCargoTypeId(String(chosen));
    }
  }, [allowedCargoTypes, cargoTypeId, initialCargoTypeId]);

  // Convert user weight input into tonnes (matching DB booked_weight column)
  const bookedWeightTonnes = useMemo(() => {
    const val = parseFloat(weightInput);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return weightUnit === 'kg' ? Number((val / 1000).toFixed(4)) : val;
  }, [weightInput, weightUnit]);

  const [liveQuote, setLiveQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);

  const listingId = listing?.listing_id ?? listing?.id;

  // Fetch authoritative itemised quote from backend quote engine (GET /api/trader/listings/:listingId/quote)
  useEffect(() => {
    const cbmVal = parseFloat(bookedCbm);
    const weightVal = bookedWeightTonnes;

    if (!listingId || !Number.isFinite(cbmVal) || cbmVal <= 0 || !Number.isFinite(weightVal) || weightVal <= 0) {
      setLiveQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return undefined;
    }

    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await api.getListingQuote(listingId, {
          cbm: Number(cbmVal.toFixed(2)),
          weight: Number(weightVal.toFixed(2)),
        });
        if (!cancelled) {
          setLiveQuote(res.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setQuoteError(err.message || 'Unable to fetch itemised quote from server.');
          setLiveQuote(null);
        }
      } finally {
        if (!cancelled) {
          setQuoteLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [listingId, bookedCbm, bookedWeightTonnes]);

  if (!listing) return null;

  const availCbm = parseFloat(listing.available_cbm || 0);
  const availWeight = parseFloat(listing.available_weight || 0);
  const cutoffValid = isListingCutoffValid(listing.cutoff_date);
  const isExpired = listing.cutoff_date ? !cutoffValid : false;
  const isFull = availCbm <= 0 || availWeight <= 0 || (listing.status && listing.status !== 'open');
  const canBookListing = !isExpired && !isFull;

  const handleWeightUnitChange = (newUnit) => {
    if (newUnit === weightUnit) return;
    const currentVal = parseFloat(weightInput);
    if (Number.isFinite(currentVal) && currentVal > 0) {
      if (newUnit === 'kg') {
        setWeightInput(String(Math.round(currentVal * 1000)));
      } else {
        setWeightInput(String(Number((currentVal / 1000).toFixed(3))));
      }
    }
    setWeightUnit(newUnit);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    const cbmNum = parseFloat(bookedCbm);
    const weightTonnesNum = bookedWeightTonnes;

    if (!traderId) {
      setErrorMsg('Please select a Trader account.');
      return;
    }
    if (!cargoTypeId) {
      setErrorMsg('Please select an allowed Cargo Classification.');
      return;
    }
    if (isExpired) {
      setErrorMsg('This capacity listing has passed its cargo cutoff date and can no longer accept bookings.');
      return;
    }
    if (availCbm <= 0 || availWeight <= 0) {
      setErrorMsg('This capacity listing has no remaining capacity available.');
      return;
    }
    if (listing.status && listing.status !== 'open') {
      setErrorMsg(`This capacity listing is currently "${listing.status}" and cannot accept bookings.`);
      return;
    }
    if (!Number.isFinite(cbmNum) || cbmNum <= 0) {
      setErrorMsg('Booked Volume (CBM) must be greater than 0.');
      return;
    }
    if (!Number.isFinite(weightTonnesNum) || weightTonnesNum <= 0) {
      setErrorMsg('Booked Weight must be greater than 0.');
      return;
    }
    if (cbmNum > availCbm) {
      setErrorMsg(
        `Requested volume (${cbmNum} CBM) exceeds remaining listing capacity (${availCbm.toFixed(2)} CBM).`
      );
      return;
    }
    if (weightTonnesNum > availWeight) {
      setErrorMsg(
        `Requested weight (${weightTonnesNum} t / ${Math.round(weightTonnesNum * 1000)} kg) exceeds remaining listing capacity (${availWeight.toFixed(2)} t / ${Math.round(availWeight * 1000)} kg).`
      );
      return;
    }

    setSubmitting(true);
    try {
      // Keep active trader synced in global identity context
      setSelectedTraderId(Number(traderId));

      const response = await api.createBooking({
        listing_id: Number(listing.listing_id ?? listing.id),
        trader_id: Number(traderId),
        cargo_type_id: Number(cargoTypeId),
        booked_cbm: Number(cbmNum.toFixed(2)),
        booked_weight: Number(weightTonnesNum.toFixed(2)),
      });

      setCreatedBooking(response.data);
      refreshCatalog();
      if (onBookingSuccess) {
        onBookingSuccess(response.data);
      }
    } catch (err) {
      setErrorMsg(
        err.message ||
          'Booking failed. The database rejected this request due to capacity or validation constraints.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-lg booking-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
      >
        <div className="modal-header">
          <div>
            <span className="modal-eyebrow">
              LISTING #{listing.listing_id} · {listing.provider_company || listing.provider_name}
            </span>
            <h3 id="booking-modal-title" className="modal-title">
              {createdBooking ? 'Booking Confirmed' : 'Reserve LCL Container Capacity'}
            </h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close booking modal"
          >
            <X size={18} />
          </button>
        </div>

        {createdBooking ? (
          <div className="modal-form">
            <div className="modal-body booking-success-body">
              <div className="booking-success-banner">
                <CheckCircle2 size={28} className="text-success-icon" />
                <div>
                  <h4>Booking #{createdBooking.booking_id} Confirmed!</h4>
                  <p>
                    Your LCL space reservation and price breakdown have been saved.
                  </p>
                </div>
              </div>

              <div className="booking-receipt-grid">
                <div className="receipt-item">
                  <span className="receipt-label">Booking Reference</span>
                  <span className="receipt-value">#{createdBooking.booking_id}</span>
                </div>
                <div className="receipt-item">
                  <span className="receipt-label">Status</span>
                  <span className="status-badge status-confirmed">
                    {createdBooking.booking_status || 'confirmed'}
                  </span>
                </div>
                <div className="receipt-item">
                  <span className="receipt-label">Route</span>
                  <span className="receipt-value">
                    {createdBooking.origin_port_code || listing.origin_port_code} &rarr;{' '}
                    {createdBooking.destination_port_code || listing.destination_port_code}
                  </span>
                </div>
                <div className="receipt-item">
                  <span className="receipt-label">Cargo Type</span>
                  <span className="receipt-value">{createdBooking.cargo_type_name || 'Selected Cargo'}</span>
                </div>
                <div className="receipt-item">
                  <span className="receipt-label">Reserved Volume</span>
                  <span className="receipt-value">{createdBooking.booked_cbm} CBM</span>
                </div>
                <div className="receipt-item">
                  <span className="receipt-label">Reserved Weight</span>
                  <span className="receipt-value">
                    {createdBooking.booked_weight} t ({Math.round(Number(createdBooking.booked_weight) * 1000).toLocaleString()} kg)
                  </span>
                </div>
                <div className="receipt-item">
                  <span className="receipt-label">Base Freight</span>
                  <span className="receipt-value">
                    ${Number(createdBooking.total_price).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                  </span>
                </div>
                <div className="receipt-item">
                  <span className="receipt-label">
                    {createdBooking.is_legacy_booking ? 'Base Freight Charged' : 'Saved Total Charged'}
                  </span>
                  <span className="receipt-total-price">
                    $
                    {Number(
                      createdBooking.itemised_cost_summary?.total_all_in_cost ??
                        createdBooking.total_price
                    ).toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                    {createdBooking.charge_snapshots?.[0]?.currency || 'USD'}
                  </span>
                </div>
              </div>

              {/* Saved Financial Breakdown returned by backend */}
              <SavedBookingSnapshotBreakdown booking={createdBooking} />
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary-outline" onClick={onClose}>
                Continue Browsing
              </button>
              <Link to="/bookings" className="btn-orange-primary">
                View in My Bookings <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        ) : (
          <form className="modal-form" onSubmit={handleSubmit}>
            <div className="modal-body">
              {/* Route & Schedule Summary Banner */}
              <div className="booking-route-summary">
                <div className="booking-route-ports">
                  <div className="route-Endpoint">
                    <span className="port-code-tag">{listing.origin_port_code}</span>
                    <span className="port-name-text">{listing.origin_port_name}</span>
                  </div>
                  <ArrowRight size={18} className="route-arrow-icon" />
                  <div className="route-Endpoint">
                    <span className="port-code-tag">{listing.destination_port_code}</span>
                    <span className="port-name-text">{listing.destination_port_name}</span>
                  </div>
                </div>
                <div className="booking-route-meta">
                  <span>
                    <Calendar size={13} /> Departs:{' '}
                    <strong>{new Date(listing.departure_date).toLocaleDateString()}</strong>
                  </span>
                  <span>
                    <Box size={13} /> Available: <strong>{availCbm.toFixed(2)} CBM</strong>
                  </span>
                  <span>
                    <Scale size={13} /> Max Weight:{' '}
                    <strong>
                      {availWeight.toFixed(2)} t ({Math.round(availWeight * 1000).toLocaleString()} kg)
                    </strong>
                  </span>
                </div>
              </div>

              {isExpired && (
                <div className="alert-banner alert-error" role="alert">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Cutoff Date Passed</strong>
                    <p>This capacity listing has passed its cargo cutoff date ({listing.cutoff_date}) and cannot accept new bookings.</p>
                  </div>
                </div>
              )}

              {!isExpired && isFull && (
                <div className="alert-banner alert-error" role="alert">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Listing Capacity Full</strong>
                    <p>This capacity listing has no remaining volume or weight capacity available.</p>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="alert-banner alert-error" role="alert">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Booking Rejected</strong>
                    <p>{errorMsg}</p>
                  </div>
                </div>
              )}

              {/* Active Trader Selection */}
              <div className="form-group">
                <label className="form-label" htmlFor="booking-trader-select">
                  <UserCheck size={14} /> Booking as Trader Account
                </label>
                <select
                  id="booking-trader-select"
                  className="form-select"
                  value={traderId}
                  onChange={(e) => setTraderId(Number(e.target.value))}
                  required
                >
                  {traders.map((t) => (
                    <option key={t.user_id} value={t.user_id}>
                      #{t.user_id} — {t.company_name || t.name} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Cargo Type Selection */}
              <div className="form-group">
                <label className="form-label" htmlFor="booking-cargo-select">
                  <Package size={14} /> Cargo Classification
                </label>
                <select
                  id="booking-cargo-select"
                  className="form-select"
                  value={cargoTypeId}
                  onChange={(e) => setCargoTypeId(e.target.value)}
                  required
                  disabled={!canBookListing}
                >
                  <option value="">Select cargo classification...</option>
                  {allowedCargoTypes.map((ct) => (
                    <option key={ct.cargo_type_id ?? ct.id} value={ct.cargo_type_id ?? ct.id}>
                      {ct.name} {ct.requires_special_handling ? '(Special Handling)' : ''}
                    </option>
                  ))}
                </select>
                {listing.supported_cargo_types && (
                  <span className="form-hint">
                    Supported on this listing: <strong>{listing.supported_cargo_types}</strong>
                  </span>
                )}
              </div>

              {/* Volume & Weight Inputs */}
              <div className="form-row-2col">
                <div className="form-group">
                  <label className="form-label" htmlFor="booking-cbm-input">
                    <Box size={14} /> Volume Required (CBM)
                  </label>
                  <input
                    id="booking-cbm-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={availCbm}
                    className="form-input"
                    value={bookedCbm}
                    onChange={(e) => setBookedCbm(e.target.value)}
                    placeholder="e.g. 2.50"
                    required
                  />
                  <span className="form-hint">
                    Max available: {availCbm.toFixed(2)} CBM (${Number(listing.price_per_cbm).toFixed(2)}/CBM)
                  </span>
                </div>

                <div className="form-group">
                  <div className="form-label-with-toggle">
                    <label className="form-label" htmlFor="booking-weight-input">
                      <Scale size={14} /> Cargo Weight ({weightUnit === 'kg' ? 'kg' : 'Tonnes'})
                    </label>
                    <div className="unit-toggle-pills">
                      <button
                        type="button"
                        className={`unit-pill ${weightUnit === 'tonnes' ? 'active' : ''}`}
                        onClick={() => handleWeightUnitChange('tonnes')}
                      >
                        Tonnes (t)
                      </button>
                      <button
                        type="button"
                        className={`unit-pill ${weightUnit === 'kg' ? 'active' : ''}`}
                        onClick={() => handleWeightUnitChange('kg')}
                      >
                        kg
                      </button>
                    </div>
                  </div>
                  <input
                    id="booking-weight-input"
                    type="number"
                    step={weightUnit === 'kg' ? '1' : '0.01'}
                    min={weightUnit === 'kg' ? '10' : '0.01'}
                    className="form-input"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    placeholder={weightUnit === 'kg' ? 'e.g. 1200' : 'e.g. 1.20'}
                    required
                  />
                  <span className="form-hint">
                    Calculated as <strong>{bookedWeightTonnes.toFixed(2)} tonnes</strong> (${Number(listing.price_per_tonne).toFixed(2)}/t)
                  </span>
                </div>
              </div>

              {/* Authoritative Itemised Quote from Backend Quote API */}
              <LiveQuoteBreakdown
                quote={liveQuote}
                loading={quoteLoading}
                error={quoteError}
              />
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary-outline"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-orange-primary"
                disabled={!canBookListing || submitting}
              >
                {isExpired
                  ? 'Cutoff Date Passed'
                  : isFull
                  ? 'Capacity Full'
                  : submitting
                  ? 'Locking Capacity & Booking...'
                  : 'Confirm LCL Booking'}
                {canBookListing && !submitting && <ArrowRight size={15} />}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
