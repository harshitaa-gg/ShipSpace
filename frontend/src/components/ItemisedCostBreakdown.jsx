import React, { useState } from 'react';
import {
  Calculator,
  AlertTriangle,
  Info,
  Lock,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
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
  percent_ocean_freight: '% of Ocean Freight',
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
    return <span className="cost-badge cost-badge-not-charged">Waived</span>;
  }
  if (t === 'excluded') {
    return <span className="cost-badge cost-badge-excluded">Excluded</span>;
  }
  if (line.basis === 'at_cost') {
    return <span className="cost-badge cost-badge-at-cost">At Actual Cost</span>;
  }
  return <span className="cost-badge cost-badge-charged">Charged</span>;
}

function renderCertaintyBadge(line) {
  if (line.treatment === 'included' || line.treatment === 'not_charged') {
    return null;
  }
  const c = line.certainty || 'fixed';
  if (c === 'fixed') {
    return <span className="cost-badge cost-badge-fixed">Fixed</span>;
  }
  if (c === 'estimate') {
    return <span className="cost-badge cost-badge-estimate">Estimated</span>;
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
        Not in total (Paid separately)
      </span>
    );
  }
  if (line.treatment === 'included') {
    return <span className="cost-amount-zero">Included (No extra charge)</span>;
  }
  if (line.treatment === 'not_charged') {
    return <span className="cost-amount-zero">Waived (0.00 {cur})</span>;
  }
  if (line.basis === 'at_cost') {
    return (
      <span className="cost-amount-variable">
        Variable (Billed at actual cost)
      </span>
    );
  }
  if (line.certainty === 'conditional' && Number(line.calculated_amount || 0) === 0) {
    return (
      <span className="cost-amount-variable">
        0.00 {cur} (Applies only if exceeded)
      </span>
    );
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

  if (line.treatment === 'included') {
    return 'Included in base freight';
  }
  if (line.treatment === 'not_charged') {
    return 'Not charged on this listing';
  }
  if (line.treatment === 'excluded') {
    return 'Excluded — settled directly with authority/third party';
  }
  if (line.basis === 'at_cost') {
    return 'Pass-through at actual cost (not in fixed total)';
  }

  const rate = Number(line.rate || 0).toFixed(2);
  const qty = Number(line.chargeable_quantity || 0).toFixed(2);

  if (line.basis === 'per_shipment') {
    return `${basisLabel} (${rate} ${cur} flat)`;
  }
  if (line.basis === 'percentage' || line.basis === 'percent_ocean_freight') {
    return `${rate}% of ocean freight (${qty} ${cur})`;
  }
  if (line.basis === 'per_cbm_per_day') {
    return `${rate} ${cur} / CBM / day`;
  }
  return `${basisLabel} (${qty} × ${rate} ${cur})`;
}

function isBaseFreightLine(line, index) {
  if (line.source === 'capacity_listing_base') return true;
  if (line.charge_type_code === 'ocean_freight') return true;
  if (index === 0 && line.stage === 'ocean' && /ocean\s*freight/i.test(line.charge_name || '')) {
    return true;
  }
  return false;
}

/**
 * Displays the live itemised quote returned by GET /api/trader/listings/:listingId/quote.
 * Uses backend response exclusively without recreating pricing logic in React.
 */
export function LiveQuoteBreakdown({ quote, loading = false, error = null }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (loading) {
    return (
      <div className="pricing-preview-box">
        <div className="pricing-preview-header">
          <Calculator size={15} className="text-orange" />
          <span>Calculating quote from server...</span>
        </div>
        <p className="text-muted-sm">Loading base freight and configured charge items...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert-banner alert-error" role="alert">
        <AlertTriangle size={16} />
        <div>
          <strong>Unable to Calculate Quote</strong>
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

  // Classify lines using backend flags/fields (no formula recalculation)
  const additionalLines = isLegacy
    ? []
    : lines.filter((line, idx) => !isBaseFreightLine(line, idx));

  const billableAdditionalLines = additionalLines.filter(
    (l) => l.treatment === 'charged' && l.basis !== 'at_cost'
  );
  const includedLines = additionalLines.filter(
    (l) => l.treatment === 'included' || l.treatment === 'not_charged'
  );
  const nonIncludedVariableOrExcludedLines = additionalLines.filter(
    (l) =>
      l.treatment === 'excluded' ||
      l.basis === 'at_cost' ||
      (l.certainty === 'conditional' && Number(l.calculated_amount || 0) === 0)
  );

  // Determine whether all additional charges are uncalculable (at_cost / excluded only)
  const hasUncalculableCharges = additionalLines.some(
    (l) => l.treatment === 'excluded' || l.basis === 'at_cost'
  );
  const onlyUncalculableAdditional =
    !isLegacy &&
    additionalLines.length > 0 &&
    billableAdditionalLines.length === 0 &&
    includedLines.length === 0 &&
    hasUncalculableCharges;

  let additionalSummaryLabel = 'Not configured';
  let additionalSummarySub = 'Origin & destination charges not itemised';
  if (!isLegacy) {
    if (additionalLines.length === 0) {
      additionalSummaryLabel = 'None configured';
      additionalSummarySub = 'Base freight only';
    } else {
      const parts = [];
      if (billableAdditionalLines.length > 0) {
        parts.push(
          `${billableAdditionalLines.length} billable`
        );
      }
      if (includedLines.length > 0) {
        parts.push(`${includedLines.length} included/waived`);
      }
      if (hasUncalculableCharges) {
        const excCount = additionalLines.filter(
          (l) => l.treatment === 'excluded' || l.basis === 'at_cost'
        ).length;
        parts.push(`${excCount} separate/at-cost`);
      }
      additionalSummaryLabel = `${additionalLines.length} Charge Item${
        additionalLines.length === 1 ? '' : 's'
      }`;
      additionalSummarySub = parts.join(' · ') || 'See breakdown below';
    }
  }

  return (
    <div className="itemised-cost-panel">
      <div className="itemised-cost-header">
        <div className="itemised-cost-title-wrap">
          <Calculator size={16} className="text-orange" />
          <strong>{isLegacy ? 'Base Freight Quote' : 'Shipment Price Summary'}</strong>
        </div>
        <span
          className={`cost-mode-pill ${
            isLegacy ? 'cost-mode-legacy' : 'cost-mode-itemised'
          }`}
        >
          {isLegacy
            ? 'Base Freight Only'
            : `${lines.length} Configured Line${lines.length === 1 ? '' : 's'} · ${currency}`}
        </span>
      </div>

      {/* Legacy Listing Warning */}
      {isLegacy && (
        <div className="cost-legacy-notice" role="status">
          <Info size={15} className="cost-notice-icon" />
          <div>
            <strong>Additional charges have not been itemised:</strong> This listing only specifies
            a base ocean freight rate. Origin terminal handling, documentation, customs clearance,
            and destination charges are not included in this quote.
          </div>
        </div>
      )}

      {/* Primary Summary Cards: Base Freight, Additional Charges, Shipper Pays, Consignee Pays, Estimated Total */}
      <div className="cost-summary-grid">
        <div className="cost-total-card">
          <span className="cost-total-label">1. Base Freight</span>
          <strong className="cost-total-val">
            {formatMoney(totals.base_freight ?? quote.base_freight, currency)}
          </strong>
          <span className="cost-total-sub">
            {quote.base_freight_details?.governing_basis
              ? `Core transport (${quote.base_freight_details.governing_basis.replace(/_/g, ' ')})`
              : 'Core ocean transport amount'}
          </span>
        </div>

        <div className="cost-total-card">
          <span className="cost-total-label">2. Additional Charges</span>
          <strong className="cost-total-val cost-total-val-md">{additionalSummaryLabel}</strong>
          <span className="cost-total-sub">{additionalSummarySub}</span>
        </div>

        {!isLegacy && (
          <>
            <div className="cost-total-card">
              <span className="cost-total-label">Shipper Pays</span>
              <strong className="cost-total-val">
                {formatMoney(totals.estimated_shipper_prepaid_total, currency)}
              </strong>
              <span className="cost-total-sub">Prepaid origin &amp; ocean charges</span>
            </div>

            <div className="cost-total-card">
              <span className="cost-total-label">Consignee Pays</span>
              <strong className="cost-total-val">
                {formatMoney(totals.estimated_consignee_payable_total, currency)}
              </strong>
              <span className="cost-total-sub">Destination / collect charges</span>
            </div>
          </>
        )}

        <div className="cost-total-card cost-total-card-highlight">
          <span className="cost-total-label">
            {isLegacy
              ? 'Base Freight Total (Not All-In)'
              : onlyUncalculableAdditional
              ? 'Known Base Freight Subtotal'
              : hasUncalculableCharges
              ? '3. Estimated Total (Known Charges)'
              : '3. Estimated Total'}
          </span>
          <strong className="cost-total-val text-orange">
            {formatMoney(totals.estimated_all_in_total, currency)}
          </strong>
          {hasRange ? (
            <span className="cost-total-sub">
              Estimated range: {formatMoney(rangeMin, currency)} &ndash;{' '}
              {formatMoney(rangeMax, currency)}
            </span>
          ) : (
            <span className="cost-total-sub">
              {isLegacy
                ? 'Additional charges not itemised'
                : hasUncalculableCharges
                ? 'Excludes variable at-cost & excluded fees'
                : 'Includes base freight & configured charges'}
            </span>
          )}
        </div>
      </div>

      {/* Concise Additional Charges List (when itemised) */}
      {!isLegacy && additionalLines.length > 0 && (
        <div className="cost-quick-lines-box">
          <div className="cost-quick-lines-title">Configured Additional Charges</div>
          <div className="cost-quick-lines-list">
            {additionalLines.map((line, idx) => (
              <div key={idx} className="cost-quick-line-row">
                <div className="cost-quick-line-left">
                  <span className={`cost-stage-tag stage-${line.stage || 'ocean'}`}>
                    {STAGE_LABELS[line.stage] || line.stage}
                  </span>
                  <span className="cost-quick-line-name">{line.charge_name}</span>
                  <span className="cost-quick-line-payer">
                    ({line.payer === 'consignee' ? 'Consignee' : 'Shipper'})
                  </span>
                </div>
                <div className="cost-quick-line-right">
                  {renderLineAmount(line, currency)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Variable, Conditional, or Excluded Charges Disclosure */}
      {!isLegacy && (nonIncludedVariableOrExcludedLines.length > 0 || warnings.length > 0) && (
        <div className="cost-warnings-box">
          <div className="cost-warnings-header">
            <ShieldAlert size={14} />
            <span>Not Included in Estimated Total / Pricing Notes</span>
          </div>
          <ul className="cost-warnings-list">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Collapsible Itemised Breakdown Section */}
      {lines.length > 0 && (
        <div className="cost-collapsible-section">
          <button
            type="button"
            className="cost-collapse-toggle-btn"
            onClick={() => setShowBreakdown((prev) => !prev)}
            aria-expanded={showBreakdown}
          >
            <span>
              {showBreakdown
                ? 'Hide itemised breakdown'
                : `View itemised breakdown (${lines.length} ${
                    lines.length === 1 ? 'line' : 'lines'
                  })`}
            </span>
            {showBreakdown ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showBreakdown && (
            <div className="cost-collapsible-body">
              {!isLegacy && quantities.billable_cbm !== undefined && (
                <div className="cost-quantities-strip">
                  <span>
                    Shipment: <strong>{Number(quantities.actual_cbm || 0).toFixed(2)} CBM</strong> /{' '}
                    <strong>{Number(quantities.actual_weight_tonnes || 0).toFixed(2)} t</strong>
                  </span>
                  <span>
                    Billable Volume:{' '}
                    <strong>{Number(quantities.billable_cbm || 0).toFixed(2)} CBM</strong>
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

              <div className="cost-lines-table-wrap">
                <table className="cost-lines-table">
                  <thead>
                    <tr>
                      <th>Charge &amp; Stage</th>
                      <th>Basis &amp; Notes</th>
                      <th>Payer &amp; Timing</th>
                      <th>Treatment &amp; Certainty</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
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
                        <td className="cost-basis-cell">
                          <div>{formatBasisDetail(line, currency)}</div>
                          {line.explanatory_note && (
                            <div className="cost-note-sub">{line.explanatory_note}</div>
                          )}
                        </td>
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
                            {renderCertaintyBadge(line)}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>{renderLineAmount(line, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Displays the immutable booking financial snapshot from booking_charge_snapshot
 * and v_booking_itemised_cost (never from live listing rates).
 */
export function SavedBookingSnapshotBreakdown({ booking, defaultExpanded = false }) {
  const [showBreakdown, setShowBreakdown] = useState(defaultExpanded);

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

  const excludedOrAtCostSnapshots = snapshots.filter(
    (s) => s.treatment === 'excluded' || s.basis === 'at_cost'
  );

  return (
    <div className="itemised-cost-panel snapshot-cost-panel">
      <div className="itemised-cost-header">
        <div className="itemised-cost-title-wrap">
          <Lock size={15} className="text-orange" />
          <strong>Saved Booking Price Snapshot</strong>
        </div>
        <span
          className={`cost-mode-pill ${
            isLegacy ? 'cost-mode-legacy' : 'cost-mode-itemised'
          }`}
        >
          {isLegacy
            ? 'Base Freight Only'
            : `${snapshots.length} Saved Charge Line${snapshots.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {isLegacy ? (
        <div className="cost-legacy-notice">
          <Info size={15} className="cost-notice-icon" />
          <div>
            <strong>Base Freight Booking:</strong> This booking was confirmed on a listing without
            itemised additional charges. The saved base freight amount is{' '}
            <strong>{formatMoney(baseTotal, currency)}</strong>. Additional origin or destination
            charges were not itemised on this listing.
          </div>
        </div>
      ) : (
        <>
          <div className="cost-summary-grid">
            <div className="cost-total-card">
              <span className="cost-total-label">Base Freight</span>
              <strong className="cost-total-val">{formatMoney(baseTotal, currency)}</strong>
              <span className="cost-total-sub">Core ocean freight locked at booking</span>
            </div>

            <div className="cost-total-card">
              <span className="cost-total-label">Shipper Pays</span>
              <strong className="cost-total-val">{formatMoney(shipperPrepaid, currency)}</strong>
              <span className="cost-total-sub">Prepaid charges</span>
            </div>

            <div className="cost-total-card">
              <span className="cost-total-label">Consignee Pays</span>
              <strong className="cost-total-val">{formatMoney(consigneeCollect, currency)}</strong>
              <span className="cost-total-sub">Destination / collect charges</span>
            </div>

            <div className="cost-total-card cost-total-card-highlight">
              <span className="cost-total-label">
                {excludedOrAtCostSnapshots.length > 0
                  ? 'Saved Total (Known Charges)'
                  : 'Saved Total Charged'}
              </span>
              <strong className="cost-total-val text-orange">
                {formatMoney(allInTotal, currency)}
              </strong>
              <span className="cost-total-sub">Locked at booking confirmation</span>
            </div>
          </div>

          {excludedOrAtCostSnapshots.length > 0 && (
            <div className="cost-warnings-box">
              <div className="cost-warnings-header">
                <ShieldAlert size={14} />
                <span>Variable or Excluded Items Not Included in Saved Total</span>
              </div>
              <ul className="cost-warnings-list">
                {excludedOrAtCostSnapshots.map((s, idx) => (
                  <li key={idx}>
                    <strong>{s.charge_name}</strong> ({STAGE_LABELS[s.stage] || s.stage}):{' '}
                    {s.treatment === 'excluded'
                      ? `Excluded from total — payable separately by ${s.payer}.`
                      : `Billed at actual cost (${s.payer}).`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="cost-collapsible-section">
            <button
              type="button"
              className="cost-collapse-toggle-btn"
              onClick={() => setShowBreakdown((prev) => !prev)}
              aria-expanded={showBreakdown}
            >
              <span>
                {showBreakdown
                  ? 'Hide itemised breakdown'
                  : `View itemised breakdown (${snapshots.length} saved ${
                      snapshots.length === 1 ? 'line' : 'lines'
                    })`}
              </span>
              {showBreakdown ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {showBreakdown && (
              <div className="cost-collapsible-body">
                <div className="cost-lines-table-wrap">
                  <table className="cost-lines-table">
                    <thead>
                      <tr>
                        <th>Charge &amp; Stage</th>
                        <th>Basis &amp; Notes</th>
                        <th>Payer &amp; Timing</th>
                        <th>Treatment &amp; Certainty</th>
                        <th style={{ textAlign: 'right' }}>Saved Amount</th>
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
                          <td className="cost-basis-cell">
                            <div>{formatBasisDetail(snap, currency)}</div>
                            {snap.explanatory_note && (
                              <div className="cost-note-sub">{snap.explanatory_note}</div>
                            )}
                          </td>
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
                              {renderCertaintyBadge(snap)}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>{renderLineAmount(snap, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
