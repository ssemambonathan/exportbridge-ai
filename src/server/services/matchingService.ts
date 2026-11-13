import { getDb } from '../db/database.ts';
import crypto from 'node:crypto';

export interface MatchScoreBreakdown {
  commodityFitScore: number;
  volumeFitScore: number;
  priceFitScore: number;
  complianceFitScore: number;
  overallScore: number;
  rationale: string;
}

export function computeProductBuyerMatch(params: {
  productCategory: string;
  productName: string;
  productUnitPriceUsd: number;
  lotAvailableKg: number;
  supplierVerificationStatus: string;
  productCertifications: string[];
  buyerCategories: string[];
  buyerAnnualVolumeMt: number;
  buyerTargetPriceMaxUsd: number | null;
  buyerVerificationStatus: string;
  buyerCountry: string;
}): MatchScoreBreakdown {
  const catLower = params.productCategory.toLowerCase();
  const nameLower = params.productName.toLowerCase();
  const buyerCatsLower = params.buyerCategories.map((c) => c.toLowerCase());

  // 1. Commodity Fit (0-35)
  let commodityFitScore = 10;
  const exactMatch = buyerCatsLower.some(
    (c) => c.includes(catLower) || catLower.includes(c) || nameLower.includes(c)
  );
  const keywordMatch = buyerCatsLower.some((c) => {
    const words = c.split(/\s+/).filter((w) => w.length > 3);
    return words.some((w) => catLower.includes(w) || nameLower.includes(w));
  });
  if (exactMatch) commodityFitScore = 35;
  else if (keywordMatch) commodityFitScore = 26;

  // 2. Volume Fit (0-25): compare lot kg against buyer's annual demand
  const buyerAnnualKg = (params.buyerAnnualVolumeMt || 10) * 1000;
  let volumeFitScore = 15;
  if (params.lotAvailableKg >= 500 && params.lotAvailableKg <= buyerAnnualKg) {
    volumeFitScore = 25;
  } else if (params.lotAvailableKg > buyerAnnualKg && params.lotAvailableKg <= buyerAnnualKg * 2) {
    volumeFitScore = 18;
  } else if (params.lotAvailableKg < 500) {
    volumeFitScore = 10;
  }

  // 3. Price Alignment (0-25)
  let priceFitScore = 18;
  if (params.buyerTargetPriceMaxUsd && params.buyerTargetPriceMaxUsd > 0) {
    if (params.productUnitPriceUsd <= params.buyerTargetPriceMaxUsd) {
      const marginHeadroom = (params.buyerTargetPriceMaxUsd - params.productUnitPriceUsd) / params.buyerTargetPriceMaxUsd;
      priceFitScore = marginHeadroom >= 0.08 ? 25 : 22;
    } else {
      const overPct = (params.productUnitPriceUsd - params.buyerTargetPriceMaxUsd) / params.buyerTargetPriceMaxUsd;
      priceFitScore = overPct <= 0.1 ? 14 : 6;
    }
  }

  // 4. Compliance & Verification Readiness (0-15)
  let complianceFitScore = 5;
  if (params.supplierVerificationStatus === 'verified') complianceFitScore += 5;
  else if (params.supplierVerificationStatus === 'under_review') complianceFitScore += 3;
  if (params.buyerVerificationStatus === 'verified') complianceFitScore += 5;
  else if (params.buyerVerificationStatus === 'under_review') complianceFitScore += 2;
  if (
    ['Germany', 'Netherlands', 'France', 'Italy', 'Belgium', 'Sweden', 'Denmark', 'EU'].includes(params.buyerCountry) &&
    params.productCertifications.some((c) => c.toLowerCase().includes('eudr'))
  ) {
    complianceFitScore = Math.min(15, complianceFitScore + 2);
  }

  const overallScore = Math.min(100, commodityFitScore + volumeFitScore + priceFitScore + complianceFitScore);

  const rationaleParts: string[] = [];
  rationaleParts.push(
    exactMatch
      ? `Direct commodity match (${params.productCategory})`
      : keywordMatch
        ? `Adjacent specialty category match (${params.productCategory})`
        : `Cross-category sourcing candidate`
  );
  rationaleParts.push(
    `Lot volume ${params.lotAvailableKg.toLocaleString()} kg vs buyer annual capacity ${params.buyerAnnualVolumeMt} MT`
  );
  if (params.buyerTargetPriceMaxUsd) {
    rationaleParts.push(
      `FOB $${params.productUnitPriceUsd.toFixed(2)}/kg vs buyer ceiling $${params.buyerTargetPriceMaxUsd.toFixed(2)}/kg`
    );
  }

  return {
    commodityFitScore,
    volumeFitScore,
    priceFitScore,
    complianceFitScore,
    overallScore,
    rationale: rationaleParts.join('; '),
  };
}

export function runDeterministicMatchingForProduct(productId: string, organisationId?: string): number {
  const db = getDb();
  const product = db.prepare(`
    SELECT p.*, s.verification_status AS supplier_verification_status
    FROM products p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.id = ?
  `).get(productId) as any;

  if (!product) throw new Error('Product not found');

  const lot = db.prepare(`
    SELECT * FROM product_lots WHERE product_id = ? AND available_kg > 0 ORDER BY available_kg DESC LIMIT 1
  `).get(productId) as any;

  const buyers = db.prepare(`SELECT * FROM buyers WHERE verification_status != 'rejected'`).all() as any[];
  let createdOrUpdated = 0;

  for (const buyer of buyers) {
    const score = computeProductBuyerMatch({
      productCategory: product.commodity_category,
      productName: product.name,
      productUnitPriceUsd: product.unit_price_usd_per_kg,
      lotAvailableKg: lot?.available_kg ?? product.min_order_kg,
      supplierVerificationStatus: product.supplier_verification_status,
      productCertifications: JSON.parse(product.certifications_json || '[]'),
      buyerCategories: JSON.parse(buyer.import_categories_json || '[]'),
      buyerAnnualVolumeMt: buyer.annual_volume_mt,
      buyerTargetPriceMaxUsd: buyer.target_price_max_usd_kg,
      buyerVerificationStatus: buyer.verification_status,
      buyerCountry: buyer.country,
    });

    if (score.overallScore >= 45) {
      db.prepare(`
        INSERT INTO product_buyer_matches (
          id, organisation_id, product_id, lot_id, buyer_id,
          match_score, commodity_fit_score, volume_fit_score,
          price_fit_score, compliance_fit_score, rationale,
          score_breakdown_json, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rule_engine')
        ON CONFLICT(product_id, buyer_id) DO UPDATE SET
          lot_id = excluded.lot_id,
          match_score = excluded.match_score,
          commodity_fit_score = excluded.commodity_fit_score,
          volume_fit_score = excluded.volume_fit_score,
          price_fit_score = excluded.price_fit_score,
          compliance_fit_score = excluded.compliance_fit_score,
          rationale = excluded.rationale,
          score_breakdown_json = excluded.score_breakdown_json,
          updated_at = datetime('now')
      `).run(
        crypto.randomUUID(),
        organisationId ?? product.organisation_id,
        product.id,
        lot?.id ?? null,
        buyer.id,
        score.overallScore,
        score.commodityFitScore,
        score.volumeFitScore,
        score.priceFitScore,
        score.complianceFitScore,
        score.rationale,
        JSON.stringify(score)
      );
      createdOrUpdated++;
    }
  }

  return createdOrUpdated;
}
