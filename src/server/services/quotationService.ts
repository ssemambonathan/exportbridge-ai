import { QuotationCalculationInput, QuotationCalculationResult } from '../../shared/types.ts';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Deterministic export quotation pricing calculator supporting EXW, FOB, CFR, and CIF Incoterms.
 */
export function calculateQuotationPricing(input: QuotationCalculationInput): QuotationCalculationResult {
  if (input.quantityKg <= 0) {
    throw new Error('Quantity in kg must be greater than zero.');
  }
  if (input.unitFobUsdKg < 0) {
    throw new Error('Unit price cannot be negative.');
  }

  const baseCommodityUsd = round2(input.quantityKg * input.unitFobUsdKg);

  let inlandHaulageUsd = round2(input.inlandHaulageUsd ?? 0);
  let portHandlingUsd = round2(input.portHandlingUsd ?? 0);
  let oceanFreightUsd = round2(input.oceanFreightUsd ?? 0);
  let marineInsuranceUsd = 0;

  if (input.incoterm === 'EXW') {
    inlandHaulageUsd = 0;
    portHandlingUsd = 0;
    oceanFreightUsd = 0;
    marineInsuranceUsd = 0;
  } else if (input.incoterm === 'FOB') {
    inlandHaulageUsd = input.inlandHaulageUsd ?? round2(Math.max(180, input.quantityKg * 0.14));
    portHandlingUsd = input.portHandlingUsd ?? round2(Math.max(240, input.quantityKg * 0.08));
    oceanFreightUsd = 0;
    marineInsuranceUsd = 0;
  } else if (input.incoterm === 'CFR') {
    inlandHaulageUsd = input.inlandHaulageUsd ?? round2(Math.max(180, input.quantityKg * 0.14));
    portHandlingUsd = input.portHandlingUsd ?? round2(Math.max(240, input.quantityKg * 0.08));
    oceanFreightUsd = input.oceanFreightUsd ?? round2(Math.max(650, input.quantityKg * 0.22));
    marineInsuranceUsd = 0;
  } else if (input.incoterm === 'CIF') {
    inlandHaulageUsd = input.inlandHaulageUsd ?? round2(Math.max(180, input.quantityKg * 0.14));
    portHandlingUsd = input.portHandlingUsd ?? round2(Math.max(240, input.quantityKg * 0.08));
    oceanFreightUsd = input.oceanFreightUsd ?? round2(Math.max(650, input.quantityKg * 0.22));
    const cfrSubtotal = baseCommodityUsd + inlandHaulageUsd + portHandlingUsd + oceanFreightUsd;
    // Standard 110% CIF marine cargo insurance @ 0.35%
    marineInsuranceUsd = round2(cfrSubtotal * 1.1 * 0.0035);
  }

  const logisticsSubtotal = round2(
    baseCommodityUsd + inlandHaulageUsd + portHandlingUsd + oceanFreightUsd + marineInsuranceUsd
  );

  const commissionRatePct = input.commissionRatePct ?? 3.5;
  const commissionUsd = round2(baseCommodityUsd * (commissionRatePct / 100));
  const totalValueUsd = round2(logisticsSubtotal + commissionUsd);
  const effectiveUsdPerKg = round2(totalValueUsd / input.quantityKg);

  return {
    baseCommodityUsd,
    inlandHaulageUsd,
    portHandlingUsd,
    oceanFreightUsd,
    marineInsuranceUsd,
    commissionRatePct,
    commissionUsd,
    totalValueUsd,
    effectiveUsdPerKg,
  };
}
