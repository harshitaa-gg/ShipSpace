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

  // Default cargo type to General Cargo (or first supported cargo type) if not provided
  useEffect(() => {
    if (!cargoTypeId && cargoTypes.length > 0) {
      const general = cargoTypes.find((c) =>
        c.name.toLowerCase().includes('general')
      );
      setCargoTypeId(String(general ? general.cargo_type_id : cargoTypes[0].cargo_type_id));
    }
  }, [cargoTypes, cargoTypeId]);

  // Convert user weight input into tonnes (matching DB booked_weight column)
  const bookedWeightTonnes = useMemo(() => {
    const val = parseFloat(weightInput);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return weightUnit === 'kg' ? Number((val / 1000).toFixed(4)) : val;
  }, [weightInput, weightUnit]);

  // Mirror PostgreSQL fn_calculate_booking_price:
  // GREATEST(booked_cbm * price_per_cbm, booked_weight * price_per_tonne, minimum_charge)
  const pricingBreakdown = useMemo(() => {
    const cbm = parseFloat(bookedCbm);
    const weight = bookedWeightTonnes;
    const rateCbm = parseFloat(listing?.price_per_cbm || 0);
    const rateTonne = parseFloat(listing?.price_per_tonne || 0);
    const minCharge = parseFloat(listing?.minimum_charge || 0);

    if (!Number.isFinite(cbm) || cbm <= 0 || !Number.isFinite(weight) || weight <= 0) {
      return null;
    }

    const volumeCharge = cbm * rateCbm;
    const weightCharge = weight * rateTonne;
    const finalPrice = Math.max(volumeCharge, weightCharge, minCharge);

    let appliedBasis = 'Volume (CBM) Rate';
    if (finalPrice === minCharge && minCharge > volumeCharge && minCharge > weightCharge) {
      appliedBasis = 'Minimum Charge Floor';
    } else if (weightCharge > volumeCharge) {
      appliedBasis = 'Weight (Tonne) Rate';
    }

    return {
      volumeCharge: volumeCharge.toFixed(2),
      weightCharge: weightCharge.toFixed(2),
      minCharge: minCharge.toFixed(2),
      finalPrice: finalPrice.toFixed(2),
      appliedBasis,
    };
  }, [bookedCbm, bookedWeightTonnes, listing]);

  if (!listing) return null;

  const availCbm = parseFloat(listing.available_cbm || 0);
  const availWeight = parseFloat(listing.available_weight || 0);

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
      setErrorMsg('Please select a Cargo Type.');
      return;
    }
    if (!Number.isFinite(cbmNum) || cbmNum <= 0) {
      setErrorMsg('Booked Volume (CBM) must be a positive number.');
      return;
    }
    if (!Number.isFinite(weightTonnesNum) || weightTonnesNum <= 0) {
      setErrorMsg('Booked Weight must be a positive number.');
      return;
    }

    setSubmitting(true);
    try {
      // Keep active trader synced in global identity context
      setSelectedTraderId(Number(traderId));

      const response = await api.createBooking({
        listing_id: Number(listing.listing_id),
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
        className="modal-card booking-modal-card"
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
              {createdBooking ? 'Booking Confirmed in Database' : 'Reserve LCL Container Capacity'}
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
          <div className="modal-body booking-success-body">
            <div className="booking-success-banner">
              <CheckCircle2 size={28} className="text-success-icon" />
              <div>
                <h4>Booking #{createdBooking.booking_id} Confirmed!</h4>
                <p>
                  Executed via PostgreSQL stored procedure <code>sp_create_booking</code> with row-level
                  capacity locking and audit logging.
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
              <div className="receipt-item receipt-total-item">
                <span className="receipt-label">Final Charged Total</span>
                <span className="receipt-total-price">
                  ${Number(createdBooking.total_price).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                </span>
              </div>
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
          <form onSubmit={handleSubmit}>
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
                >
                  <option value="">Select cargo classification...</option>
                  {cargoTypes.map((ct) => (
                    <option key={ct.cargo_type_id} value={ct.cargo_type_id}>
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
                    Sent to DB as <strong>{bookedWeightTonnes.toFixed(2)} tonnes</strong> (${Number(listing.price_per_tonne).toFixed(2)}/t)
                  </span>
                </div>
              </div>

              {/* Real-time Database Price Preview */}
              {pricingBreakdown && (
                <div className="pricing-preview-box">
                  <div className="pricing-preview-header">
                    <Calculator size={15} className="text-orange" />
                    <span>Live Tariff Calculation (fn_calculate_booking_price)</span>
                  </div>
                  <div className="pricing-preview-rows">
                    <div className="pricing-row">
                      <span>
                        Volume Charge ({bookedCbm} CBM &times; ${Number(listing.price_per_cbm).toFixed(2)})
                      </span>
                      <span>${pricingBreakdown.volumeCharge}</span>
                    </div>
                    <div className="pricing-row">
                      <span>
                        Weight Charge ({bookedWeightTonnes.toFixed(2)} t &times; $
                        {Number(listing.price_per_tonne).toFixed(2)})
                      </span>
                      <span>${pricingBreakdown.weightCharge}</span>
                    </div>
                    <div className="pricing-row">
                      <span>Provider Minimum Charge Floor</span>
                      <span>${pricingBreakdown.minCharge}</span>
                    </div>
                    <div className="pricing-row pricing-row-total">
                      <span>
                        Estimated Total ({pricingBreakdown.appliedBasis})
                      </span>
                      <span className="pricing-total-amount">${pricingBreakdown.finalPrice} USD</span>
                    </div>
                  </div>
                </div>
              )}
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
                disabled={submitting}
              >
                {submitting ? 'Locking Capacity & Booking...' : 'Confirm LCL Booking'}
                {!submitting && <ArrowRight size={15} />}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
