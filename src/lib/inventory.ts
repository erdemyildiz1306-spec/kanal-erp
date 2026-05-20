import type mongoose from 'mongoose';
import Product from '@/models/Product';
import ProductLink from '@/models/ProductLink';
import StockMovement from '@/models/StockMovement';
import WarehouseStock from '@/models/WarehouseStock';
import { barcodeLookupKeys } from '@/lib/barcode-normalize';
import {
  adjustWarehouseStock,
  ensureMainWarehouse,
  MAIN_WAREHOUSE_ID,
  matchVariantSkuFromOrderLine,
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
  const barcodeKeys = b ? barcodeLookupKeys(b) : [];

  const matchVariantBarcode = (
    product: ProductMatch['product'],
    keys: string[]
  ): number => {
    const variants = product.variants ?? [];
    return variants.findIndex((v: { barcode?: string }) => {
      const vb = String(v.barcode ?? '').trim();
      if (!vb) return false;
      return barcodeLookupKeys(vb).some((k) => keys.includes(k));
    });
  };

  if (barcodeKeys.length > 0) {
    for (const key of barcodeKeys) {
      const link = await ProductLink.findOne({ matchType: 'barcode', matchKey: key }).lean();
      if (link?.productId) {
        const linked = await Product.findById(link.productId);
        if (linked) {
          const idx = matchVariantBarcode(linked as ProductMatch['product'], barcodeKeys);
          const variants = linked.variants ?? [];
          return {
            product: linked as ProductMatch['product'],
            variantIndex: idx >= 0 ? idx : -1,
            matchedSku:
              idx >= 0
                ? String(variants[idx]?.sku ?? linked.sku ?? '')
                : String(linked.sku ?? ''),
            matchedBarcode: key,
          };
        }
      }
    }

    const byVariant = await Product.findOne({ 'variants.barcode': { $in: barcodeKeys } });
    if (byVariant) {
      const idx = matchVariantBarcode(byVariant as ProductMatch['product'], barcodeKeys);
      const variants = byVariant.variants ?? [];
      return {
        product: byVariant as ProductMatch['product'],
        variantIndex: idx >= 0 ? idx : 0,
        matchedSku:
          idx >= 0 ? String(variants[idx]?.sku ?? byVariant.sku ?? '') : String(byVariant.sku ?? ''),
        matchedBarcode:
          idx >= 0 ? String(variants[idx]?.barcode ?? b) : String(byVariant.barcode ?? b),
      };
    }

    const byParent = await Product.findOne({ barcode: { $in: barcodeKeys } });
    if (byParent) {
      if (byParent.hasVariants && byParent.variants?.length) {
        const idx = matchVariantBarcode(byParent as ProductMatch['product'], barcodeKeys);
        const variants = byParent.variants ?? [];
        if (idx >= 0) {
          return {
            product: byParent as ProductMatch['product'],
            variantIndex: idx,
            matchedSku: String(variants[idx]?.sku ?? ''),
            matchedBarcode: String(variants[idx]?.barcode ?? b),
          };
        }
      }
      return {
        product: byParent as ProductMatch['product'],
        variantIndex: -1,
        matchedSku: String(byParent.sku ?? ''),
        matchedBarcode: String(byParent.barcode ?? b),
      };
    }

    const whRow = await WarehouseStock.findOne({ barcode: { $in: barcodeKeys } }).lean();
    if (whRow?.productId) {
      const fromWarehouse = await Product.findById(whRow.productId);
      if (fromWarehouse) {
        const idx = matchVariantBarcode(fromWarehouse as ProductMatch['product'], barcodeKeys);
        const variants = fromWarehouse.variants ?? [];
        const variantSku = String(whRow.variantSku ?? '').trim();
        const idxBySku =
          variantSku && idx < 0
            ? variants.findIndex((v: { sku?: string }) => String(v.sku ?? '').trim() === variantSku)
            : idx;
        let useIdx = idxBySku >= 0 ? idxBySku : idx;
        if (useIdx < 0 && fromWarehouse.hasVariants && variants.length === 1) {
          useIdx = 0;
        }
        return {
          product: fromWarehouse as ProductMatch['product'],
          variantIndex: useIdx >= 0 ? useIdx : -1,
          matchedSku:
            useIdx >= 0
              ? String(variants[useIdx]?.sku ?? fromWarehouse.sku ?? whRow.sku ?? '')
              : String(whRow.sku ?? fromWarehouse.sku ?? ''),
          matchedBarcode: String(whRow.barcode ?? b),
        };
      }
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

    const bySku = await Product.findOne({ sku: s });
    if (bySku) {
      return {
        product: bySku as ProductMatch['product'],
        variantIndex: -1,
        matchedSku: s,
        matchedBarcode: String(bySku.barcode ?? ''),
      };
    }
  }

  return null;
}

/** Varyantlı üründe ana SKU ile eşleşince doğru beden/varyant satırını çöz. */
export function resolveVariantMatch(
  match: ProductMatch,
  sku?: string,
  barcode?: string,
  productName?: string
): ProductMatch {
  const p = match.product;
  if (!p.hasVariants || !p.variants?.length) return match;
  if (match.variantIndex >= 0) return match;

  const s = String(sku ?? match.matchedSku ?? '').trim();
  const b = String(barcode ?? match.matchedBarcode ?? '').trim();
  const variants = p.variants ?? [];

  if (b) {
    const keys = barcodeLookupKeys(b);
    for (let i = 0; i < variants.length; i++) {
      const vb = String(variants[i].barcode ?? '').trim();
      if (vb && barcodeLookupKeys(vb).some((k) => keys.includes(k))) {
        return {
          ...match,
          variantIndex: i,
          matchedSku: String(variants[i].sku ?? ''),
          matchedBarcode: vb,
        };
      }
    }
  }

  if (s) {
    const idx = variants.findIndex((v) => String(v.sku ?? '').trim() === s);
    if (idx >= 0) {
      return {
        ...match,
        variantIndex: idx,
        matchedSku: s,
        matchedBarcode: String(variants[idx].barcode ?? ''),
      };
    }
  }

  const nameHint = String(productName ?? '').trim();
  if (nameHint) {
    const vSku = matchVariantSkuFromOrderLine(variants, {
      productName: nameHint,
      sku: s,
      barcode: b,
    });
    if (vSku) {
      const idx = variants.findIndex((v) => String(v.sku ?? '').trim() === vSku);
      if (idx >= 0) {
        return {
          ...match,
          variantIndex: idx,
          matchedSku: vSku,
          matchedBarcode: String(variants[idx].barcode ?? ''),
        };
      }
    }
  }

  if (variants.length === 1) {
    return {
      ...match,
      variantIndex: 0,
      matchedSku: String(variants[0].sku ?? ''),
      matchedBarcode: String(variants[0].barcode ?? ''),
    };
  }

  return match;
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
  sku?: string;
  barcode?: string;
  productName?: string;
}): Promise<ProductMatch['product']> {
  const match = resolveVariantMatch(
    input.match,
    input.sku,
    input.barcode,
    input.productName
  );
  const { delta } = input;
  const qty = Math.floor(Number(delta) || 0);
  if (qty === 0) return match.product;

  if (
    match.product.hasVariants &&
    match.product.variants?.length &&
    match.variantIndex < 0
  ) {
    throw new Error(
      `Varyantlı ürün için beden/varyant SKU veya barkod gerekli (${String(match.product.sku ?? '')})`
    );
  }

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
  productName?: string;
}): Promise<boolean> {
  const ref = String(input.reference ?? '').trim();
  if (!ref) return false;

  const b = String(input.barcode ?? '').trim();
  const s = String(input.sku ?? '').trim();
  const or: Record<string, unknown>[] = [];
  if (b) {
    for (const key of barcodeLookupKeys(b)) {
      or.push({ barcode: key });
    }
  }
  if (s) or.push({ variantSku: s }, { sku: s });

  if (or.length === 0) return false;

  const hit = await StockMovement.exists({
    reference: ref,
    delta: { $lt: 0 },
    reason: { $in: ['order', 'webhook'] },
    $or: or,
  });
  if (hit) return true;

  const raw = await findProductBySkuOrBarcode(s, b);
  if (!raw) return false;
  const resolved = resolveVariantMatch(raw, s, b, input.productName);
  if (resolved.variantIndex < 0) return false;

  const vSku = String(resolved.product.variants?.[resolved.variantIndex]?.sku ?? '').trim();
  if (!vSku) return false;

  const byVariant = await StockMovement.exists({
    reference: ref,
    delta: { $lt: 0 },
    reason: { $in: ['order', 'webhook'] },
    variantSku: vSku,
  });
  return Boolean(byVariant);
}

export async function decrementForOrderItem(input: {
  sku?: string;
  barcode?: string;
  productName?: string;
  quantity: number;
  reason: string;
  reference?: string;
  userId?: string;
  userName?: string;
  warehouseId?: string;
}): Promise<ProductMatch['product'] | null> {
  const raw = await findProductBySkuOrBarcode(input.sku, input.barcode);
  if (!raw) return null;
  const match = resolveVariantMatch(raw, input.sku, input.barcode, input.productName);
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 1));
  return adjustProductStock({
    match,
    delta: -qty,
    reason: input.reason,
    reference: input.reference,
    userId: input.userId,
    userName: input.userName,
    warehouseId: input.warehouseId,
    sku: input.sku,
    barcode: input.barcode,
    productName: input.productName,
  });
}

/** Sipariş satırı için idempotent stok düşümü — çift düşümü engeller. */
export async function decrementForOrderItemIfNotApplied(input: {
  sku?: string;
  barcode?: string;
  productName?: string;
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
    productName: input.productName,
  });
  if (already) {
    return { product: null, skipped: true };
  }
  const product = await decrementForOrderItem(input);
  return { product, skipped: false };
}
