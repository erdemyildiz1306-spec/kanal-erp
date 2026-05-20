/** Trendyol kategori öznitelik yanıtını ERP formuna çevirir */

export type TyAttributeField = {
  attributeId: number;
  name: string;
  required: boolean;
  allowCustom: boolean;
  /** Trendyol panelinde ayrı ürün kartı (örn. Renk) */
  slicer: boolean;
  /** Trendyol panelinde varyant (örn. Beden) */
  varianter: boolean;
  allowMultiple: boolean;
  values: Array<{ id: number; name: string }>;
};

export type TyAttributeSelection = {
  attributeId: number;
  attributeName?: string;
  attributeValueId?: number;
  attributeValue: string;
};

export type TyAttributeFormValue = {
  valueId?: number;
  custom?: string;
};

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asBool(v: unknown): boolean {
  return v === true || v === 1 || v === 'true' || v === '1';
}

function normalizeLabel(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Ürün düzeyinde kalması gereken öznitelikler (Web Color, Cinsiyet vb.) */
function isProductLevelOnlyAttributeName(name: string): boolean {
  const n = normalizeLabel(name);
  if (n.includes('web') && (n.includes('color') || n.includes('renk'))) return true;
  if (n.includes('cinsiyet') || n.includes('gender')) return true;
  if (n.includes('mensei') || n.includes('origin') || n.includes('ulke')) return true;
  if (n.includes('marka') || n.includes('brand')) return true;
  return false;
}

/** Varyant tablosundan giden öznitelik — ürün formunda zorunlu sayılmaz (Trendyol paneli gibi) */
export function isVariantDimensionField(field: TyAttributeField): boolean {
  if (isProductLevelOnlyAttributeName(field.name)) return false;
  if (field.varianter || field.slicer) return true;
  const n = normalizeLabel(field.name);
  if (/^(beden|size|numara|boyut|olcu|ebat)$/.test(n)) return true;
  if (/beden|numara|boyut|olcu|ebat/.test(n) && !/agirlik|weight|desi/.test(n)) return true;
  if (/^(renk|color|colour)$/.test(n)) return true;
  if (n.includes('renk') && !n.includes('web') && !n.includes('kod')) return true;
  if (/yas|age/.test(n)) return true;
  if (/^ay$|ay\s*grubu|ay aral/.test(n)) return true;
  return false;
}

/** Ürün düzeyinde doldurulacak öznitelikler (varyantlı üründe beden/renk/yaş hariç) */
export function fieldsForProductLevel(
  fields: TyAttributeField[],
  hasVariants: boolean
): TyAttributeField[] {
  if (!hasVariants) return fields;
  return fields.filter((f) => !isVariantDimensionField(f));
}

/** Trendyol sapigw / apigw category attributes ham JSON → form alanları */
export function parseCategoryAttributeFields(raw: unknown): TyAttributeField[] {
  if (!raw || typeof raw !== 'object') return [];
  const root = raw as Record<string, unknown>;

  const lists: unknown[] = [];
  for (const key of [
    'categoryAttributes',
    'attributes',
    'content',
    'items',
  ] as const) {
    const hit = root[key];
    if (Array.isArray(hit)) lists.push(...hit);
  }
  if (Array.isArray(raw)) lists.push(...raw);

  const fields: TyAttributeField[] = [];

  for (const entry of lists) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;

    const attrObj =
      row.attribute && typeof row.attribute === 'object'
        ? (row.attribute as Record<string, unknown>)
        : row;

    const attributeId =
      asNum(attrObj.id) ??
      asNum(attrObj.attributeId) ??
      asNum(row.attributeId) ??
      asNum(row.id);

    if (attributeId === null) continue;

    const name = String(
      attrObj.name ?? attrObj.attributeName ?? row.name ?? `Öznitelik ${attributeId}`
    ).trim();

    const required =
      asBool(row.required) ||
      asBool(row.mandatory) ||
      asBool(row.isRequired) ||
      asBool(attrObj.required);

    const allowCustom =
      asBool(row.allowCustom) ||
      asBool(row.customValue) ||
      asBool(attrObj.allowCustom);

    const slicer =
      asBool(row.slicer) ||
      asBool(attrObj.slicer) ||
      asBool(row.slicerAttribute) ||
      asBool(row.isSlicer);
    const varianter =
      asBool(row.varianter) ||
      asBool(attrObj.varianter) ||
      asBool(row.variantAttribute) ||
      asBool(row.isVariant) ||
      asBool(row.isVarianter);
    const allowMultiple =
      asBool(row.allowMultipleAttributeValues) ||
      asBool(attrObj.allowMultipleAttributeValues);

    const valueSrc =
      row.attributeValues ??
      row.values ??
      row.attributeValueList ??
      attrObj.attributeValues ??
      [];

    const values: Array<{ id: number; name: string }> = [];
    if (Array.isArray(valueSrc)) {
      for (const v of valueSrc) {
        if (!v || typeof v !== 'object') continue;
        const o = v as Record<string, unknown>;
        const id = asNum(o.id ?? o.valueId ?? o.attributeValueId);
        const label = String(
          o.name ?? o.value ?? o.attributeValue ?? ''
        ).trim();
        if (id !== null && label) values.push({ id, name: label });
      }
    }

    fields.push({
      attributeId,
      name,
      required,
      allowCustom,
      slicer,
      varianter,
      allowMultiple,
      values,
    });
  }

  const seen = new Set<number>();
  return fields.filter((f) => {
    if (seen.has(f.attributeId)) return false;
    seen.add(f.attributeId);
    return true;
  });
}

/** V2 values API yanıt satırları */
export function parseCategoryAttributeValueRows(raw: unknown): Array<{ id: number; name: string }> {
  if (!raw || typeof raw !== 'object') return [];
  const root = raw as Record<string, unknown>;
  const list = Array.isArray(root.content)
    ? root.content
    : Array.isArray(root.attributeValues)
      ? root.attributeValues
      : Array.isArray(raw)
        ? raw
        : [];

  const out: Array<{ id: number; name: string }> = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = asNum(o.attributeValueId ?? o.id ?? o.valueId);
    const name = String(o.attributeValue ?? o.name ?? o.value ?? '').trim();
    if (id !== null && name) out.push({ id, name });
  }
  return out;
}

export function findVariantDimensionFields(fields: TyAttributeField[]): {
  sizeField?: TyAttributeField;
  colorField?: TyAttributeField;
  ageField?: TyAttributeField;
} {
  let sizeField = fields.find((f) => f.varianter);
  let colorField = fields.find((f) => f.slicer);
  let ageField = fields.find((f) => {
    const n = normalizeLabel(f.name);
    return n.includes('yas') || n.includes('age');
  });

  if (!sizeField) {
    sizeField = fields.find((f) => {
      const n = normalizeLabel(f.name);
      return /^(beden|size|numara|boyut)$/.test(n);
    });
  }
  if (!colorField) {
    colorField = fields.find((f) => {
      const n = normalizeLabel(f.name);
      return (
        f.slicer ||
        n === 'renk' ||
        n === 'color' ||
        (n.includes('renk') && !n.includes('web'))
      );
    });
  }

  return { sizeField, colorField, ageField };
}

export function selectionFromLabel(
  field: TyAttributeField,
  label: string
): TyAttributeSelection | null {
  const trimmed = String(label ?? '').trim();
  if (!trimmed) return null;

  const norm = normalizeLabel(trimmed);
  const hit = field.values.find(
    (v) =>
      normalizeLabel(v.name) === norm ||
      v.name.trim().toLocaleLowerCase('tr-TR') === trimmed.toLocaleLowerCase('tr-TR')
  );

  if (hit) {
    return {
      attributeId: field.attributeId,
      attributeName: field.name,
      attributeValueId: hit.id,
      attributeValue: hit.name,
    };
  }

  if (field.allowCustom || field.values.length === 0) {
    return {
      attributeId: field.attributeId,
      attributeName: field.name,
      attributeValue: trimmed,
    };
  }

  return null;
}

/** Ürün + varyant satırından Trendyol create attributes dizisi */
export function buildCreateAttributesForItem(
  fields: TyAttributeField[],
  stored: TyAttributeSelection[],
  variant?: { sizeLabel?: string; colorLabel?: string }
): TyAttributeSelection[] {
  const byId = new Map<number, TyAttributeSelection>();
  for (const s of stored) {
    byId.set(s.attributeId, { ...s });
  }

  const { sizeField, colorField, ageField } = findVariantDimensionFields(fields);

  if (sizeField && variant?.sizeLabel?.trim()) {
    const sel = selectionFromLabel(sizeField, variant.sizeLabel);
    if (sel) byId.set(sizeField.attributeId, sel);
  }
  if (colorField && variant?.colorLabel?.trim()) {
    const sel = selectionFromLabel(colorField, variant.colorLabel);
    if (sel) byId.set(colorField.attributeId, sel);
  }
  if (
    ageField &&
    ageField.attributeId !== sizeField?.attributeId &&
    variant?.sizeLabel?.trim()
  ) {
    const sel = selectionFromLabel(ageField, variant.sizeLabel);
    if (sel) byId.set(ageField.attributeId, sel);
  }

  const ordered: TyAttributeSelection[] = [];
  for (const f of fields) {
    const hit = byId.get(f.attributeId);
    if (hit && (hit.attributeValueId != null || hit.attributeValue?.trim())) {
      ordered.push(hit);
    }
  }
  for (const [id, sel] of byId) {
    if (!fields.some((f) => f.attributeId === id)) ordered.push(sel);
  }
  return ordered;
}

export function selectionsFromStored(
  stored: TyAttributeSelection[] | undefined
): Record<number, TyAttributeFormValue> {
  const out: Record<number, TyAttributeFormValue> = {};
  if (!Array.isArray(stored)) return out;
  for (const s of stored) {
    const id = asNum(s.attributeId);
    if (id === null) continue;
    out[id] = {
      valueId: asNum(s.attributeValueId) ?? undefined,
      custom: s.attributeValue?.trim() || undefined,
    };
  }
  return out;
}

export function buildAttributeSelections(
  fields: TyAttributeField[],
  formValues: Record<number, TyAttributeFormValue>
): TyAttributeSelection[] {
  const out: TyAttributeSelection[] = [];
  for (const f of fields) {
    const sel = formValues[f.attributeId];
    if (!sel) continue;
    let attributeValue = String(sel.custom ?? '').trim();
    let attributeValueId = sel.valueId;
    if (attributeValueId != null) {
      const hit = f.values.find((v) => v.id === attributeValueId);
      if (hit && !attributeValue) attributeValue = hit.name;
    }
    if (!attributeValue && attributeValueId == null) continue;
    out.push({
      attributeId: f.attributeId,
      attributeName: f.name,
      attributeValueId,
      attributeValue,
    });
  }
  return out;
}

export function validateRequiredAttributes(
  fields: TyAttributeField[],
  formValues: Record<number, TyAttributeFormValue>
): string | null {
  const missing: string[] = [];
  for (const f of fields.filter((x) => x.required)) {
    const sel = formValues[f.attributeId];
    const hasList = sel?.valueId != null;
    const hasCustom = Boolean(String(sel?.custom ?? '').trim());
    if (!hasList && !hasCustom) missing.push(f.name);
  }
  if (missing.length === 0) return null;
  return `Trendyol zorunlu öznitelikler eksik: ${missing.join(', ')}`;
}

/** Varyantlı üründe beden/renk/yaş varyant satırından gider — ürün formunda zorunlu tutulmaz */
export function validateVariantDimensionsForPublish(
  fields: TyAttributeField[],
  variants: Array<{ sizeLabel?: string; colorLabel?: string }>
): string | null {
  if (!variants.length) {
    return 'Varyantlı üründe en az bir varyant satırı gerekli.';
  }
  const { sizeField, colorField, ageField } = findVariantDimensionFields(fields);
  const sizeLikeField =
    sizeField ??
    (ageField && !colorField ? ageField : undefined);

  if (sizeLikeField?.required) {
    const missing = variants.filter((v) => !String(v.sizeLabel ?? '').trim());
    if (missing.length) {
      return `Her varyant satırında ${sizeLikeField.name} seçin (üst öznitelik formu değil, varyant tablosu).`;
    }
  }
  if (colorField?.required) {
    const missing = variants.filter((v) => !String(v.colorLabel ?? '').trim());
    if (missing.length) {
      return `Her varyant satırında ${colorField.name} seçin (üst öznitelik formu değil, varyant tablosu).`;
    }
  }
  return null;
}

/** Trendyol v2 create API attributes dizisi (resmi: attributeValueId veya customAttributeValue) */
export function toTrendyolApiAttributes(
  selections: TyAttributeSelection[]
): Array<Record<string, unknown>> {
  return selections.map((s) => {
    const row: Record<string, unknown> = {
      attributeId: s.attributeId,
    };
    if (s.attributeValueId != null) {
      row.attributeValueId = s.attributeValueId;
    } else if (s.attributeValue?.trim()) {
      row.customAttributeValue = s.attributeValue.trim();
    }
    return row;
  });
}

export function validateStoredForPublish(
  fields: TyAttributeField[],
  stored: TyAttributeSelection[] | undefined
): string | null {
  return validateRequiredAttributes(fields, selectionsFromStored(stored));
}
