import connectToDatabase from '@/lib/mongodb';
import VariantTemplate from '@/models/VariantTemplate';
import { fetchTrendyolCategoryFieldsWithValues } from '@/lib/trendyol';
import { parseCategoryAttributeFields } from '@/lib/trendyol-attributes';

function tyTruthyFlag(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function tyVariantAxisFromRow(row: unknown): { varianter: boolean; slicer: boolean } {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { varianter: false, slicer: false };
  }
  const r = row as Record<string, unknown>;
  const pick = (...keys: string[]) => keys.some((k) => tyTruthyFlag(r[k]));
  return {
    varianter: pick('varianter', 'Varianter', 'isVarianter'),
    slicer: pick('slicer', 'Slicer', 'isSlicer'),
  };
}

function extractAttributeRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const key of ['categoryAttributes', 'attributes', 'content']) {
    if (Array.isArray(o[key])) return o[key] as unknown[];
  }
  return [];
}

export async function listVariantTemplates() {
  await connectToDatabase();
  const rows = await VariantTemplate.find({}).sort({ name: 1 }).lean();
  return rows.map((r) => ({
    id: String(r._id),
    name: r.name,
    values: r.values as string[],
    trendyolCategoryId: r.trendyolCategoryId,
    trendyolAttributeId: r.trendyolAttributeId,
  }));
}

export async function importVariantTemplatesFromCategory(categoryId: number): Promise<{
  created: Array<{ id: string; name: string; values: string[] }>;
  skipped: number;
  skippedAlreadyExists: number;
  skippedNoValues: number;
}> {
  await connectToDatabase();
  const { raw, fields } = await fetchTrendyolCategoryFieldsWithValues(categoryId);
  const rows = extractAttributeRows(raw);

  const created: Array<{ id: string; name: string; values: string[] }> = [];
  let skipped = 0;
  let skippedAlreadyExists = 0;
  let skippedNoValues = 0;

  const fieldById = new Map(fields.map((f) => [f.attributeId, f]));

  for (const rawRow of rows) {
    const axis = tyVariantAxisFromRow(rawRow);
    if (!axis.varianter && !axis.slicer) continue;

    const row = rawRow as { attribute?: { id?: unknown; name?: unknown }; allowCustom?: unknown };
    const attrId = Number(row.attribute?.id);
    const attrName = String(row.attribute?.name ?? '').trim();
    if (!Number.isFinite(attrId) || attrId <= 0 || !attrName) {
      skipped++;
      continue;
    }

    const field = fieldById.get(attrId);
    let valueLabels = (field?.values ?? []).map((v) => String(v.name ?? '').trim()).filter(Boolean);

    if (valueLabels.length === 0 && tyTruthyFlag(row.allowCustom)) {
      valueLabels = ['(Serbest metin)'];
    }
    if (valueLabels.length === 0) {
      skippedNoValues++;
      skipped++;
      continue;
    }

    const exists = await VariantTemplate.findOne({ name: attrName }).lean();
    if (exists) {
      skippedAlreadyExists++;
      skipped++;
      continue;
    }

    const doc = await VariantTemplate.create({
      name: attrName.slice(0, 255),
      values: valueLabels,
      trendyolCategoryId: categoryId,
      trendyolAttributeId: attrId,
    });
    created.push({
      id: String(doc._id),
      name: doc.name,
      values: doc.values as string[],
    });
  }

  return { created, skipped, skippedAlreadyExists, skippedNoValues };
}
