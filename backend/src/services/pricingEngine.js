const pool = require("../config/db");
const { AppError } = require("../middleware/errorHandler");

const VALID_STAGES = ["origin", "ocean", "destination"];
const VALID_TREATMENTS = ["charged", "included", "not_charged", "excluded"];
const VALID_BASES = [
    "per_cbm",
    "per_shipment",
    "percent_ocean_freight",
    "per_cbm_per_day",
    "at_cost",
];
const VALID_CERTAINTIES = ["fixed", "estimate", "variable"];
const VALID_PAYERS = ["shipper", "consignee"];
const VALID_PAYMENT_TIMINGS = ["prepaid", "collect", "upon_delivery", "at_terminal"];

const DEFAULT_PRICING_RULE = Object.freeze({
    min_billable_cbm: 1.0,
    weight_volume_ratio: 1000.0,
    cbm_rounding_decimal: 2,
    free_storage_days: 3,
    storage_rate_per_cbm_day: 0.0,
    currency: "USD",
    price_validity_date: null,
    surcharge_change_policy: null,
});

function roundToDecimals(value, decimals = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return 0;
    }
    const d = Number.isInteger(decimals) && decimals >= 0 && decimals <= 6 ? decimals : 2;
    const factor = 10 ** d;
    return Math.round((num + Number.EPSILON) * factor) / factor;
}

function round2(value) {
    return roundToDecimals(value, 2);
}

function parseNonNegativeInput(value, fieldName) {
    if (value === undefined || value === null || value === "") {
        throw new AppError(`${fieldName} is required`, 400, "VALIDATION_ERROR");
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        throw new AppError(
            `${fieldName} must be a non-negative number`,
            400,
            "VALIDATION_ERROR"
        );
    }
    return num;
}

function parseOptionalNonNegativeInput(value, fieldName) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    return round2(parseNonNegativeInput(value, fieldName));
}

function parseCurrencyCode(value, fieldName = "currency", fallback = "USD") {
    if (value === undefined || value === null || String(value).trim() === "") {
        return fallback;
    }
    const clean = String(value).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(clean)) {
        throw new AppError(
            `${fieldName} must be a 3-letter ISO currency code (e.g., USD, INR)`,
            400,
            "VALIDATION_ERROR"
        );
    }
    return clean;
}

function parseOptionalDateString(value, fieldName) {
    if (value === undefined || value === null || String(value).trim() === "") {
        return null;
    }
    const str = String(value).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        throw new AppError(
            `${fieldName} must be a valid date in YYYY-MM-DD format`,
            400,
            "VALIDATION_ERROR"
        );
    }
    const parsed = new Date(`${str}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== str) {
        throw new AppError(
            `${fieldName} is not a valid calendar date`,
            400,
            "VALIDATION_ERROR"
        );
    }
    return str;
}

/**
 * Calculates existing base freight matching PostgreSQL fn_validate_and_reserve_booking:
 * GREATEST(ROUND(cbm * price_per_cbm, 2), ROUND(weight * price_per_tonne, 2), minimum_charge)
 */
function calculateBaseFreight(listing, { cbm, weight }) {
    if (!listing || typeof listing !== "object") {
        throw new AppError("Listing pricing data is required", 400, "VALIDATION_ERROR");
    }

    const reqCbm = parseNonNegativeInput(cbm, "cbm");
    const reqWeight = parseNonNegativeInput(weight, "weight");

    const pricePerCbm = parseNonNegativeInput(listing.price_per_cbm ?? 0, "price_per_cbm");
    const pricePerTonne = parseNonNegativeInput(listing.price_per_tonne ?? 0, "price_per_tonne");
    const minimumCharge = parseNonNegativeInput(listing.minimum_charge ?? 0, "minimum_charge");

    const chargeByCbm = round2(reqCbm * pricePerCbm);
    const chargeByWeight = round2(reqWeight * pricePerTonne);
    const baseFreight = round2(Math.max(chargeByCbm, chargeByWeight, minimumCharge));

    let governingBasis = "minimum_charge";
    if (baseFreight === chargeByCbm && chargeByCbm >= chargeByWeight && chargeByCbm >= minimumCharge && reqCbm > 0) {
        governingBasis = "per_cbm";
    } else if (baseFreight === chargeByWeight && chargeByWeight > chargeByCbm && chargeByWeight >= minimumCharge && reqWeight > 0) {
        governingBasis = "per_tonne";
    }

    return {
        requested_cbm: round2(reqCbm),
        requested_weight: round2(reqWeight),
        price_per_cbm: round2(pricePerCbm),
        price_per_tonne: round2(pricePerTonne),
        minimum_charge: round2(minimumCharge),
        charge_by_cbm: chargeByCbm,
        charge_by_weight: chargeByWeight,
        base_freight: baseFreight,
        governing_basis: governingBasis,
    };
}

/**
 * Computes rounded CBM, weight-equivalent CBM, and billable CBM according to listing_pricing_rule.
 */
function calculateBillableQuantities({ cbm, weight, pricingRule = null }) {
    const reqCbm = parseNonNegativeInput(cbm, "cbm");
    const reqWeight = parseNonNegativeInput(weight, "weight");

    const hasCustomRule = Boolean(pricingRule && typeof pricingRule === "object");
    const roundingDecimals = hasCustomRule && pricingRule.cbm_rounding_decimal !== undefined
        ? Number(pricingRule.cbm_rounding_decimal)
        : DEFAULT_PRICING_RULE.cbm_rounding_decimal;

    const minBillableCbm = hasCustomRule && pricingRule.min_billable_cbm !== undefined
        ? Number(pricingRule.min_billable_cbm)
        : 0;

    const weightVolumeRatio = hasCustomRule && Number(pricingRule.weight_volume_ratio) > 0
        ? Number(pricingRule.weight_volume_ratio)
        : DEFAULT_PRICING_RULE.weight_volume_ratio;

    const roundedCbm = roundToDecimals(reqCbm, roundingDecimals);
    const weightKg = reqWeight * 1000;
    const weightEquivalentCbm = roundToDecimals(weightKg / weightVolumeRatio, roundingDecimals);

    // Billable CBM applies min_billable_cbm floor when configured on the listing pricing rule
    const billableCbm = roundToDecimals(
        Math.max(roundedCbm, hasCustomRule ? minBillableCbm : 0),
        roundingDecimals
    );
    const revenueTonCbm = roundToDecimals(
        Math.max(roundedCbm, weightEquivalentCbm, hasCustomRule ? minBillableCbm : 0),
        roundingDecimals
    );

    return {
        requested_cbm: round2(reqCbm),
        requested_weight: round2(reqWeight),
        cbm_rounding_decimal: roundingDecimals,
        rounded_cbm: roundedCbm,
        weight_volume_ratio: round2(weightVolumeRatio),
        weight_equivalent_cbm: weightEquivalentCbm,
        min_billable_cbm: round2(hasCustomRule ? minBillableCbm : DEFAULT_PRICING_RULE.min_billable_cbm),
        billable_cbm: billableCbm,
        revenue_ton_cbm: revenueTonCbm,
    };
}

/**
 * Evaluates a single configured charge line item.
 */
function evaluateChargeItem(
    item,
    {
        billableCbm,
        referenceOceanFreight,
        excessStorageDays = 0,
        defaultCurrency = "USD",
    }
) {
    const stage = String(item.stage || "origin").toLowerCase();
    const treatment = String(item.treatment || "charged").toLowerCase();
    const basis = String(item.basis || "per_cbm").toLowerCase();
    const certainty = String(item.certainty || "fixed").toLowerCase();
    const payer = String(item.payer || "shipper").toLowerCase();
    const paymentTiming = String(item.payment_timing || (payer === "consignee" ? "collect" : "prepaid")).toLowerCase();
    const currency = String(item.currency || defaultCurrency).toUpperCase();
    const rate = round2(Number(item.rate || 0));
    const minAmount = item.min_amount !== null && item.min_amount !== undefined ? round2(Number(item.min_amount)) : null;
    const maxAmount = item.max_amount !== null && item.max_amount !== undefined ? round2(Number(item.max_amount)) : null;

    let chargeableQuantity = 0;
    let rawAmount = 0;
    let calculatedAmount = 0;
    let minEstimatedAmount = 0;
    let maxEstimatedAmount = 0;
    let isConditional = false;
    let isAtCost = false;
    let calculationNote = "";

    if (treatment === "included") {
        chargeableQuantity = basis === "per_cbm" ? billableCbm : 1;
        calculatedAmount = 0;
        minEstimatedAmount = 0;
        maxEstimatedAmount = 0;
        calculationNote = "Included in freight rate at no extra charge";
    } else if (treatment === "not_charged") {
        chargeableQuantity = 0;
        calculatedAmount = 0;
        minEstimatedAmount = 0;
        maxEstimatedAmount = 0;
        calculationNote = "Not charged / optional service not selected";
    } else if (treatment === "excluded") {
        chargeableQuantity = 0;
        calculatedAmount = 0;
        minEstimatedAmount = 0;
        maxEstimatedAmount = 0;
        isAtCost = basis === "at_cost";
        calculationNote = "Excluded from quote total — payable separately at destination/occurrence";
    } else if (treatment === "charged") {
        if (basis === "per_cbm") {
            chargeableQuantity = round2(billableCbm);
            rawAmount = chargeableQuantity * rate;
            calculationNote = `${chargeableQuantity.toFixed(2)} CBM × ${rate.toFixed(2)} ${currency}/CBM`;
        } else if (basis === "per_shipment") {
            chargeableQuantity = 1;
            rawAmount = rate;
            calculationNote = `Fixed ${rate.toFixed(2)} ${currency} per shipment`;
        } else if (basis === "percent_ocean_freight") {
            chargeableQuantity = round2(referenceOceanFreight);
            rawAmount = (rate / 100) * referenceOceanFreight;
            calculationNote = `${rate.toFixed(2)}% of ${referenceOceanFreight.toFixed(2)} ${currency} ocean freight`;
        } else if (basis === "per_cbm_per_day") {
            const days = Math.max(0, Number(excessStorageDays) || 0);
            isConditional = days === 0;
            if (days > 0) {
                chargeableQuantity = round2(billableCbm * days);
                rawAmount = billableCbm * days * rate;
                calculationNote = `${billableCbm.toFixed(2)} CBM × ${days} day(s) × ${rate.toFixed(2)} ${currency}/CBM/day`;
            } else {
                chargeableQuantity = round2(billableCbm);
                rawAmount = 0;
                calculationNote = `Conditional rate: ${rate.toFixed(2)} ${currency}/CBM/day beyond free storage period`;
            }
        } else if (basis === "at_cost") {
            isAtCost = true;
            chargeableQuantity = 1;
            rawAmount = 0;
            calculationNote = "Billed at actual pass-through cost upon occurrence";
        }

        let clampedAmount = rawAmount;
        if (!isConditional && !isAtCost) {
            if (minAmount !== null && clampedAmount < minAmount) {
                clampedAmount = minAmount;
                calculationNote += ` (min ${minAmount.toFixed(2)} ${currency} applied)`;
            }
            if (maxAmount !== null && clampedAmount > maxAmount) {
                clampedAmount = maxAmount;
                calculationNote += ` (max ${maxAmount.toFixed(2)} ${currency} cap applied)`;
            }
        }

        calculatedAmount = round2(clampedAmount);
        minEstimatedAmount = minAmount !== null && (certainty === "variable" || certainty === "estimate")
            ? round2(Math.min(calculatedAmount, minAmount))
            : calculatedAmount;
        maxEstimatedAmount = maxAmount !== null && (certainty === "variable" || certainty === "estimate")
            ? round2(Math.max(calculatedAmount, maxAmount))
            : calculatedAmount;
    }

    return {
        id: item.id !== undefined && item.id !== null ? Number(item.id) : null,
        charge_type_id: item.charge_type_id !== undefined && item.charge_type_id !== null ? Number(item.charge_type_id) : null,
        charge_type_code: item.charge_type_code || null,
        charge_name: item.charge_name,
        stage,
        treatment,
        basis,
        rate,
        min_amount: minAmount,
        max_amount: maxAmount,
        currency,
        certainty,
        payer,
        payee: item.payee || null,
        payment_timing: paymentTiming,
        explanatory_note: item.explanatory_note || null,
        valid_from: item.valid_from || null,
        valid_to: item.valid_to || null,
        chargeable_quantity: round2(chargeableQuantity),
        calculated_amount: calculatedAmount,
        min_estimated_amount: minEstimatedAmount,
        max_estimated_amount: maxEstimatedAmount,
        is_included: treatment === "included",
        is_excluded: treatment === "excluded",
        is_not_charged: treatment === "not_charged",
        is_estimate: certainty === "estimate",
        is_variable: certainty === "variable",
        is_conditional: isConditional,
        is_at_cost: isAtCost,
        calculation_note: calculationNote,
        source: item.source || "listing_charge_item",
    };
}

/**
 * Pure pricing engine calculation for a listing quote.
 */
function calculateQuote({
    listing,
    pricingRule = null,
    chargeItems = [],
    cbm,
    weight,
    excessStorageDays = 0,
    asOfDate = null,
}) {
    const baseCalc = calculateBaseFreight(listing, { cbm, weight });
    const quantities = calculateBillableQuantities({ cbm, weight, pricingRule });

    const currency = pricingRule?.currency
        ? String(pricingRule.currency).toUpperCase()
        : (chargeItems[0]?.currency ? String(chargeItems[0].currency).toUpperCase() : "USD");

    const warnings = [];

    if (baseCalc.requested_cbm === 0 || baseCalc.requested_weight === 0) {
        warnings.push(
            "Zero CBM or weight supplied for quote estimation: actual booking creation requires both booked_cbm > 0 and booked_weight > 0."
        );
    }

    const refDateStr = asOfDate
        ? parseOptionalDateString(asOfDate, "as_of_date")
        : new Date().toISOString().slice(0, 10);

    if (pricingRule?.price_validity_date) {
        const validityStr = String(pricingRule.price_validity_date).slice(0, 10);
        if (validityStr < refDateStr) {
            warnings.push(
                `Listing price validity date (${validityStr}) has passed as of ${refDateStr}.`
            );
        }
    }

    if (pricingRule?.surcharge_change_policy) {
        warnings.push(`Surcharge policy: ${pricingRule.surcharge_change_policy}`);
    }

    const itemsArray = Array.isArray(chargeItems) ? chargeItems : [];
    const isLegacyListing = itemsArray.length === 0;

    if (isLegacyListing) {
        warnings.push(
            "Legacy listing: no itemised origin, ocean, or destination charges are configured. Showing base freight only."
        );

        const baseLine = {
            id: null,
            charge_type_id: 1,
            charge_type_code: "ocean_freight",
            charge_name: "Base Ocean Freight",
            stage: "ocean",
            treatment: "charged",
            basis: baseCalc.governing_basis === "per_tonne" ? "per_tonne" : (baseCalc.governing_basis === "minimum_charge" ? "minimum_charge" : "per_cbm"),
            rate: baseCalc.governing_basis === "per_tonne" ? baseCalc.price_per_tonne : (baseCalc.governing_basis === "minimum_charge" ? baseCalc.minimum_charge : baseCalc.price_per_cbm),
            min_amount: baseCalc.minimum_charge,
            max_amount: null,
            currency,
            certainty: "fixed",
            payer: "shipper",
            payee: "carrier",
            payment_timing: "prepaid",
            explanatory_note: "Calculated from capacity_listing base rates (GREATEST of CBM charge, weight charge, and minimum charge)",
            valid_from: null,
            valid_to: null,
            chargeable_quantity: baseCalc.governing_basis === "per_tonne" ? baseCalc.requested_weight : (baseCalc.governing_basis === "minimum_charge" ? 1 : baseCalc.requested_cbm),
            calculated_amount: baseCalc.base_freight,
            min_estimated_amount: baseCalc.base_freight,
            max_estimated_amount: baseCalc.base_freight,
            is_included: false,
            is_excluded: false,
            is_not_charged: false,
            is_estimate: false,
            is_variable: false,
            is_conditional: false,
            is_at_cost: false,
            calculation_note: `GREATEST(${baseCalc.requested_cbm.toFixed(2)} CBM × ${baseCalc.price_per_cbm.toFixed(2)}, ${baseCalc.requested_weight.toFixed(2)} T × ${baseCalc.price_per_tonne.toFixed(2)}, min ${baseCalc.minimum_charge.toFixed(2)})`,
            source: "capacity_listing_legacy",
        };

        return {
            listing_id: listing.id ?? listing.listing_id ?? null,
            currency,
            is_legacy_listing: true,
            has_itemised_pricing: false,
            base_freight: baseCalc.base_freight,
            base_freight_details: baseCalc,
            pricing_rule: pricingRule || null,
            quantities,
            charge_lines: [baseLine],
            shipper_charges: [baseLine],
            consignee_charges: [],
            included_charges: [],
            excluded_charges: [],
            not_charged_items: [],
            totals: {
                base_freight: baseCalc.base_freight,
                estimated_shipper_prepaid_total: baseCalc.base_freight,
                estimated_consignee_payable_total: 0,
                estimated_all_in_total: baseCalc.base_freight,
                fixed_charges_total: baseCalc.base_freight,
                estimated_charges_total: 0,
                variable_charges_total: 0,
                by_stage: {
                    origin: 0,
                    ocean: baseCalc.base_freight,
                    destination: 0,
                },
                by_payment_timing: {
                    prepaid: baseCalc.base_freight,
                    collect: 0,
                    upon_delivery: 0,
                    at_terminal: 0,
                },
                estimated_all_in_range: {
                    min: baseCalc.base_freight,
                    max: baseCalc.base_freight,
                },
            },
            warnings,
        };
    }

    // Filter out items whose validity window does not include refDateStr (while recording a warning)
    const activeItems = [];
    for (const item of itemsArray) {
        const vFrom = item.valid_from ? String(item.valid_from).slice(0, 10) : null;
        const vTo = item.valid_to ? String(item.valid_to).slice(0, 10) : null;
        if ((vFrom && refDateStr < vFrom) || (vTo && refDateStr > vTo)) {
            warnings.push(
                `Charge "${item.charge_name}" is outside its validity window (${vFrom || "*"} to ${vTo || "*"}) for date ${refDateStr} and was omitted.`
            );
            continue;
        }
        activeItems.push(item);
    }

    // Determine whether an explicit ocean_freight line item is already configured
    const hasExplicitOceanFreightItem = activeItems.some(
        (it) =>
            it.charge_type_code === "ocean_freight" ||
            Number(it.charge_type_id) === 1 ||
            (String(it.stage).toLowerCase() === "ocean" &&
                /ocean\s*freight/i.test(String(it.charge_name || "")))
    );

    // Pass 1: Evaluate non-percent items first so percent_ocean_freight can reference the ocean freight amount
    let referenceOceanFreight = baseCalc.base_freight;
    const evaluatedLines = [];

    if (!hasExplicitOceanFreightItem) {
        const synthBasis =
            baseCalc.governing_basis === "minimum_charge" ? "per_shipment" : "per_cbm";
        const synthRate =
            baseCalc.governing_basis === "per_tonne"
                ? baseCalc.price_per_tonne
                : baseCalc.governing_basis === "minimum_charge"
                ? baseCalc.minimum_charge
                : baseCalc.price_per_cbm;
        const synthQuantity =
            baseCalc.governing_basis === "per_tonne"
                ? baseCalc.requested_weight
                : baseCalc.governing_basis === "minimum_charge"
                ? 1
                : baseCalc.requested_cbm;

        // Synthesize the baseline ocean freight line from capacity_listing so base_freight is included
        evaluatedLines.push({
            id: null,
            charge_type_id: 1,
            charge_type_code: "ocean_freight",
            charge_name: "Base Ocean Freight",
            stage: "ocean",
            treatment: "charged",
            basis: synthBasis,
            rate: synthRate,
            min_amount: baseCalc.minimum_charge,
            max_amount: null,
            currency,
            certainty: "fixed",
            payer: "shipper",
            payee: "carrier",
            payment_timing: "prepaid",
            explanatory_note: "Base ocean freight from capacity listing",
            valid_from: null,
            valid_to: null,
            chargeable_quantity: synthQuantity,
            calculated_amount: baseCalc.base_freight,
            min_estimated_amount: baseCalc.base_freight,
            max_estimated_amount: baseCalc.base_freight,
            is_included: false,
            is_excluded: false,
            is_not_charged: false,
            is_estimate: false,
            is_variable: false,
            is_conditional: false,
            is_at_cost: false,
            calculation_note: `GREATEST(${baseCalc.requested_cbm.toFixed(2)} CBM × ${baseCalc.price_per_cbm.toFixed(2)}, ${baseCalc.requested_weight.toFixed(2)} T × ${baseCalc.price_per_tonne.toFixed(2)}, min ${baseCalc.minimum_charge.toFixed(2)})`,
            source: "capacity_listing_base",
        });
    } else {

        // Find the explicit ocean_freight item and evaluate it first to get referenceOceanFreight
        const oceanItem = activeItems.find(
            (it) =>
                it.charge_type_code === "ocean_freight" ||
                Number(it.charge_type_id) === 1 ||
                (String(it.stage).toLowerCase() === "ocean" &&
                    /ocean\s*freight/i.test(String(it.charge_name || "")))
        );
        if (oceanItem) {
            const evalOcean = evaluateChargeItem(oceanItem, {
                billableCbm: quantities.billable_cbm,
                referenceOceanFreight: baseCalc.base_freight,
                excessStorageDays,
                defaultCurrency: currency,
            });
            if (evalOcean.treatment === "charged") {
                referenceOceanFreight = evalOcean.calculated_amount;
            }
        }
    }

    for (const item of activeItems) {
        const line = evaluateChargeItem(item, {
            billableCbm: quantities.billable_cbm,
            referenceOceanFreight,
            excessStorageDays,
            defaultCurrency: currency,
        });
        evaluatedLines.push(line);

        if (line.is_excluded) {
            warnings.push(
                `Excluded charge: "${line.charge_name}" (${line.stage}) is excluded from this quote and payable separately by ${line.payer}.`
            );
        } else if (line.is_at_cost && line.treatment === "charged") {
            warnings.push(
                `At-cost charge: "${line.charge_name}" (${line.stage}) is billed at actual cost upon occurrence and is not included in the fixed numeric total.`
            );
        } else if (line.is_conditional && line.treatment === "charged") {
            const freeDays = pricingRule?.free_storage_days ?? DEFAULT_PRICING_RULE.free_storage_days;
            warnings.push(
                `Conditional charge: "${line.charge_name}" applies at ${line.rate.toFixed(2)} ${line.currency}/CBM/day only if cargo exceeds ${freeDays} free storage day(s).`
            );
        } else if (line.is_variable && line.treatment === "charged") {
            warnings.push(
                `Variable charge: "${line.charge_name}" (${line.calculated_amount.toFixed(2)} ${line.currency}) is variable and may fluctuate prior to final settlement.`
            );
        } else if (line.is_estimate && line.treatment === "charged") {
            warnings.push(
                `Estimated charge: "${line.charge_name}" (${line.calculated_amount.toFixed(2)} ${line.currency}) is an estimate.`
            );
        }
    }

    const hasDestinationLines = evaluatedLines.some((l) => l.stage === "destination");
    if (!hasDestinationLines) {
        warnings.push(
            "No destination charges are configured on this listing; local destination terminal/CFS fees may still apply upon arrival."
        );
    }

    const chargedLines = evaluatedLines.filter((l) => l.treatment === "charged");
    const shipperCharges = chargedLines.filter((l) => l.payer === "shipper");
    const consigneeCharges = chargedLines.filter((l) => l.payer === "consignee");
    const includedCharges = evaluatedLines.filter((l) => l.treatment === "included");
    const excludedCharges = evaluatedLines.filter((l) => l.treatment === "excluded");
    const notChargedItems = evaluatedLines.filter((l) => l.treatment === "not_charged");

    const sumAmounts = (arr, field = "calculated_amount") =>
        round2(arr.reduce((acc, item) => acc + Number(item[field] || 0), 0));

    const shipperTotal = sumAmounts(shipperCharges);
    const consigneeTotal = sumAmounts(consigneeCharges);
    const allInTotal = round2(shipperTotal + consigneeTotal);

    const fixedTotal = sumAmounts(chargedLines.filter((l) => l.certainty === "fixed"));
    const estimatedTotal = sumAmounts(chargedLines.filter((l) => l.certainty === "estimate"));
    const variableTotal = sumAmounts(chargedLines.filter((l) => l.certainty === "variable"));

    const originTotal = sumAmounts(chargedLines.filter((l) => l.stage === "origin"));
    const oceanTotal = sumAmounts(chargedLines.filter((l) => l.stage === "ocean"));
    const destinationTotal = sumAmounts(chargedLines.filter((l) => l.stage === "destination"));

    const prepaidTotal = sumAmounts(chargedLines.filter((l) => l.payment_timing === "prepaid"));
    const collectTotal = sumAmounts(chargedLines.filter((l) => l.payment_timing === "collect"));
    const uponDeliveryTotal = sumAmounts(chargedLines.filter((l) => l.payment_timing === "upon_delivery"));
    const atTerminalTotal = sumAmounts(chargedLines.filter((l) => l.payment_timing === "at_terminal"));

    const minAllIn = sumAmounts(chargedLines, "min_estimated_amount");
    const maxAllIn = sumAmounts(chargedLines, "max_estimated_amount");

    return {
        listing_id: listing.id ?? listing.listing_id ?? null,
        currency,
        is_legacy_listing: false,
        has_itemised_pricing: true,
        base_freight: baseCalc.base_freight,
        base_freight_details: baseCalc,
        pricing_rule: pricingRule || null,
        quantities,
        charge_lines: evaluatedLines,
        shipper_charges: shipperCharges,
        consignee_charges: consigneeCharges,
        included_charges: includedCharges,
        excluded_charges: excludedCharges,
        not_charged_items: notChargedItems,
        totals: {
            base_freight: baseCalc.base_freight,
            estimated_shipper_prepaid_total: shipperTotal,
            estimated_consignee_payable_total: consigneeTotal,
            estimated_all_in_total: allInTotal,
            fixed_charges_total: fixedTotal,
            estimated_charges_total: estimatedTotal,
            variable_charges_total: variableTotal,
            by_stage: {
                origin: originTotal,
                ocean: oceanTotal,
                destination: destinationTotal,
            },
            by_payment_timing: {
                prepaid: prepaidTotal,
                collect: collectTotal,
                upon_delivery: uponDeliveryTotal,
                at_terminal: atTerminalTotal,
            },
            estimated_all_in_range: {
                min: minAllIn,
                max: maxAllIn,
            },
        },
        warnings,
    };
}

/**
 * Converts a calculated quote into immutable row payloads ready for INSERT into booking_charge_snapshot.
 * Note: For legacy listings (is_legacy_listing = true), returns [] so historical/legacy bookings
 * remain identifiable via 0 snapshot rows.
 */
function buildSnapshotRowsFromQuote(quote, { bookingId, listingId }) {
    if (!quote || quote.is_legacy_listing) {
        return [];
    }
    return (quote.charge_lines || [])
        .filter((line) => VALID_BASES.includes(line.basis))
        .map((line) => ({
            booking_id: Number(bookingId),
            listing_id: Number(listingId ?? quote.listing_id),
            charge_type_code: line.charge_type_code || null,
            charge_name: line.charge_name,
            stage: line.stage,
            treatment: line.treatment,
            basis: line.basis,
            rate: round2(line.rate),
            chargeable_quantity: round2(line.chargeable_quantity),
            calculated_amount: round2(line.calculated_amount),
            currency: line.currency || quote.currency || "USD",
            certainty: line.certainty || "fixed",
            payer: line.payer || "shipper",
            payee: line.payee || null,
            payment_timing: line.payment_timing || "prepaid",
            explanatory_note: line.explanatory_note || line.calculation_note || null,
        }));
}

/**
 * Validates and normalizes pricing_rule input payload.
 */
function validatePricingRuleInput(rawRule, fallbackCurrency = "USD") {
    if (!rawRule || typeof rawRule !== "object") {
        return null;
    }

    const min_billable_cbm =
        rawRule.min_billable_cbm !== undefined && rawRule.min_billable_cbm !== null
            ? round2(parseNonNegativeInput(rawRule.min_billable_cbm, "pricing_rule.min_billable_cbm"))
            : DEFAULT_PRICING_RULE.min_billable_cbm;

    if (min_billable_cbm > 9999.99) {
        throw new AppError(
            "pricing_rule.min_billable_cbm cannot exceed 9999.99",
            400,
            "VALIDATION_ERROR"
        );
    }

    const weight_volume_ratio =
        rawRule.weight_volume_ratio !== undefined && rawRule.weight_volume_ratio !== null
            ? round2(parseNonNegativeInput(rawRule.weight_volume_ratio, "pricing_rule.weight_volume_ratio"))
            : DEFAULT_PRICING_RULE.weight_volume_ratio;

    if (weight_volume_ratio <= 0 || weight_volume_ratio > 9999.99) {
        throw new AppError(
            "pricing_rule.weight_volume_ratio must be greater than 0 and at most 9999.99",
            400,
            "VALIDATION_ERROR"
        );
    }

    let cbm_rounding_decimal = DEFAULT_PRICING_RULE.cbm_rounding_decimal;
    if (rawRule.cbm_rounding_decimal !== undefined && rawRule.cbm_rounding_decimal !== null) {
        const dec = Number(rawRule.cbm_rounding_decimal);
        if (!Number.isInteger(dec) || dec < 0 || dec > 4) {
            throw new AppError(
                "pricing_rule.cbm_rounding_decimal must be an integer between 0 and 4",
                400,
                "VALIDATION_ERROR"
            );
        }
        cbm_rounding_decimal = dec;
    }

    let free_storage_days = DEFAULT_PRICING_RULE.free_storage_days;
    if (rawRule.free_storage_days !== undefined && rawRule.free_storage_days !== null) {
        const days = Number(rawRule.free_storage_days);
        if (!Number.isInteger(days) || days < 0) {
            throw new AppError(
                "pricing_rule.free_storage_days must be a non-negative integer",
                400,
                "VALIDATION_ERROR"
            );
        }
        free_storage_days = days;
    }

    const storage_rate_per_cbm_day =
        rawRule.storage_rate_per_cbm_day !== undefined && rawRule.storage_rate_per_cbm_day !== null
            ? round2(
                  parseNonNegativeInput(
                      rawRule.storage_rate_per_cbm_day,
                      "pricing_rule.storage_rate_per_cbm_day"
                  )
              )
            : DEFAULT_PRICING_RULE.storage_rate_per_cbm_day;

    const currency = parseCurrencyCode(
        rawRule.currency,
        "pricing_rule.currency",
        fallbackCurrency
    );

    const price_validity_date = parseOptionalDateString(
        rawRule.price_validity_date,
        "pricing_rule.price_validity_date"
    );

    const surcharge_change_policy =
        rawRule.surcharge_change_policy !== undefined &&
        rawRule.surcharge_change_policy !== null &&
        String(rawRule.surcharge_change_policy).trim() !== ""
            ? String(rawRule.surcharge_change_policy).trim()
            : null;

    return {
        min_billable_cbm,
        weight_volume_ratio,
        cbm_rounding_decimal,
        free_storage_days,
        storage_rate_per_cbm_day,
        currency,
        price_validity_date,
        surcharge_change_policy,
    };
}

/**
 * Validates and normalizes an array of charge_items against database enum constraints and catalogue.
 */
function validateChargeItemsInput(rawItems, { catalogById = new Map(), catalogByCode = new Map(), expectedCurrency = null } = {}) {
    if (!Array.isArray(rawItems)) {
        throw new AppError("charge_items must be an array", 400, "VALIDATION_ERROR");
    }

    let listingCurrency = expectedCurrency;
    const normalized = [];

    for (let i = 0; i < rawItems.length; i += 1) {
        const raw = rawItems[i];
        const prefix = `charge_items[${i}]`;

        if (!raw || typeof raw !== "object") {
            throw new AppError(`${prefix} must be an object`, 400, "VALIDATION_ERROR");
        }

        let catalogEntry = null;
        let charge_type_id = null;

        if (raw.charge_type_id !== undefined && raw.charge_type_id !== null && raw.charge_type_id !== "") {
            const idNum = Number(raw.charge_type_id);
            if (!Number.isInteger(idNum) || idNum <= 0) {
                throw new AppError(`${prefix}.charge_type_id must be a positive integer`, 400, "VALIDATION_ERROR");
            }
            catalogEntry = catalogById.get(idNum) || null;
            if (catalogById.size > 0 && !catalogEntry) {
                throw new AppError(
                    `${prefix}.charge_type_id (${idNum}) does not exist in standard_charge_type catalogue`,
                    400,
                    "INVALID_CHARGE_TYPE"
                );
            }
            charge_type_id = idNum;
        } else if (raw.charge_type_code) {
            const codeStr = String(raw.charge_type_code).trim().toLowerCase();
            catalogEntry = catalogByCode.get(codeStr) || null;
            if (catalogByCode.size > 0 && !catalogEntry) {
                throw new AppError(
                    `${prefix}.charge_type_code ("${codeStr}") does not exist in standard_charge_type catalogue`,
                    400,
                    "INVALID_CHARGE_TYPE"
                );
            }
            if (catalogEntry) {
                charge_type_id = Number(catalogEntry.id);
            }
        }

        const rawName = raw.charge_name ?? catalogEntry?.name;
        if (!rawName || String(rawName).trim() === "") {
            throw new AppError(`${prefix}.charge_name is required`, 400, "VALIDATION_ERROR");
        }
        const charge_name = String(rawName).trim();
        if (charge_name.length > 150) {
            throw new AppError(`${prefix}.charge_name cannot exceed 150 characters`, 400, "VALIDATION_ERROR");
        }

        const rawStage = raw.stage ?? catalogEntry?.stage;
        if (!rawStage) {
            throw new AppError(`${prefix}.stage is required`, 400, "VALIDATION_ERROR");
        }
        const stage = String(rawStage).trim().toLowerCase();
        if (!VALID_STAGES.includes(stage)) {
            throw new AppError(
                `${prefix}.stage must be one of: ${VALID_STAGES.join(", ")}`,
                400,
                "VALIDATION_ERROR"
            );
        }

        const rawTreatment = raw.treatment ?? catalogEntry?.default_treatment ?? "charged";
        const treatment = String(rawTreatment).trim().toLowerCase();
        if (!VALID_TREATMENTS.includes(treatment)) {
            throw new AppError(
                `${prefix}.treatment must be one of: ${VALID_TREATMENTS.join(", ")}`,
                400,
                "VALIDATION_ERROR"
            );
        }

        const rawBasis = raw.basis ?? catalogEntry?.default_basis ?? "per_cbm";
        const basis = String(rawBasis).trim().toLowerCase();
        if (!VALID_BASES.includes(basis)) {
            throw new AppError(
                `${prefix}.basis must be one of: ${VALID_BASES.join(", ")}`,
                400,
                "VALIDATION_ERROR"
            );
        }

        const rate =
            raw.rate !== undefined && raw.rate !== null && raw.rate !== ""
                ? round2(parseNonNegativeInput(raw.rate, `${prefix}.rate`))
                : 0.0;

        const min_amount = parseOptionalNonNegativeInput(raw.min_amount, `${prefix}.min_amount`);
        const max_amount = parseOptionalNonNegativeInput(raw.max_amount, `${prefix}.max_amount`);

        if (min_amount !== null && max_amount !== null && max_amount < min_amount) {
            throw new AppError(
                `${prefix}.max_amount (${max_amount}) must be greater than or equal to min_amount (${min_amount})`,
                400,
                "VALIDATION_ERROR"
            );
        }

        const currency = parseCurrencyCode(
            raw.currency,
            `${prefix}.currency`,
            listingCurrency || "USD"
        );
        if (!listingCurrency) {
            listingCurrency = currency;
        } else if (currency !== listingCurrency) {
            throw new AppError(
                `Currency mismatch in ${prefix}: "${currency}" conflicts with listing currency "${listingCurrency}". All charges on a listing must share one currency.`,
                400,
                "CURRENCY_MISMATCH"
            );
        }

        const rawCertainty = raw.certainty ?? "fixed";
        const certainty = String(rawCertainty).trim().toLowerCase();
        if (!VALID_CERTAINTIES.includes(certainty)) {
            throw new AppError(
                `${prefix}.certainty must be one of: ${VALID_CERTAINTIES.join(", ")}`,
                400,
                "VALIDATION_ERROR"
            );
        }

        const rawPayer = raw.payer ?? catalogEntry?.default_payer ?? "shipper";
        const payer = String(rawPayer).trim().toLowerCase();
        if (!VALID_PAYERS.includes(payer)) {
            throw new AppError(
                `${prefix}.payer must be one of: ${VALID_PAYERS.join(", ")}`,
                400,
                "VALIDATION_ERROR"
            );
        }

        const rawTiming =
            raw.payment_timing ??
            catalogEntry?.default_payment_timing ??
            (payer === "consignee" ? "collect" : "prepaid");
        const payment_timing = String(rawTiming).trim().toLowerCase();
        if (!VALID_PAYMENT_TIMINGS.includes(payment_timing)) {
            throw new AppError(
                `${prefix}.payment_timing must be one of: ${VALID_PAYMENT_TIMINGS.join(", ")}`,
                400,
                "VALIDATION_ERROR"
            );
        }

        const payee =
            raw.payee !== undefined && raw.payee !== null && String(raw.payee).trim() !== ""
                ? String(raw.payee).trim().slice(0, 100)
                : null;

        const explanatory_note =
            raw.explanatory_note !== undefined &&
            raw.explanatory_note !== null &&
            String(raw.explanatory_note).trim() !== ""
                ? String(raw.explanatory_note).trim()
                : null;

        const valid_from = parseOptionalDateString(raw.valid_from, `${prefix}.valid_from`);
        const valid_to = parseOptionalDateString(raw.valid_to, `${prefix}.valid_to`);

        if (valid_from && valid_to && valid_to < valid_from) {
            throw new AppError(
                `${prefix}.valid_to (${valid_to}) must be on or after valid_from (${valid_from})`,
                400,
                "VALIDATION_ERROR"
            );
        }

        normalized.push({
            charge_type_id,
            charge_name,
            stage,
            treatment,
            basis,
            rate,
            min_amount,
            max_amount,
            currency,
            certainty,
            payer,
            payee,
            payment_timing,
            explanatory_note,
            valid_from,
            valid_to,
        });
    }

    return normalized;
}

/**
 * Retrieves the standard_charge_type catalogue from PostgreSQL.
 */
async function getStandardChargeTypes({ stage = null } = {}, clientOrPool = pool) {
    const params = [];
    let whereSql = "";

    if (stage) {
        const cleanStage = String(stage).trim().toLowerCase();
        if (!VALID_STAGES.includes(cleanStage)) {
            throw new AppError(
                `Invalid stage "${stage}". Allowed values: ${VALID_STAGES.join(", ")}`,
                400,
                "VALIDATION_ERROR"
            );
        }
        params.push(cleanStage);
        whereSql = `WHERE stage = $1`;
    }

    const { rows } = await clientOrPool.query(
        `SELECT
            id,
            code,
            name,
            stage,
            default_basis,
            default_treatment,
            default_payer,
            default_payment_timing,
            is_mandatory,
            display_order,
            description,
            created_at
         FROM standard_charge_type
         ${whereSql}
         ORDER BY display_order ASC, id ASC`,
        params
    );
    return rows;
}

/**
 * Retrieves a listing's base pricing, configured pricing rule, and itemised charge items.
 */
async function getListingPricing(listingId, clientOrPool = pool) {
    const listRes = await clientOrPool.query(
        `SELECT
            l.id AS listing_id,
            l.provider_id,
            p.company_name AS provider_name,
            l.route_id,
            orig.un_locode AS origin_un_locode,
            orig.name AS origin_port,
            dest.un_locode AS destination_un_locode,
            dest.name AS destination_port,
            l.cutoff_date,
            l.departure_date,
            l.arrival_date,
            l.total_cbm,
            l.available_cbm,
            l.total_weight,
            l.available_weight,
            l.price_per_cbm,
            l.price_per_tonne,
            l.minimum_charge,
            l.status AS listing_status
         FROM capacity_listing l
         JOIN provider p ON l.provider_id = p.id
         JOIN route r ON l.route_id = r.id
         JOIN port orig ON r.origin_port_id = orig.id
         JOIN port dest ON r.destination_port_id = dest.id
         WHERE l.id = $1`,
        [listingId]
    );

    if (listRes.rowCount === 0) {
        throw new AppError(`Listing ID ${listingId} does not exist`, 404, "LISTING_NOT_FOUND");
    }

    const listing = listRes.rows[0];

    const ruleRes = await clientOrPool.query(
        `SELECT
            listing_id,
            min_billable_cbm,
            weight_volume_ratio,
            cbm_rounding_decimal,
            free_storage_days,
            storage_rate_per_cbm_day,
            currency,
            price_validity_date,
            surcharge_change_policy,
            created_at,
            updated_at
         FROM listing_pricing_rule
         WHERE listing_id = $1`,
        [listingId]
    );

    const itemsRes = await clientOrPool.query(
        `SELECT
            lci.id,
            lci.listing_id,
            lci.charge_type_id,
            sct.code AS charge_type_code,
            sct.name AS standard_charge_name,
            sct.display_order,
            lci.charge_name,
            lci.stage,
            lci.treatment,
            lci.basis,
            lci.rate,
            lci.min_amount,
            lci.max_amount,
            lci.currency,
            lci.certainty,
            lci.payer,
            lci.payee,
            lci.payment_timing,
            lci.explanatory_note,
            lci.valid_from,
            lci.valid_to,
            lci.created_at,
            lci.updated_at
         FROM listing_charge_item lci
         LEFT JOIN standard_charge_type sct ON lci.charge_type_id = sct.id
         WHERE lci.listing_id = $1
         ORDER BY COALESCE(sct.display_order, 999) ASC, lci.id ASC`,
        [listingId]
    );

    const pricingRule = ruleRes.rows[0] || null;
    const chargeItems = itemsRes.rows;

    return {
        listing_id: Number(listing.listing_id),
        provider_id: Number(listing.provider_id),
        provider_name: listing.provider_name,
        route_id: Number(listing.route_id),
        origin_un_locode: listing.origin_un_locode,
        origin_port: listing.origin_port,
        destination_un_locode: listing.destination_un_locode,
        destination_port: listing.destination_port,
        cutoff_date: listing.cutoff_date,
        departure_date: listing.departure_date,
        arrival_date: listing.arrival_date,
        listing_status: listing.listing_status,
        base_rates: {
            price_per_cbm: Number(listing.price_per_cbm),
            price_per_tonne: Number(listing.price_per_tonne),
            minimum_charge: Number(listing.minimum_charge),
        },
        is_legacy_listing: chargeItems.length === 0,
        has_itemised_pricing: chargeItems.length > 0,
        pricing_rule: pricingRule,
        effective_pricing_rule: pricingRule || {
            listing_id: Number(listing.listing_id),
            ...DEFAULT_PRICING_RULE,
        },
        charge_items: chargeItems,
    };
}

/**
 * Creates or updates a listing's pricing_rule and/or charge_items transactionally,
 * strictly enforcing that listingId belongs to the authenticated/route providerId.
 */
async function upsertListingPricing({
    listingId,
    providerId,
    pricingRule = undefined,
    chargeItems = undefined,
}) {
    if (pricingRule === undefined && chargeItems === undefined) {
        throw new AppError(
            "At least one of pricing_rule or charge_items must be provided",
            400,
            "VALIDATION_ERROR"
        );
    }

    return pool.withTransaction(async (client) => {
        // 1. Verify provider exists
        const provRes = await client.query(
            `SELECT id FROM provider WHERE id = $1`,
            [providerId]
        );
        if (provRes.rowCount === 0) {
            throw new AppError(
                `Provider ID ${providerId} does not exist`,
                404,
                "PROVIDER_NOT_FOUND"
            );
        }

        // 2. Lock capacity_listing row and verify ownership (Rule R8)
        const listRes = await client.query(
            `SELECT id, provider_id, status FROM capacity_listing WHERE id = $1 FOR UPDATE`,
            [listingId]
        );
        if (listRes.rowCount === 0) {
            throw new AppError(
                `Listing ID ${listingId} does not exist`,
                404,
                "LISTING_NOT_FOUND"
            );
        }
        const listing = listRes.rows[0];
        if (Number(listing.provider_id) !== Number(providerId)) {
            throw new AppError(
                `Forbidden (Rule R8): Listing ID ${listingId} does not belong to Provider ID ${providerId}`,
                403,
                "FORBIDDEN_OWNERSHIP"
            );
        }

        // 3. Load existing rule currency for consistency checks if pricingRule not supplied
        const existingRuleRes = await client.query(
            `SELECT currency FROM listing_pricing_rule WHERE listing_id = $1`,
            [listingId]
        );
        const existingCurrency = existingRuleRes.rows[0]?.currency || null;

        let validatedRule = null;
        if (pricingRule !== undefined && pricingRule !== null) {
            validatedRule = validatePricingRuleInput(
                pricingRule,
                existingCurrency || "USD"
            );
        }

        // 4. Load standard_charge_type catalogue for validation
        const catalogRows = await getStandardChargeTypes({}, client);
        const catalogById = new Map();
        const catalogByCode = new Map();
        for (const row of catalogRows) {
            catalogById.set(Number(row.id), row);
            catalogByCode.set(String(row.code).toLowerCase(), row);
        }

        let validatedItems = null;
        if (chargeItems !== undefined) {
            validatedItems = validateChargeItemsInput(chargeItems, {
                catalogById,
                catalogByCode,
                expectedCurrency: validatedRule?.currency || existingCurrency || null,
            });
        }

        // 5. Upsert listing_pricing_rule if supplied
        if (validatedRule) {
            await client.query(
                `INSERT INTO listing_pricing_rule (
                    listing_id,
                    min_billable_cbm,
                    weight_volume_ratio,
                    cbm_rounding_decimal,
                    free_storage_days,
                    storage_rate_per_cbm_day,
                    currency,
                    price_validity_date,
                    surcharge_change_policy,
                    updated_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                 ON CONFLICT (listing_id) DO UPDATE SET
                    min_billable_cbm = EXCLUDED.min_billable_cbm,
                    weight_volume_ratio = EXCLUDED.weight_volume_ratio,
                    cbm_rounding_decimal = EXCLUDED.cbm_rounding_decimal,
                    free_storage_days = EXCLUDED.free_storage_days,
                    storage_rate_per_cbm_day = EXCLUDED.storage_rate_per_cbm_day,
                    currency = EXCLUDED.currency,
                    price_validity_date = EXCLUDED.price_validity_date,
                    surcharge_change_policy = EXCLUDED.surcharge_change_policy,
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    listingId,
                    validatedRule.min_billable_cbm,
                    validatedRule.weight_volume_ratio,
                    validatedRule.cbm_rounding_decimal,
                    validatedRule.free_storage_days,
                    validatedRule.storage_rate_per_cbm_day,
                    validatedRule.currency,
                    validatedRule.price_validity_date,
                    validatedRule.surcharge_change_policy,
                ]
            );
        }

        // 6. Replace listing_charge_item rows if supplied
        if (validatedItems !== null) {
            await client.query(
                `DELETE FROM listing_charge_item WHERE listing_id = $1`,
                [listingId]
            );

            for (const item of validatedItems) {
                await client.query(
                    `INSERT INTO listing_charge_item (
                        listing_id,
                        charge_type_id,
                        charge_name,
                        stage,
                        treatment,
                        basis,
                        rate,
                        min_amount,
                        max_amount,
                        currency,
                        certainty,
                        payer,
                        payee,
                        payment_timing,
                        explanatory_note,
                        valid_from,
                        valid_to
                     ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
                     )`,
                    [
                        listingId,
                        item.charge_type_id,
                        item.charge_name,
                        item.stage,
                        item.treatment,
                        item.basis,
                        item.rate,
                        item.min_amount,
                        item.max_amount,
                        item.currency,
                        item.certainty,
                        item.payer,
                        item.payee,
                        item.payment_timing,
                        item.explanatory_note,
                        item.valid_from,
                        item.valid_to,
                    ]
                );
            }
        }

        return getListingPricing(listingId, client);
    });
}

/**
 * Generates an itemised all-in quote for a listing without creating a booking or reserving capacity.
 */
async function getTraderQuote(
    { listingId, cbm, weight, excessStorageDays = 0, asOfDate = null },
    clientOrPool = pool
) {
    const reqCbm = parseNonNegativeInput(cbm, "cbm");
    const reqWeight = parseNonNegativeInput(weight, "weight");
    const reqStorageDays =
        excessStorageDays !== undefined && excessStorageDays !== null && excessStorageDays !== ""
            ? parseNonNegativeInput(excessStorageDays, "excess_storage_days")
            : 0;

    const pricingData = await getListingPricing(listingId, clientOrPool);

    const listingObj = {
        id: pricingData.listing_id,
        listing_id: pricingData.listing_id,
        price_per_cbm: pricingData.base_rates.price_per_cbm,
        price_per_tonne: pricingData.base_rates.price_per_tonne,
        minimum_charge: pricingData.base_rates.minimum_charge,
    };

    const quote = calculateQuote({
        listing: listingObj,
        pricingRule: pricingData.pricing_rule,
        chargeItems: pricingData.charge_items,
        cbm: reqCbm,
        weight: reqWeight,
        excessStorageDays: reqStorageDays,
        asOfDate,
    });

    return {
        ...quote,
        listing_summary: {
            listing_id: pricingData.listing_id,
            provider_id: pricingData.provider_id,
            provider_name: pricingData.provider_name,
            origin_un_locode: pricingData.origin_un_locode,
            origin_port: pricingData.origin_port,
            destination_un_locode: pricingData.destination_un_locode,
            destination_port: pricingData.destination_port,
            cutoff_date: pricingData.cutoff_date,
            departure_date: pricingData.departure_date,
            arrival_date: pricingData.arrival_date,
            listing_status: pricingData.listing_status,
        },
    };
}

/**
 * Inserts frozen booking_charge_snapshot rows using the active transaction client.
 */
async function insertBookingChargeSnapshots(client, snapshotRows = []) {
    if (!Array.isArray(snapshotRows) || snapshotRows.length === 0) {
        return [];
    }

    const inserted = [];
    for (const row of snapshotRows) {
        const res = await client.query(
            `INSERT INTO booking_charge_snapshot (
                booking_id,
                listing_id,
                charge_type_code,
                charge_name,
                stage,
                treatment,
                basis,
                rate,
                chargeable_quantity,
                calculated_amount,
                currency,
                certainty,
                payer,
                payee,
                payment_timing,
                explanatory_note
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
             ) RETURNING *`,
            [
                row.booking_id,
                row.listing_id,
                row.charge_type_code,
                row.charge_name,
                row.stage,
                row.treatment,
                row.basis,
                row.rate,
                row.chargeable_quantity,
                row.calculated_amount,
                row.currency,
                row.certainty,
                row.payer,
                row.payee,
                row.payment_timing,
                row.explanatory_note,
            ]
        );
        inserted.push(res.rows[0]);
    }
    return inserted;
}

/**
 * Computes the listing quote and inserts immutable booking_charge_snapshot rows
 * inside the caller's existing booking transaction client.
 * For legacy listings (no configured charge items), inserts 0 snapshot rows.
 */
async function createBookingChargeSnapshots(
    client,
    { bookingId, listingId, bookedCbm, bookedWeight, transformSnapshots = null }
) {
    const quote = await getTraderQuote(
        {
            listingId,
            cbm: bookedCbm,
            weight: bookedWeight,
        },
        client
    );

    let snapshotRows = buildSnapshotRowsFromQuote(quote, { bookingId, listingId });
    if (typeof transformSnapshots === "function") {
        snapshotRows = transformSnapshots(snapshotRows, quote);
    }

    const insertedSnapshots = await insertBookingChargeSnapshots(client, snapshotRows);
    return {
        quote,
        insertedSnapshots,
    };
}

/**
 * Reads historical booking price breakdown exclusively from v_booking_itemised_cost
 * and booking_charge_snapshot (never from live listing_charge_item or listing_pricing_rule).
 */
async function getBookingFinancialSnapshot(bookingId, clientOrPool = pool) {
    const viewRes = await clientOrPool.query(
        `SELECT
            booking_id,
            listing_id,
            trader_id,
            booked_cbm,
            booked_weight,
            legacy_total_price,
            booking_status,
            total_all_in_cost,
            total_shipper_prepaid,
            total_consignee_collect,
            origin_charges,
            ocean_charges,
            destination_charges,
            itemised_charge_count::int AS itemised_charge_count,
            is_legacy_booking
         FROM v_booking_itemised_cost
         WHERE booking_id = $1`,
        [bookingId]
    );

    const summaryRow = viewRes.rows[0] || null;

    const snapshotsRes = await clientOrPool.query(
        `SELECT
            id,
            booking_id,
            listing_id,
            charge_type_code,
            charge_name,
            stage,
            treatment,
            basis,
            rate,
            chargeable_quantity,
            calculated_amount,
            currency,
            certainty,
            payer,
            payee,
            payment_timing,
            explanatory_note,
            snapshot_time
         FROM booking_charge_snapshot
         WHERE booking_id = $1
         ORDER BY id ASC`,
        [bookingId]
    );

    return {
        is_legacy_booking: summaryRow ? Boolean(summaryRow.is_legacy_booking) : snapshotsRes.rowCount === 0,
        summary: summaryRow,
        snapshots: snapshotsRes.rows,
    };
}

module.exports = {
    VALID_STAGES,
    VALID_TREATMENTS,
    VALID_BASES,
    VALID_CERTAINTIES,
    VALID_PAYERS,
    VALID_PAYMENT_TIMINGS,
    DEFAULT_PRICING_RULE,
    roundToDecimals,
    round2,
    calculateBaseFreight,
    calculateBillableQuantities,
    evaluateChargeItem,
    calculateQuote,
    buildSnapshotRowsFromQuote,
    validatePricingRuleInput,
    validateChargeItemsInput,
    getStandardChargeTypes,
    getListingPricing,
    upsertListingPricing,
    getTraderQuote,
    insertBookingChargeSnapshots,
    createBookingChargeSnapshots,
    getBookingFinancialSnapshot,
};
