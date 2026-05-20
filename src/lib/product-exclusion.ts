import ProductExclusion from '@/models/ProductExclusion';
import { barcodeLookupKeys } from '@/lib/barcode-normalize';

export type ExclusionKeys = {
  sku?: string;
  barcode?: string;
  trendyolProductId?: string;
  trendyolProductMainId?: string;
  stockCode?: string;
  productName?: string;
};

function norm(value?: string): string {
  return String(value ?? '').trim();
}

export async function registerProductExclusion(keys: ExclusionKeys): Promise<void> {
  const sku = norm(keys.sku);
  const barcode = norm(keys.barcode);
  const trendyolProductId = norm(keys.trendyolProductId);
  const trendyolProductMainId = norm(keys.trendyolProductMainId);
  const stockCode = norm(keys.stockCode);

  if (!sku && !barcode && !trendyolProductId && !trendyolProductMainId && !stockCode) {
    return;
  }

  const or: Record<string, string>[] = [];
  if (sku) or.push({ sku });
  if (barcode) or.push({ barcode });
  if (trendyolProductId) or.push({ trendyolProductId });
  if (trendyolProductMainId) or.push({ trendyolProductMainId });
  if (stockCode) or.push({ stockCode });

  const existing =
    or.length > 0 ? await ProductExclusion.findOne({ $or: or }).lean() : null;

  if (existing) {
    await ProductExclusion.updateOne(
      { _id: existing._id },
      {
        $set: {
          sku: sku || existing.sku,
          barcode: barcode || existing.barcode,
          trendyolProductId: trendyolProductId || existing.trendyolProductId,
          trendyolProductMainId:
            trendyolProductMainId || existing.trendyolProductMainId,
          stockCode: stockCode || existing.stockCode,
          productName: norm(keys.productName) || existing.productName,
        },
      }
    );
    return;
  }

  await ProductExclusion.create({
    sku,
    barcode,
    trendyolProductId,
    trendyolProductMainId,
    stockCode,
    productName: norm(keys.productName),
    reason: 'manual_delete',
  });
}

export async function isProductExcluded(keys: ExclusionKeys): Promise<boolean> {
  const sku = norm(keys.sku);
  const barcode = norm(keys.barcode);
  const trendyolProductId = norm(keys.trendyolProductId);
  const trendyolProductMainId = norm(keys.trendyolProductMainId);
  const stockCode = norm(keys.stockCode);

  const or: Record<string, unknown>[] = [];
  if (sku) or.push({ sku });
  if (barcode) {
    for (const key of barcodeLookupKeys(barcode)) {
      or.push({ barcode: key });
    }
  }
  if (trendyolProductId) or.push({ trendyolProductId });
  if (trendyolProductMainId) or.push({ trendyolProductMainId });
  if (stockCode) or.push({ stockCode });

  if (or.length === 0) return false;
  const hit = await ProductExclusion.findOne({ $or: or }).select('_id').lean();
  return Boolean(hit);
}

export async function clearProductExclusion(keys: ExclusionKeys): Promise<number> {
  const sku = norm(keys.sku);
  const barcode = norm(keys.barcode);
  const or: Record<string, unknown>[] = [];
  if (sku) or.push({ sku });
  if (barcode) {
    for (const key of barcodeLookupKeys(barcode)) {
      or.push({ barcode: key });
    }
  }
  if (or.length === 0) return 0;
  const result = await ProductExclusion.deleteMany({ $or: or });
  return result.deletedCount ?? 0;
}
