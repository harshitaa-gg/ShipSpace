import React from 'react';
import {
  Calculator,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lock,
  Layers,
  ShieldAlert,
} from 'lucide-react';

const STAGE_LABELS = {
  origin: 'Origin',
  ocean: 'Ocean Freight',
  destination: 'Destination',
};

const BASIS_LABELS = {
  per_cbm: 'Per CBM',
  per_tonne: 'Per Tonne',
  per_shipment: 'Per Shipment',
  percentage: '% of Ocean Freight',
  per_cbm_per_day: 'Per CBM / Day',
  at_cost: 'At Actual Cost',
};

const TIMING_LABELS = {
  prepaid: 'Prepaid',
  collect: 'Collect',
  upon_delivery: 'Upon Delivery',
  at_terminal: 'At Terminal',
};

function formatMoney(amount, currency = 'USD') {
  const num = Number(amount || 0);
  return `${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function renderTreatmentBadge(line) {
  const t = line.treatment;
  if (t === 'included') {
    return <span className="cost-badge cost-badge-included">Included</span>;
  }
  if (t === 'not_charged') {
    return <span className="cost-badge cost-badge-not-charged">Not Charged</span>;
  }
  if (t === 'excluded') {
    return <span className="cost-badge cost-badge-excluded">Excluded</span>;
  }
  if (line.basis === 'at_cost') {
    return <span className="cost-badge cost-badge-at-cost">At Cost</span>;
  }
  return <span className="cost-badge cost-badge-charged">Charged</span>;
}

function renderCertaintyBadge(certainty) {
  const c = certainty || 'fixed';
  if (c === 'fixed') {
    return <span className="cost-badge cost-badge-fixed">Fixed</span>;
  }
  if (c === 'estimate') {
    return <span className="cost-badge cost-badge-estimate">Estimate</span>;
  }
  if (c === 'variable') {
    return <span className="cost-badge cost-badge-variable">Variable</span>;
  }
  if (c === 'conditional') {
    return <span className="cost-badge cost-badge-conditional">Conditional</span>;
  }
  return <span className="cost-badge">{c}</span>;
}

function renderLineAmount(line, defaultCurrency = 'USD') {
  const cur = line.currency || defaultCurrency;
  if (line.treatment === 'excluded') {
    return (
      <span className="cost-amount-excluded" title="Excluded from quote total; payable separately">
        Excluded (Not in Total)
      </span>
    );
  }
  if (line.treatment === 'included') {
    return <span className="cost-amount-zero">Included (0.00 {cur})</span>;
  }
  if (line.treatment === 'not_charged') {
    return <span className="cost-amount-zero">Waived (0.00 {cur})</span>;
  }
  if (line.basis === 'at_cost') {
    return <span className="cost-amount-variable">Billed at Actual Cost</span>;
  }

  const amt = Number(line.calculated_amount || 0);
  const minAmt =
    line.min_estimated_amount !== undefined && line.min_estimated_amount !== null
      ? Number(line.min_estimated_amount)
      : amt;
  const maxAmt =
    line.max_estimated_amount !== undefined && line.max_estimated_amount !== null
      ? Number(line.max_estimated_amount)
      : amt;

  return (
    <div className="cost-amount-cell">
      <strong>{formatMoney(amt, cur)}</strong>
      {minAmt !== maxAmt && (
        <span className="cost-amount-range">
          Range: {formatMoney(minAmt, cur)} &ndash; {formatMoney(maxAmt, cur)}
        </span>
      )}
    </div>
  );
}

function formatBasisDetail(line, defaultCurrency = 'USD') {
  const cur = line.currency || defaultCurrency;
  const basisLabel = BASIS_LABELS[line.basis] || line.basis;
  if (line.explanatory_note) {
    return `${basisLabel} · ${line.explanatory_note}`;
  }
  if (line.calculation_note) {
    return `${basisLabel} · ${line.calculation_note}`;
  }
  if (line.treatment !== 'charged' || line.basis === 'at_cost') {
    return basisLabel;
  }
  const rate = Number(line.rate || 0).toFixed(2);
  const qty = Number(line.chargeable_quantity || 0).toFixed(2);
  if (line.basis === 'per_shipment') {
    return `${basisLabel} (${rate} ${cur} flat)`;
  }
  if (line.basis === 'percentage') {
    return `${rate}% of ${qty} ${cur}`;
  }
  return `${basisLabel} (${qty} × ${rate} ${cur})`;
}

/**
 * Displays the live itemised quote returned by GET /api/trader/listings/:listingId/quote.
 * Uses backend response exclusively without recreating pricing logic in React.
 */
export function LiveQuoteBreakdown({ quote, loading = false, error = null, compact = false }) {
  if (loading) {
    return (
      <div className="pricing-preview-box">
        <div className="pricing-preview-header">
          <Calculator size={15} className="text-orange" />
          <span>Calculating Itemised All-In Quote from Server...</span>
        </div>
        <p className="text-muted-sm">Evaluating listing pricing rules and charge catalogue...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert-banner alert-error" role="alert">
        <AlertTriangle size={16} />
        <div>
          <strong>Quote Calculation Error</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!quote) return null;

  const currency = quote.currency || 'USD';
  const isLegacy = Boolean(quote.is_legacy_listing);
  const lines = Array.isArray(quote.charge_lines) ? quote.charge_lines : [];
  const totals = quote.totals || {};
  const quantities = quote.quantities || {};
  const pricingRule = quote.pricing_rule || null;
  const warnings = Array.isArray(quote.warnings) ? quote.warnings : [];
  const rangeMin = totals.estimated_all_in_range?.min;
  const rangeMax = totals.estimated_all_in_range?.max;
  const hasRange =
    rangeMin !== undefined &&
    rangeMax !== undefined &&
    Number(rangeMin) !== Number(rangeMax);

  return (
    <div className="itemised-cost-panel">
      <div className="itemised-cost-header">
        <div className="itemised-cost-title-wrap">
          <Calculator size={16} className="text-orange" />
          <strong>
            {isLegacy
              ? 'Base Freight Tariff Quote (Legacy Listing)'
              : 'Itemised All-In Freight Quote'}
          </strong>
        </div>
        <span
          className={`cost-mode-pill ${
            isLegacy ? 'cost-mode-legacy' : 'cost-mode-itemised'
          }`}
        >
          {isLegacy ? 'Legacy Base-Rate Only' : `${lines.length} Charge Lines · ${currency}`}
        </span>
      </div>

      {/* Legacy Pricing Notice */}
      {isLegacy && (
        <div className="cost-legacy-notice" role="status">
          <Info size={15} className="cost-notice-icon" />
          <div>
            <strong>Legacy Pricing Notice:</strong> No itemised origin or destination surcharges are
            configured on this listing. The total below reflects base ocean freight only (
            <code>GREATEST(CBM &times; rate, Tonnes &times; rate, Minimum Charge)</code>). Local
            terminal, customs, or destination fees are not itemised here.
          </div>
        </div>
      )}

      {/* Billable W/M & Rule Metadata Strip */}
      {!isLegacy && quantities.billable_cbm !== undefined && (
        <div className="cost-quantities-strip">
          <span>
            Requested: <strong>{Number(quantities.actual_cbm || 0).toFixed(2)} CBM</strong> /{' '}
            <strong>{Number(quantities.actual_weight_tonnes || 0).toFixed(2)} t</strong>
          </span>
          <span>
            Billable W/M Volume: <strong>{Number(quantities.billable_cbm || 0).toFixed(2)} CBM</strong>
            {pricingRule?.min_billable_cbm
              ? ` (Min ${Number(pricingRule.min_billable_cbm).toFixed(2)} CBM)`
              : ''}
          </span>
          {pricingRule && (
            <span>
              Free Storage: <strong>{pricingRule.free_storage_days ?? 3} days</strong>
              {Number(pricingRule.storage_rate_per_cbm_day || 0) > 0
                ? ` (${Number(pricingRule.storage_rate_per_cbm_day).toFixed(2)} ${currency}/CBM/day after)`
                : ''}
            </span>
          )}
        </div>
      )}

      {/* Itemised Charge Lines Table */}
      <div className="cost-lines-table-wrap">
        <table className="cost-lines-table">
          <thead>
            <tr>
              <th>Charge &amp; Stage</th>
              <th>Calculation Basis</th>
              <th>Payer &amp; Timing</th>
              <th>Status / Certainty</th>
              <th style={{ textAlign: 'right' }}>Estimated Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr
                key={`${line.charge_type_code || 'custom'}-${idx}`}
                className={
                  line.treatment === 'excluded'
                    ? 'cost-row-excluded'
                    : line.treatment !== 'charged'
                    ? 'cost-row-muted'
                    : ''
                }
              >
                <td>
                  <div className="cost-line-name">{line.charge_name}</div>
                  <span className={`cost-stage-tag stage-${line.stage || 'ocean'}`}>
                    {STAGE_LABELS[line.stage] || line.stage}
                  </span>
                </td>
                <td className="cost-basis-cell">{formatBasisDetail(line, currency)}</td>
                <td>
                  <div className="cost-payer-cell">
                    <span className="cost-payer-tag">
                      {line.payer === 'consignee' ? 'Consignee' : 'Shipper'}
                    </span>
                    <span className="cost-timing-sub">
                      {TIMING_LABELS[line.payment_timing] || line.payment_timing}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="cost-badges-cell">
                    {renderTreatmentBadge(line)}
                    {renderCertaintyBadge(line.certainty)}
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>{renderLineAmount(line, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stage & Payer Totals Breakdown */}
      <div className="cost-totals-grid">
        <div className="cost-total-card">
          <span className="cost-total-label">Base Ocean Freight</span>
          <strong className="cost-total-val">
            {formatMoney(totals.base_freight ?? quote.base_freight, currency)}
          </strong>
          {quote.base_freight_details?.governing_basis && (
            <span className="cost-total-sub">
              Basis: {quote.base_freight_details.governing_basis.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        <div className="cost-total-card">
          <span className="cost-total-label">Shipper Prepaid Total</span>
          <strong className="cost-total-val">
            {formatMoney(totals.estimated_shipper_prepaid_total, currency)}
          </strong>
          <span className="cost-total-sub">Payable by shipper prior to departure</span>
        </div>

        <div className="cost-total-card">
          <span className="cost-total-label">Consignee Payable Total</span>
          <strong className="cost-total-val">
            {formatMoney(totals.estimated_consignee_payable_total, currency)}
          </strong>
          <span className="cost-total-sub">Collect / destination charges</span>
        </div>

        <div className="cost-total-card cost-total-card-highlight">
          <span className="cost-total-label">
            {isLegacy ? 'Estimated Base Freight Total' : 'Estimated All-In Total'}
          </span>
          <strong className="cost-total-val text-orange">
            {formatMoney(totals.estimated_all_in_total, currency)}
          </strong>
          {hasRange ? (
            <span className="cost-total-sub">
              Range: {formatMoney(rangeMin, currency)} &ndash; {formatMoney(rangeMax, currency)}
            </span>
          ) : (
            !isLegacy &&
            totals.by_stage && (
              <span className="cost-total-sub">
                Origin {Number(totals.by_stage.origin || 0).toFixed(2)} · Ocean{' '}
                {Number(totals.by_stage.ocean || 0).toFixed(2)} · Dest{' '}
                {Number(totals.by_stage.destination || 0).toFixed(2)}
              </span>
            )
          )}
        </div>
      </div>

      {/* Warnings for Excluded, Conditional, Variable, or Missing Destination Charges */}
      {!compact && warnings.length > 0 && !isLegacy && (
        <div className="cost-warnings-box">
          <div className="cost-warnings-header">
            <ShieldAlert size={14} />
            <span>Important Pricing Disclosures &amp; Exclusions</span>
          </div>
          <ul className="cost-warnings-list">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Displays the immutable booking financial snapshot from booking_charge_snapshot
 * and v_booking_itemised_cost (never from live listing rates).
 */
export function SavedBookingSnapshotBreakdown({ booking }) {
  if (!booking) return null;

  const summary = booking.itemised_cost_summary || null;
  const snapshots = Array.isArray(booking.charge_snapshots) ? booking.charge_snapshots : [];
  const isLegacy =
    booking.is_legacy_booking !== undefined
      ? Boolean(booking.is_legacy_booking)
      : summary
      ? Boolean(summary.is_legacy_booking)
      : snapshots.length === 0;

  const currency = snapshots[0]?.currency || 'USD';
  const baseTotal = Number(summary?.legacy_total_price ?? booking.total_price ?? 0);
  const allInTotal = Number(summary?.total_all_in_cost ?? booking.total_price ?? 0);
  const shipperPrepaid = Number(summary?.total_shipper_prepaid ?? 0);
  const consigneeCollect = Number(summary?.total_consignee_collect ?? 0);
  const originCharges = Number(summary?.origin_charges ?? 0);
  const oceanCharges = Number(summary?.ocean_charges ?? 0);
  const destinationCharges = Number(summary?.destination_charges ?? 0);

  return (
    <div className="itemised-cost-panel snapshot-cost-panel">
      <div className="itemised-cost-header">
        <div className="itemised-cost-title-wrap">
          <Lock size={15} className="text-orange" />
          <strong>Frozen Booking Price Snapshot</strong>
        </div>
        <span
          className={`cost-mode-pill ${
            isLegacy ? 'cost-mode-legacy' : 'cost-mode-itemised'
          }`}
        >
          {isLegacy
            ? 'Legacy Booking (Base Freight Only)'
            : `${snapshots.length} Frozen Snapshot Lines · Immutable`}
        </span>
      </div>

      {isLegacy ? (
        <div className="cost-legacy-notice">
          <Info size={15} className="cost-notice-icon" />
          <div>
            <strong>Legacy Booking Record:</strong> This booking was created on a listing without
            itemised charge items (`0` rows in <code>booking_charge_snapshot</code>). The frozen
            base freight from <code>booking.total_price</code> is{' '}
            <strong>{formatMoney(baseTotal, currency)}</strong>.
          </div>
        </div>
      ) : (
        <>
          <div className="cost-lines-table-wrap">
            <table className="cost-lines-table">
              <thead>
                <tr>
                  <th>Frozen Charge Line</th>
                  <th>Frozen Basis &amp; Rate</th>
                  <th>Payer &amp; Timing</th>
                  <th>Treatment / Certainty</th>
                  <th style={{ textAlign: 'right' }}>Frozen Amount</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap) => (
                  <tr
                    key={snap.id || `${snap.charge_name}-${snap.stage}`}
                    className={
                      snap.treatment === 'excluded'
                        ? 'cost-row-excluded'
                        : snap.treatment !== 'charged'
                        ? 'cost-row-muted'
                        : ''
                    }
                  >
                    <td>
                      <div className="cost-line-name">{snap.charge_name}</div>
                      <span className={`cost-stage-tag stage-${snap.stage || 'ocean'}`}>
                        {STAGE_LABELS[snap.stage] || snap.stage}
                      </span>
                    </td>
                    <td className="cost-basis-cell">{formatBasisDetail(snap, currency)}</td>
                    <td>
                      <div className="cost-payer-cell">
                        <span className="cost-payer-tag">
                          {snap.payer === 'consignee' ? 'Consignee' : 'Shipper'}
                        </span>
                        <span className="cost-timing-sub">
                          {TIMING_LABELS[snap.payment_timing] || snap.payment_timing}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="cost-badges-cell">
                        {renderTreatmentBadge(snap)}
                        {renderCertaintyBadge(snap.certainty)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{renderLineAmount(snap, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cost-totals-grid">
            <div className="cost-total-card">
              <span className="cost-total-label">Base Freight (booking.total_price)</span>
              <strong className="cost-total-val">{formatMoney(baseTotal, currency)}</strong>
              <span className="cost-total-sub">
                Origin {originCharges.toFixed(2)} · Ocean {oceanCharges.toFixed(2)} · Dest{' '}
                {destinationCharges.toFixed(2)}
              </span>
            </div>

            <div className="cost-total-card">
              <span className="cost-total-label">Frozen Shipper Prepaid</span>
              <strong className="cost-total-val">{formatMoney(shipperPrepaid, currency)}</strong>
              <span className="cost-total-sub">Shipper responsibility</span>
            </div>

            <div className="cost-total-card">
              <span className="cost-total-label">Frozen Consignee Payable</span>
              <strong className="cost-total-val">{formatMoney(consigneeCollect, currency)}</strong>
              <span className="cost-total-sub">Consignee responsibility</span>
            </div>

            <div className="cost-total-card cost-total-card-highlight">
              <span className="cost-total-label">Frozen All-In Total</span>
              <strong className="cost-total-val text-orange">
                {formatMoney(allInTotal, currency)}
              </strong>
              <span className="cost-total-sub">Protected by DB immutability trigger</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
