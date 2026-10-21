import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  PlusCircle,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
  BookOpen,
  Sparkles,
  Save,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../api/client';

const STAGE_OPTIONS = [
  { value: 'origin', label: 'Origin' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'destination', label: 'Destination' },
];

const TREATMENT_OPTIONS = [
  { value: 'charged', label: 'Charged (Added to quote)' },
  { value: 'included', label: 'Included in base rate (0.00)' },
  { value: 'not_charged', label: 'Waived / Not charged (0.00)' },
  { value: 'excluded', label: 'Excluded (Paid separately)' },
];

const BASIS_OPTIONS = [
  { value: 'per_cbm', label: 'Per CBM' },
  { value: 'per_tonne', label: 'Per Tonne' },
  { value: 'per_shipment', label: 'Per Shipment (Flat fee)' },
  { value: 'percentage', label: '% of Ocean Freight' },
  { value: 'per_cbm_per_day', label: 'Per CBM / Day (Storage)' },
  { value: 'at_cost', label: 'At Actual Cost (Variable pass-through)' },
];

const CERTAINTY_OPTIONS = [
  { value: 'fixed', label: 'Fixed (Confirmed rate)' },
  { value: 'estimate', label: 'Estimated (Approximate)' },
  { value: 'variable', label: 'Variable (Subject to change)' },
  { value: 'conditional', label: 'Conditional (If applicable)' },
];

const PAYER_OPTIONS = [
  { value: 'shipper', label: 'Shipper (Exporter)' },
  { value: 'consignee', label: 'Consignee (Importer)' },
];

const TIMING_OPTIONS = [
  { value: 'prepaid', label: 'Prepaid (Before departure)' },
  { value: 'collect', label: 'Collect (At destination)' },
  { value: 'upon_delivery', label: 'Upon Cargo Delivery' },
  { value: 'at_terminal', label: 'At Terminal' },
];

const CURRENCY_OPTIONS = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'SGD'];

function normalizeRuleForForm(rule) {
  return {
    min_billable_cbm: String(rule?.min_billable_cbm ?? '1.00'),
    weight_volume_ratio: String(rule?.weight_volume_ratio ?? '1000.00'),
    cbm_rounding_decimal: String(rule?.cbm_rounding_decimal ?? '2'),
    free_storage_days: String(rule?.free_storage_days ?? '3'),
    storage_rate_per_cbm_day: String(rule?.storage_rate_per_cbm_day ?? '0.00'),
    currency: rule?.currency || 'USD',
    price_validity_date: rule?.price_validity_date
      ? String(rule.price_validity_date).slice(0, 10)
      : '',
    surcharge_change_policy: rule?.surcharge_change_policy || '',
  };
}

function normalizeItemForForm(item, fallbackCurrency = 'USD') {
  const treatment = item.treatment || 'charged';
  const basis = item.basis || 'per_cbm';
  const zeroRateForced = treatment !== 'charged' || basis === 'at_cost';
  return {
    charge_type_code: item.charge_type_code || '',
    charge_name: item.charge_name || '',
    stage: item.stage || 'origin',
    treatment,
    basis,
    rate: zeroRateForced ? '0' : String(item.rate ?? '0'),
    currency: item.currency || fallbackCurrency,
    certainty: item.certainty || (basis === 'per_cbm_per_day' ? 'conditional' : 'fixed'),
    payer: item.payer || 'shipper',
    payee: item.payee || '',
    payment_timing: item.payment_timing || 'prepaid',
    explanatory_note: item.explanatory_note || '',
  };
}

export default function ProviderPricingModal({
  listing,
  providerId,
  onClose,
  onSaved,
}) {
  const listingId = listing?.listing_id ?? listing?.id;

  const [catalogue, setCatalogue] = useState([]);
  const [showCatalogue, setShowCatalogue] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isLegacyMode, setIsLegacyMode] = useState(true);

  const [pricingRule, setPricingRule] = useState(() => normalizeRuleForForm(null));
  const [chargeItems, setChargeItems] = useState([]);

  // Lock background page scroll while modal is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const loadConfiguration = useCallback(async () => {
    if (!listingId) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const [catRes, pricingRes] = await Promise.all([
        api.getStandardChargeTypes(),
        api.getListingPricing(listingId),
      ]);

      setCatalogue(catRes.data || []);

      const pData = pricingRes.data || {};
      const effectiveRule = pData.pricing_rule || pData.effective_pricing_rule || null;
      const ruleForm = normalizeRuleForForm(effectiveRule);
      setPricingRule(ruleForm);

      const loadedItems = Array.isArray(pData.charge_items) ? pData.charge_items : [];
      setChargeItems(loadedItems.map((it) => normalizeItemForForm(it, ruleForm.currency)));
      setIsLegacyMode(Boolean(pData.is_legacy_listing));
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to load listing pricing configuration.',
      });
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  const handleRuleChange = (field, value) => {
    setPricingRule((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'currency') {
        setChargeItems((items) => items.map((it) => ({ ...it, currency: value })));
      }
      return next;
    });
  };

  const handleAddFromCatalogue = (catItem) => {
    const treatment = catItem.default_treatment || 'charged';
    const basis = catItem.default_basis || 'per_cbm';
    const zeroRateForced = treatment !== 'charged' || basis === 'at_cost';
    const defaultCertainty =
      basis === 'per_cbm_per_day'
        ? 'conditional'
        : basis === 'at_cost'
        ? 'variable'
        : 'fixed';

    const newLine = {
      charge_type_code: catItem.code,
      charge_name: catItem.name,
      stage: catItem.stage || 'origin',
      treatment,
      basis,
      rate: zeroRateForced ? '0' : '25.00',
      currency: pricingRule.currency || 'USD',
      certainty: defaultCertainty,
      payer: catItem.default_payer || (catItem.stage === 'destination' ? 'consignee' : 'shipper'),
      payee: '',
      payment_timing:
        catItem.default_payment_timing ||
        (catItem.stage === 'destination' ? 'collect' : 'prepaid'),
      explanatory_note: catItem.description || '',
    };

    setChargeItems((prev) => [...prev, newLine]);
    setStatusMessage(null);
  };

  const handleAddCustomLine = () => {
    setChargeItems((prev) => [
      ...prev,
      {
        charge_type_code: '',
        charge_name: '',
        stage: 'origin',
        treatment: 'charged',
        basis: 'per_shipment',
        rate: '35.00',
        currency: pricingRule.currency || 'USD',
        certainty: 'fixed',
        payer: 'shipper',
        payee: '',
        payment_timing: 'prepaid',
        explanatory_note: '',
      },
    ]);
    setStatusMessage(null);
  };

  const handleFillSampleAllInTemplate = () => {
    const cur = pricingRule.currency || 'USD';
    setPricingRule((prev) => ({
      ...prev,
      min_billable_cbm: '1.00',
      weight_volume_ratio: '1000.00',
      cbm_rounding_decimal: '2',
      free_storage_days: '4',
      storage_rate_per_cbm_day: '8.00',
    }));
    setChargeItems([
      {
        charge_type_code: 'origin_cfs',
        charge_name: 'Origin CFS / Stuffing',
        stage: 'origin',
        treatment: 'charged',
        basis: 'per_cbm',
        rate: '18.00',
        currency: cur,
        certainty: 'fixed',
        payer: 'shipper',
        payee: 'Origin CFS Terminal',
        payment_timing: 'prepaid',
        explanatory_note: 'Illustrative origin warehouse receiving and container stuffing fee',
      },
      {
        charge_type_code: 'documentation_fee',
        charge_name: 'Bill of Lading & Documentation Fee',
        stage: 'origin',
        treatment: 'charged',
        basis: 'per_shipment',
        rate: '45.00',
        currency: cur,
        certainty: 'fixed',
        payer: 'shipper',
        payee: 'Carrier / Forwarder',
        payment_timing: 'prepaid',
        explanatory_note: 'Illustrative B/L issuance and export filing fee',
      },
      {
        charge_type_code: 'export_customs',
        charge_name: 'Export Customs Clearance',
        stage: 'origin',
        treatment: 'included',
        basis: 'per_shipment',
        rate: '0',
        currency: cur,
        certainty: 'fixed',
        payer: 'shipper',
        payee: '',
        payment_timing: 'prepaid',
        explanatory_note: 'Included in base rate (no extra charge)',
      },
      {
        charge_type_code: 'destination_thc',
        charge_name: 'Destination Terminal Handling (DTHC)',
        stage: 'destination',
        treatment: 'charged',
        basis: 'per_cbm',
        rate: '24.00',
        currency: cur,
        certainty: 'estimate',
        payer: 'consignee',
        payee: 'Destination Port Terminal',
        payment_timing: 'collect',
        explanatory_note: 'Estimated destination handling payable prior to cargo release',
      },
      {
        charge_type_code: 'import_duties_taxes',
        charge_name: 'Import Duties & Customs Taxes',
        stage: 'destination',
        treatment: 'excluded',
        basis: 'at_cost',
        rate: '0',
        currency: cur,
        certainty: 'variable',
        payer: 'consignee',
        payee: 'Destination Customs Authority',
        payment_timing: 'upon_delivery',
        explanatory_note: 'Assessed directly by destination customs authority (not in total)',
      },
    ]);
    setStatusMessage({
      type: 'info',
      text: 'Loaded illustrative example charges into the editor. These sample figures are for demonstration only and are not saved until you click "Save Pricing".',
    });
  };

  const handleUpdateLine = (index, field, value) => {
    setChargeItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, [field]: value };

        if (field === 'charge_type_code' && value) {
          const matchedCat = catalogue.find((c) => c.code === value);
          if (matchedCat) {
            next.charge_name = matchedCat.name;
            next.stage = matchedCat.stage || next.stage;
            next.basis = matchedCat.default_basis || next.basis;
            next.treatment = matchedCat.default_treatment || next.treatment;
            next.payer = matchedCat.default_payer || next.payer;
            next.payment_timing = matchedCat.default_payment_timing || next.payment_timing;
          }
        }

        if (next.treatment !== 'charged' || next.basis === 'at_cost') {
          next.rate = '0';
        }
        return next;
      })
    );
  };

  const handleRemoveLine = (index) => {
    setChargeItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setStatusMessage(null);

    for (let i = 0; i < chargeItems.length; i += 1) {
      const it = chargeItems[i];
      if (!String(it.charge_name || '').trim()) {
        setStatusMessage({
          type: 'error',
          text: `Charge line #${i + 1} requires a Charge Name.`,
        });
        return;
      }
      const rateNum = Number(it.rate);
      if (!Number.isFinite(rateNum) || rateNum < 0) {
        setStatusMessage({
          type: 'error',
          text: `Charge line #${i + 1} ("${it.charge_name}") has an invalid rate. Rate must be 0 or greater.`,
        });
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        pricing_rule: {
          min_billable_cbm: Number(pricingRule.min_billable_cbm || 1),
          weight_volume_ratio: Number(pricingRule.weight_volume_ratio || 1000),
          cbm_rounding_decimal: Number(pricingRule.cbm_rounding_decimal || 2),
          free_storage_days: Number(pricingRule.free_storage_days || 0),
          storage_rate_per_cbm_day: Number(pricingRule.storage_rate_per_cbm_day || 0),
          currency: pricingRule.currency || 'USD',
          price_validity_date: pricingRule.price_validity_date || null,
          surcharge_change_policy: pricingRule.surcharge_change_policy || null,
        },
        charge_items: chargeItems.map((it) => ({
          charge_type_code: it.charge_type_code || null,
          charge_name: String(it.charge_name).trim(),
          stage: it.stage,
          treatment: it.treatment,
          basis: it.basis,
          rate:
            it.treatment !== 'charged' || it.basis === 'at_cost'
              ? 0
              : Number(it.rate || 0),
          currency: pricingRule.currency || 'USD',
          certainty: it.certainty,
          payer: it.payer,
          payee: it.payee ? String(it.payee).trim() : null,
          payment_timing: it.payment_timing,
          explanatory_note: it.explanatory_note ? String(it.explanatory_note).trim() : null,
        })),
      };

      const res = await api.saveListingPricing(providerId, listingId, payload);
      const savedData = res.data || {};
      const ruleForm = normalizeRuleForForm(
        savedData.pricing_rule || savedData.effective_pricing_rule
      );
      setPricingRule(ruleForm);
      setChargeItems(
        (savedData.charge_items || []).map((it) => normalizeItemForForm(it, ruleForm.currency))
      );
      setIsLegacyMode(Boolean(savedData.is_legacy_listing));

      setStatusMessage({
        type: 'success',
        text:
          savedData.charge_items?.length > 0
            ? `Saved ${savedData.charge_items.length} itemised charge line(s) and pricing rules for Listing #${listingId}.`
            : `Saved pricing rules for Listing #${listingId} (Base-freight only mode).`,
      });

      if (onSaved) {
        onSaved(savedData);
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to save listing pricing configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!listing) return null;

  const addedCodes = new Set(chargeItems.map((it) => it.charge_type_code).filter(Boolean));

  return (
    <div className="modal-backdrop" onClick={() => !saving && onClose()}>
      <div
        className="modal-card modal-card-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-pricing-modal-title"
      >
        <div className="modal-header">
          <div>
            <span className="modal-eyebrow">
              ITEMISED PRICING EDITOR &middot; LISTING #{listingId}
            </span>
            <h3 id="provider-pricing-modal-title" className="modal-title">
              Configure Pricing &amp; Additional Charges ({listing.origin_port_code} &rarr;{' '}
              {listing.destination_port_code})
            </h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={saving}
            aria-label="Close pricing editor"
          >
            <X size={18} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSave}>
          <div className="modal-body">
            {/* Base Freight Reference Strip */}
            <div className="booking-route-summary">
              <div className="pricing-modal-top-bar">
                <div className="booking-route-meta">
                  <span>
                    Base Volume Rate: <strong>${Number(listing.price_per_cbm).toFixed(2)}/CBM</strong>
                  </span>
                  <span>
                    Base Weight Rate: <strong>${Number(listing.price_per_tonne).toFixed(2)}/t</strong>
                  </span>
                  <span>
                    Minimum Charge: <strong>${Number(listing.minimum_charge).toFixed(2)}</strong>
                  </span>
                </div>
                <div className="pricing-modal-top-actions">
                  <span
                    className={`cost-mode-pill ${
                      isLegacyMode ? 'cost-mode-legacy' : 'cost-mode-itemised'
                    }`}
                  >
                    {isLegacyMode
                      ? 'Saved: Base-Rate Only'
                      : `Saved: ${chargeItems.length} Charge Line(s)`}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary-sm"
                    onClick={loadConfiguration}
                    disabled={loading || saving}
                  >
                    <RefreshCw size={13} />
                    <span>Reload Saved</span>
                  </button>
                  <button
                    type="button"
                    className="btn-preset-chip"
                    onClick={handleFillSampleAllInTemplate}
                    disabled={loading || saving}
                  >
                    <Sparkles size={13} />
                    <span>Load Illustrative Example</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Save / Validation / Info Banner */}
            {statusMessage && (
              <div
                className={`alert-banner ${
                  statusMessage.type === 'success'
                    ? 'alert-success'
                    : statusMessage.type === 'info'
                    ? 'alert-info'
                    : 'alert-error'
                }`}
                role="alert"
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 size={18} />
                ) : statusMessage.type === 'info' ? (
                  <Info size={18} />
                ) : (
                  <AlertTriangle size={18} />
                )}
                <div className="alert-content-grow">
                  <p>{statusMessage.text}</p>
                </div>
                <button
                  type="button"
                  className="alert-dismiss-btn"
                  onClick={() => setStatusMessage(null)}
                >
                  <X size={15} />
                </button>
              </div>
            )}

            {loading ? (
              <div className="empty-state-card">Loading listing pricing rules and catalogue...</div>
            ) : (
              <>
                {/* SECTION 1: Listing Pricing Rules */}
                <div className="pricing-editor-section">
                  <div className="pricing-editor-section-header">
                    <SlidersHorizontal size={15} className="text-orange" />
                    <h4>1. Calculation &amp; Storage Rules</h4>
                  </div>

                  <div className="pricing-rules-grid">
                    <div className="form-group">
                      <label className="form-label">Listing Currency</label>
                      <select
                        className="form-select"
                        value={pricingRule.currency}
                        onChange={(e) => handleRuleChange('currency', e.target.value)}
                      >
                        {CURRENCY_OPTIONS.map((cur) => (
                          <option key={cur} value={cur}>
                            {cur}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Min Billable Volume (CBM)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-input"
                        value={pricingRule.min_billable_cbm}
                        onChange={(e) => handleRuleChange('min_billable_cbm', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Weight-to-Volume Ratio (kg/CBM)</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        className="form-input"
                        value={pricingRule.weight_volume_ratio}
                        onChange={(e) => handleRuleChange('weight_volume_ratio', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Volume Rounding</label>
                      <select
                        className="form-select"
                        value={pricingRule.cbm_rounding_decimal}
                        onChange={(e) => handleRuleChange('cbm_rounding_decimal', e.target.value)}
                      >
                        {[0, 1, 2, 3, 4].map((d) => (
                          <option key={d} value={String(d)}>
                            {d} decimal{d === 1 ? '' : 's'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Free Storage Days</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="form-input"
                        value={pricingRule.free_storage_days}
                        onChange={(e) => handleRuleChange('free_storage_days', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Excess Storage Rate ({pricingRule.currency}/CBM/day)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-input"
                        value={pricingRule.storage_rate_per_cbm_day}
                        onChange={(e) =>
                          handleRuleChange('storage_rate_per_cbm_day', e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 2: Standard Charge Catalogue Picker */}
                <div className="pricing-editor-section">
                  <div className="pricing-editor-section-header pricing-section-header-Wrap">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <BookOpen size={15} className="text-orange" />
                      <h4>2. Standard LCL Charge Catalogue ({catalogue.length} Types)</h4>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary-sm"
                      onClick={() => setShowCatalogue((prev) => !prev)}
                    >
                      <span>{showCatalogue ? 'Hide Catalogue' : 'Show Catalogue'}</span>
                      {showCatalogue ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>

                  {showCatalogue && (
                    <div className="catalogue-chips-grid">
                      {catalogue.map((cat) => {
                        const alreadyAdded = addedCodes.has(cat.code);
                        return (
                          <div
                            key={cat.code}
                            className={`catalogue-item-card ${alreadyAdded ? 'added' : ''}`}
                          >
                            <div className="catalogue-item-top">
                              <strong>{cat.name}</strong>
                              <span className={`cost-stage-tag stage-${cat.stage}`}>
                                {cat.stage}
                              </span>
                            </div>
                            <span className="catalogue-item-meta">
                              {cat.default_basis?.replace(/_/g, ' ')} &middot; {cat.default_payer}{' '}
                              &middot; {cat.default_payment_timing}
                            </span>
                            <button
                              type="button"
                              className="btn-catalogue-add"
                              onClick={() => handleAddFromCatalogue(cat)}
                            >
                              <PlusCircle size={12} />
                              <span>{alreadyAdded ? 'Add Another' : 'Add Charge'}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SECTION 3: Configured Charge Lines */}
                <div className="pricing-editor-section">
                  <div className="pricing-editor-section-header pricing-section-header-Wrap">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <h4>3. Configured Charge Lines ({chargeItems.length})</h4>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {chargeItems.length > 0 && (
                        <button
                          type="button"
                          className="btn-secondary-sm"
                          onClick={() => setChargeItems([])}
                        >
                          Clear All
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-orange-primary btn-sm"
                        onClick={handleAddCustomLine}
                      >
                        <PlusCircle size={13} />
                        <span>Add Custom Charge</span>
                      </button>
                    </div>
                  </div>

                  {/* Brief Treatment Explanation */}
                  <div className="treatment-guide-bar">
                    <span>
                      <strong>Charged:</strong> Added to quote total.
                    </span>
                    <span>
                      <strong>Included / Waived:</strong> 0.00 (no extra cost).
                    </span>
                    <span>
                      <strong>Excluded / At Actual Cost:</strong> Disclosed to trader, not added to
                      fixed total.
                    </span>
                  </div>

                  {chargeItems.length === 0 ? (
                    <div className="cost-legacy-notice">
                      <div>
                        <strong>No additional charges configured (Base-Freight Only).</strong>{' '}
                        Select a charge from the Standard Catalogue above or click{' '}
                        <strong>&ldquo;Add Custom Charge&rdquo;</strong> to itemise origin, ocean,
                        or destination fees. Base ocean freight is automatically calculated from the
                        listing&apos;s CBM, tonne, and minimum rates.
                      </div>
                    </div>
                  ) : (
                    <div className="charge-editor-list">
                      {chargeItems.map((item, idx) => {
                        const rateLocked =
                          item.treatment !== 'charged' || item.basis === 'at_cost';
                        return (
                          <div key={idx} className="charge-editor-row-card">
                            <div className="charge-editor-row-top">
                              <div className="charge-editor-row-title">
                                <span className="charge-line-index">Charge #{idx + 1}</span>
                                <span className={`cost-stage-tag stage-${item.stage || 'origin'}`}>
                                  {item.stage}
                                </span>
                                {item.charge_name && (
                                  <strong className="charge-line-preview-name">
                                    {item.charge_name}
                                  </strong>
                                )}
                              </div>
                              <button
                                type="button"
                                className="btn-danger-sm"
                                onClick={() => handleRemoveLine(idx)}
                                title="Remove charge line"
                              >
                                <Trash2 size={13} />
                                <span>Remove</span>
                              </button>
                            </div>

                            {/* Row 1: Type, Name, Stage */}
                            <div className="charge-editor-grid-3">
                              <div className="form-group">
                                <label className="form-label">Standard Type</label>
                                <select
                                  className="form-select"
                                  value={item.charge_type_code}
                                  onChange={(e) =>
                                    handleUpdateLine(idx, 'charge_type_code', e.target.value)
                                  }
                                >
                                  <option value="">Custom Charge</option>
                                  {catalogue.map((c) => (
                                    <option key={c.code} value={c.code}>
                                      {c.name} ({c.stage})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="form-group">
                                <label className="form-label">Charge Name *</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={item.charge_name}
                                  onChange={(e) =>
                                    handleUpdateLine(idx, 'charge_name', e.target.value)
                                  }
                                  placeholder="e.g. Origin CFS Handling"
                                  required
                                />
                              </div>

                              <div className="form-group">
                                <label className="form-label">Stage</label>
                                <select
                                  className="form-select"
                                  value={item.stage}
                                  onChange={(e) => handleUpdateLine(idx, 'stage', e.target.value)}
                                >
                                  {STAGE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Row 2: Treatment, Basis, Rate */}
                            <div className="charge-editor-grid-3" style={{ marginTop: '10px' }}>
                              <div className="form-group">
                                <label className="form-label">Charge Treatment</label>
                                <select
                                  className="form-select"
                                  value={item.treatment}
                                  onChange={(e) =>
                                    handleUpdateLine(idx, 'treatment', e.target.value)
                                  }
                                >
                                  {TREATMENT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="form-group">
                                <label className="form-label">Calculation Basis</label>
                                <select
                                  className="form-select"
                                  value={item.basis}
                                  onChange={(e) => handleUpdateLine(idx, 'basis', e.target.value)}
                                >
                                  {BASIS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="form-group">
                                <label className="form-label">
                                  Rate ({pricingRule.currency})
                                  {rateLocked ? ' — Auto 0.00' : ''}
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="form-input"
                                  value={rateLocked ? '0' : item.rate}
                                  onChange={(e) => handleUpdateLine(idx, 'rate', e.target.value)}
                                  disabled={rateLocked}
                                />
                              </div>
                            </div>

                            {/* Row 3: Certainty, Payer, Payment Timing */}
                            <div className="charge-editor-grid-3" style={{ marginTop: '10px' }}>
                              <div className="form-group">
                                <label className="form-label">Price Certainty</label>
                                <select
                                  className="form-select"
                                  value={item.certainty}
                                  onChange={(e) =>
                                    handleUpdateLine(idx, 'certainty', e.target.value)
                                  }
                                >
                                  {CERTAINTY_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="form-group">
                                <label className="form-label">Paid By (Payer)</label>
                                <select
                                  className="form-select"
                                  value={item.payer}
                                  onChange={(e) => handleUpdateLine(idx, 'payer', e.target.value)}
                                >
                                  {PAYER_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="form-group">
                                <label className="form-label">Payment Timing</label>
                                <select
                                  className="form-select"
                                  value={item.payment_timing}
                                  onChange={(e) =>
                                    handleUpdateLine(idx, 'payment_timing', e.target.value)
                                  }
                                >
                                  {TIMING_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Row 4: Optional Payee & Explanatory Note */}
                            <div className="charge-editor-grid-2" style={{ marginTop: '10px' }}>
                              <div className="form-group">
                                <label className="form-label">Payee (Optional)</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={item.payee}
                                  onChange={(e) => handleUpdateLine(idx, 'payee', e.target.value)}
                                  placeholder="e.g. Origin CFS / Destination Terminal"
                                />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Note for Trader (Optional)</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={item.explanatory_note}
                                  onChange={(e) =>
                                    handleUpdateLine(idx, 'explanatory_note', e.target.value)
                                  }
                                  placeholder="e.g. Applies per billable CBM"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary-outline"
              onClick={onClose}
              disabled={saving}
            >
              Close
            </button>
            <button
              type="submit"
              className="btn-orange-primary"
              disabled={loading || saving}
            >
              <Save size={15} />
              <span>{saving ? 'Saving Pricing...' : 'Save Pricing'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
