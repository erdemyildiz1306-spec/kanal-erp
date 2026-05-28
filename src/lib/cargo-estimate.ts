/**
 * Desi bazlı kargo tahmini — fatura kesilmeden önce GelirUP tarzı projeksiyon.
 * Gerçek kargo faturası varsa her zaman o kullanılır (profit-detail).
 */

export type CargoTariffTier = {
  maxDesi: number;
  fee: number;
};

/** Trendyol marketplace ortalama barem (KDV dahil, ayarlanabilir) */
export const DEFAULT_CARGO_TARIFF: CargoTariffTier[] = [
  { maxDesi: 1, fee: 39.99 },
  { maxDesi: 3, fee: 49.99 },
  { maxDesi: 5, fee: 59.99 },
  { maxDesi: 10, fee: 79.99 },
  { maxDesi: 20, fee: 109.99 },
  { maxDesi: 30, fee: 139.99 },
  { maxDesi: 999, fee: 179.99 },
];

export function normalizeCargoTariff(
  raw: unknown,
  fallback = DEFAULT_CARGO_TARIFF
): CargoTariffTier[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const tiers = raw
    .map((t) => ({
      maxDesi: Number((t as CargoTariffTier).maxDesi) || 0,
      fee: Number((t as CargoTariffTier).fee) || 0,
    }))
    .filter((t) => t.maxDesi > 0 && t.fee >= 0)
    .sort((a, b) => a.maxDesi - b.maxDesi);
  return tiers.length ? tiers : fallback;
}

export function estimateCargoFee(
  desiInput: number,
  tariff: CargoTariffTier[] = DEFAULT_CARGO_TARIFF
): { fee: number; desiUsed: number; tierLabel: string; estimated: true; method: 'desi' } {
  const desiUsed = Math.max(1, Math.ceil(Number(desiInput) || 1));
  const tiers = normalizeCargoTariff(tariff);
  const tier =
    tiers.find((t) => desiUsed <= t.maxDesi) ?? tiers[tiers.length - 1]!;
  return {
    fee: tier.fee,
    desiUsed,
    tierLabel: `≤${tier.maxDesi} desi`,
    estimated: true,
    method: 'desi',
  };
}

export type CargoEstimateDefaults = {
  defaultDesi: number;
  defaultCargoFee: number;
  cargoTariff: CargoTariffTier[];
};

export function resolveLineCargoFee(
  barcode: string,
  cargoByBarcode: Map<string, number>,
  defaultCargoFee: number
): number {
  const fromProduct = barcode ? cargoByBarcode.get(barcode) : undefined;
  if (fromProduct != null && fromProduct > 0) return fromProduct;
  if (defaultCargoFee > 0) return defaultCargoFee;
  return 0;
}

/** Sipariş kargo tahmini — önce sabit (ürün/ayar), yoksa desi baremi */
export function estimateOrderCargoFee(input: {
  lines: Array<{ barcode?: string; sku?: string; quantity?: number }>;
  cargoByBarcode: Map<string, number>;
  desiByBarcode: Map<string, number>;
  defaults: CargoEstimateDefaults;
}): {
  fee: number;
  desiUsed: number;
  tierLabel: string;
  method: 'fixed' | 'desi';
  estimated: true;
} {
  const { lines, cargoByBarcode, desiByBarcode, defaults } = input;
  const useFixedMode =
    defaults.defaultCargoFee > 0 ||
    [...cargoByBarcode.values()].some((v) => v > 0);

  if (useFixedMode) {
    let total = 0;
    const items = lines.length ? lines : [{ quantity: 1 }];
    for (const line of items) {
      const bc = String(line.barcode ?? line.sku ?? '').trim();
      const qty = Math.max(1, Number(line.quantity) || 1);
      const unit = resolveLineCargoFee(bc, cargoByBarcode, defaults.defaultCargoFee);
      total += unit * qty;
    }
    return {
      fee: Math.round(total * 100) / 100,
      desiUsed: 0,
      tierLabel: 'Sabit kargo (ürün / ayar)',
      method: 'fixed',
      estimated: true,
    };
  }

  const orderDesi = sumLineDesi(lines, desiByBarcode, defaults.defaultDesi);
  const desiEst = estimateCargoFee(orderDesi, defaults.cargoTariff);
  return {
    fee: desiEst.fee,
    desiUsed: desiEst.desiUsed,
    tierLabel: desiEst.tierLabel,
    method: 'desi',
    estimated: true,
  };
}

const DESI_ATTR_KEYS = ['desi', 'Desi', 'DESI', 'dimensionalWeight', 'hacim', 'Hacim'];

export function parseDesiFromAttributes(
  attrs: Array<{ attributeName?: string; attributeValue?: string }> | undefined,
  fallback = 1
): number {
  if (!attrs?.length) return fallback;
  for (const a of attrs) {
    const name = String(a.attributeName ?? '').trim();
    if (!DESI_ATTR_KEYS.some((k) => name.toLowerCase() === k.toLowerCase())) continue;
    const n = Number(String(a.attributeValue ?? '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

export function resolveProductDesi(
  product: {
    dimensionalWeight?: number;
    trendyolAttributes?: Array<{ attributeName?: string; attributeValue?: string }>;
  } | null | undefined,
  defaultDesi = 1
): number {
  const fromField = Number(product?.dimensionalWeight);
  if (Number.isFinite(fromField) && fromField > 0) return fromField;
  const fromAttr = parseDesiFromAttributes(product?.trendyolAttributes, 0);
  if (fromAttr > 0) return fromAttr;
  return defaultDesi;
}

export function sumLineDesi(
  lines: Array<{ barcode?: string; sku?: string; quantity?: number }>,
  desiByBarcode: Map<string, number>,
  defaultDesi = 1
): number {
  let total = 0;
  for (const line of lines) {
    const bc = String(line.barcode ?? line.sku ?? '').trim();
    const qty = Math.max(1, Number(line.quantity) || 1);
    const desi = (bc ? desiByBarcode.get(bc) : undefined) ?? defaultDesi;
    total += desi * qty;
  }
  return total > 0 ? total : defaultDesi;
}
