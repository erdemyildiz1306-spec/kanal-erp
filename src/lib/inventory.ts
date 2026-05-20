import type mongoose from 'mongoose';
import Product from '@/models/Product';
import ProductLink from '@/models/ProductLink';
import StockMovement from '@/models/StockMovement';
import {
  adjustWarehouseStock,
  ensureMainWarehouse,
  MAIN_WAREHOUSE_ID,
} from '@/lib/warehouse-stock';

export type ProductMatch = {
  product: mongoose.Document & {
    _id: unknown;
    sku: string;
    name: string;
    barcode?: string;
    stock: number;
    costPrice?: number;
    price?: number;
    hasVariants?: boolean;
    variants?: Array<{
      sku: string;
      barcode: string;
      stock: number;
    }>;
    save: () => Promise<unknown>;
    markModified: (path: string) => void;
  };
  variantIndex: number;
  matchedSku: string;
  matchedBarcode: string;
};

export async function findProductBySkuOrBarcode(
  sku?: string,
  barcode?: string
): Promise<ProductMatch | null> {
  const s = String(sku ?? '').trim();
  const b = String(barcode ?? '').trim();

  if (b) {
    const link = await ProductLink.findOne({ matchType: 'barcode', matchKey: b }).lean();
    if (link?.productId) {
      const linked = await Product.findById(link.productId);
      if (linked) {
        const variants = linked.variants ?? [];
        const idx = variants.findIndex(
          (v: { barcode?: string }) => String(v.barcode ?? '').trim() === b
        );
        return {
          product: linked as ProductMatch['product'],
          variantIndex: idx >= 0 ? idx : -1,
          matchedSku:
            idx >= 0
              ? String(variants[idx]?.sku ?? linked.sku ?? '')
              : String(linked.sku ?? ''),
          matchedBarcode: b,
        };
      }
    }

    const byParent = await Product.findOne({ barcode: b });
    if (byParent) {
      return {
        product: byParent as ProductMatch['product'],
        variantIndex: -1,
        matchedSku: String(byParent.sku ?? ''),
        matchedBarcode: b,
      };
    }
    const byVariant = await Product.findOne({ 'variants.barcode': b });
    if (byVariant) {
      const variants = byVariant.variants ?? [];
      const idx = variants.findIndex((v: { barcode?: string }) => String(v.barcode ?? '').trim() === b);
      return {
        product: byVariant as ProductMatch['product'],
        variantIndex: idx >= 0 ? idx : 0,
        matchedSku:
          idx >= 0 ? String(variants[idx]?.sku ?? byVariant.sku ?? '') : String(byVariant.sku ?? ''),
        matchedBarcode: b,
      };
    }
  }

  if (s) {
    const link = await ProductLink.findOne({ matchType: 'sku', matchKey: s }).lean();
    if (link?.productId) {
      const linked = await Product.findById(link.productId);
      if (linked) {
        const variants = linked.variants ?? [];
        const idx = variants.findIndex(
          (v: { sku?: string }) => String(v.sku ?? '').trim() === s
        );
        return {
          product: linked as ProductMatch['product'],
          variantIndex: idx >= 0 ? idx : -1,
          matchedSku: s,
          matchedBarcode:
            idx >= 0
              ? String(variants[idx]?.barcode ?? '')
              : String(linked.barcode ?? ''),
        };
      }
    }

    const bySku = await Product.findOne({ sku: s });
    if (bySku) {
      return {
        product: bySku as ProductMatch['product'],
        variantIndex: -1,
        matchedSku: s,
        matchedBarcode: String(bySku.barcode ?? ''),
      };
    }
    const byVariantSku = await Product.findOne({ 'variants.sku': s });
    if (byVariantSku) {
      const variants = byVariantSku.variants ?? [];
      const idx = variants.findIndex((v: { sku?: string }) => String(v.sku ?? '').trim() === s);
      return {
        product: byVariantSku as ProductMatch['product'],
        variantIndex: idx >= 0 ? idx : 0,
        matchedSku: s,
        matchedBarcode:
          idx >= 0 ? String(variants[idx]?.barcode ?? '') : String(byVariantSku.barcode ?? ''),
      };
    }
  }

  return null;
}

export async function recordStockMovement(input: {
  productId: unknown;
  sku: string;
  barcode?: string;
  variantSku?: string;
  delta: number;
  stockAfter: number;
  reason: string;
  reference?: string;
  userId?: string;
  userName?: string;
  note?: string;
}) {
  await StockMovement.create({
    productId: input.productId,
    sku: input.sku,
    barcode: input.barcode ?? '',
    variantSku: input.variantSku ?? '',
    delta: input.delta,
    stockAfter: input.stockAfter,
    reason: input.reason,
    reference: input.reference ?? '',
    userId: input.userId ?? '',
    userName: input.userName ?? '',
    note: input.note ?? '',
  });
}

export async function adjustProductStock(input: {
  match: ProductMatch;
  delta: number;
  reason: string;
  reference?: string;
  userId?: string;
  userName?: string;
  note?: string;
  warehouseId?: string;
}): Promise<ProductMatch['product']> {
  const { match, delta } = input;
  const qty = Math.floor(Number(delta) || 0);
  if (qty === 0) return match.product;

  await ensureMainWarehouse();
  const warehouseId = input.warehouseId || MAIN_WAREHOUSE_ID;

  const stockAfter = await adjustWarehouseStock({
    warehouseId,
    match,
    delta: qty,
  });

  const product = await Product.findById(match.product._id);
  if (!product) return match.product;

  let variantSku = '';
  let variantBarcode = '';
  if (match.variantIndex >= 0 && Array.isArray(product.variants)) {
    const row = product.variants[match.variantIndex];
    if (row) {
      variantSku = String(row.sku ?? '');
      variantBarcode = String(row.barcode ?? '');
    }
  }

  await recordStockMovement({
    productId: product._id,
    sku: variantSku || String(product.sku ?? match.matchedSku),
    barcode: variantBarcode || String(product.barcode ?? match.matchedBarcode),
    variantSku,
    delta: qty,
    stockAfter,
    reason: input.reason,
    reference: input.reference,
    userId: input.userId,
    userName: input.userName,
    note: input.note ? `${input.note} [${warehouseId}]` : `[${warehouseId}]`,
  });

  return product as ProductMatch['product'];
}

export async function orderHasStockDeductions(orderNumber: string): Promise<boolean> {
  const ref = String(orderNumber ?? '').trim();
  if (!ref) return false;
  const count = await StockMovement.countDocuments({
    reference: ref,
    delta: { $lt: 0 },
    reason: { $in: ['order', 'webhook'] },
  });
  return count > 0;
}

/** Aynı sipariş satırı için stok daha önce düşüldüyse tekrar düşmez. */
export async function orderLineStockAlreadyApplied(input: {
  reference?: string;
  sku?: string;
  barcode?: string;
}): Promise<boolean> {
  const ref = String(input.reference ?? '').trim();
  if (!ref) return false;

  const b = String(input.barcode ?? '').trim();
  const s = String(input.sku ?? '').trim();
  const or: Record<string, unknown>[] = [];
  if (b) or.push({ barcode: b });
  if (s) or.push({ variantSku: s }, { sku: s });

  if (or.length === 0) return false;

  const hit = await StockMovement.exists({
    reference: ref,
    delta: { $lt: 0 },
    reason: { $in: ['order', 'webhook'] },
    $or: or,
  });
  return Boolean(hit);
}

export async function decrementForOrderItem(input: {
  sku?: string;
  barcode?: string;
  quantity: number;
  reason: string;
  reference?: string;
  userId?: string;
  userName?: string;
  warehouseId?: string;
}): Promise<ProductMatch['product'] | null> {
  const match = await findProductBySkuOrBarcode(input.sku, input.barcode);
  if (!match) return null;
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 1));
  return adjustProductStock({
    match,
    delta: -qty,
    reason: input.reason,
    reference: input.reference,
    userId: input.userId,
    userName: input.userName,
    warehouseId: input.warehouseId,
  });
}

/** Sipariş satırı için idempotent stok düşümü — çift düşümü engeller. */
export async function decrementForOrderItemIfNotApplied(input: {
  sku?: string;
  barcode?: string;
  quantity: number;
  reason: string;
  reference?: string;
  userId?: string;
  userName?: string;
  warehouseId?: string;
}): Promise<{ product: ProductMatch['product'] | null; skipped: boolean }> {
  const already = await orderLineStockAlreadyApplied({
    reference: input.reference,
    sku: input.sku,
    barcode: input.barcode,
  });
  if (already) {
    return { product: null, skipped: true };
  }
  const product = await decrementForOrderItem(input);
  return { product, skipped: false };
}
