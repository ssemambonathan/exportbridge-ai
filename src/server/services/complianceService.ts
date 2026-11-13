import { getDb } from '../db/database.ts';
import crypto from 'node:crypto';

export interface ChecklistTemplateItem {
  requirementCode: string;
  title: string;
  issuingAuthority: string;
  mandatory: boolean;
  notes: string;
}

const EU_COUNTRIES = new Set([
  'Germany', 'Netherlands', 'France', 'Italy', 'Belgium', 'Spain',
  'Sweden', 'Denmark', 'Austria', 'Finland', 'Poland', 'European Union',
]);

export function buildComplianceRequirements(
  originCountry: string,
  commodity: string,
  destinationCountry: string
): ChecklistTemplateItem[] {
  const items: ChecklistTemplateItem[] = [
    {
      requirementCode: 'COM-INV',
      title: 'Commercial Invoice & Proforma Contract',
      issuingAuthority: 'Exporter / Supplier Finance',
      mandatory: true,
      notes: 'Must specify HS code, Incoterm, net/gross weight, and USD unit price.',
    },
    {
      requirementCode: 'PKG-LIST',
      title: 'Export Packing List & Bag Marking Manifest',
      issuingAuthority: 'Exporter Warehouse',
      mandatory: true,
      notes: 'Lists lot codes, jute bag count (60kg/bag), and container seal numbers.',
    },
    {
      requirementCode: 'PHYTO-CERT',
      title: 'Phytosanitary Certificate',
      issuingAuthority: originCountry.toLowerCase().includes('uganda')
        ? 'MAAIF (Ministry of Agriculture, Animal Industry & Fisheries)'
        : 'National Plant Protection Organisation',
      mandatory: true,
      notes: 'Confirms lot is free from quarantine pests and meets destination moisture tolerance.',
    },
    {
      requirementCode: 'CERT-ORIGIN',
      title: 'Certificate of Origin (EUR.1 / Non-Preferential)',
      issuingAuthority: originCountry.toLowerCase().includes('uganda')
        ? 'Uganda National Chamber of Commerce / URA Customs'
        : 'National Chamber of Commerce',
      mandatory: true,
      notes: 'Required for customs tariff treatment at destination port.',
    },
  ];

  if (commodity.toLowerCase().includes('coffee')) {
    items.push({
      requirementCode: 'ICO-UCDA',
      title: originCountry.toLowerCase().includes('uganda')
        ? 'UCDA Quality Certificate & ICO Certificate of Origin'
        : 'National Coffee Board Export Permit & ICO Origin Cert',
      issuingAuthority: originCountry.toLowerCase().includes('uganda')
        ? 'Uganda Coffee Development Authority (UCDA)'
        : 'National Coffee Authority',
      mandatory: true,
      notes: 'Verifies moisture <= 12.0%, screen grading, and defect count before port release.',
    });
  }

  if (EU_COUNTRIES.has(destinationCountry)) {
    items.push({
      requirementCode: 'EUDR-GEO',
      title: 'EU Deforestation Regulation (EUDR) Geolocation Polygons & DDS',
      issuingAuthority: 'Cooperative GIS Registry / EU TRACES NT',
      mandatory: true,
      notes: 'Mandatory GeoJSON plot polygons proving deforestation-free harvest after 31 Dec 2020.',
    });
  }

  if (destinationCountry.toLowerCase().includes('united states') || destinationCountry === 'USA') {
    items.push({
      requirementCode: 'FDA-PRIOR',
      title: 'US FDA Prior Notice & Bioterrorism Registration',
      issuingAuthority: 'US FDA',
      mandatory: true,
      notes: 'Required prior to vessel arrival at US port of entry.',
    });
  }

  return items;
}

export function generateExportChecklist(params: {
  organisationId: string;
  supplierId: string;
  lotId?: string | null;
  originCountry: string;
  destinationCountry: string;
  commodity: string;
}): { checklistId: string; itemsCount: number } {
  const db = getDb();
  const checklistId = crypto.randomUUID();
  const templateItems = buildComplianceRequirements(
    params.originCountry,
    params.commodity,
    params.destinationCountry
  );

  db.prepare(`
    INSERT INTO export_checklists (
      id, organisation_id, supplier_id, lot_id, destination_country, commodity, overall_status, readiness_pct
    ) VALUES (?, ?, ?, ?, ?, ?, 'in_progress', 0)
  `).run(
    checklistId,
    params.organisationId,
    params.supplierId,
    params.lotId ?? null,
    params.destinationCountry,
    params.commodity
  );

  const stmt = db.prepare(`
    INSERT INTO export_checklist_items (
      id, checklist_id, requirement_code, title, issuing_authority, mandatory, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `);

  for (const item of templateItems) {
    stmt.run(
      crypto.randomUUID(),
      checklistId,
      item.requirementCode,
      item.title,
      item.issuingAuthority,
      item.mandatory ? 1 : 0,
      item.notes
    );
  }

  return { checklistId, itemsCount: templateItems.length };
}

export function recalculateChecklistReadiness(checklistId: string): number {
  const db = getDb();
  const rows = db.prepare(`
    SELECT mandatory, status FROM export_checklist_items WHERE checklist_id = ?
  `).all(checklistId) as Array<{ mandatory: number; status: string }>;

  if (rows.length === 0) return 0;
  const completed = rows.filter((r) => r.status === 'verified' || r.status === 'uploaded' || r.status === 'waived').length;
  const pct = Math.round((completed / rows.length) * 100);
  db.prepare(`UPDATE export_checklists SET readiness_pct = ?, updated_at = datetime('now') WHERE id = ?`).run(
    pct,
    checklistId
  );
  return pct;
}
