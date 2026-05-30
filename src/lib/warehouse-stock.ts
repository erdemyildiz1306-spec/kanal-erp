import Product from '@/models/Product';
import Order from '@/models/Order';
import StockMovement from '@/models/StockMovement';
import Warehouse from '@/models/Warehouse';
import WarehouseStock from '@/models/WarehouseStock';
import { normalizeTenantId, DEFAULT_TENANT_ID } from '@/lib/tenant';

export const MAIN_WAREHOUSE_ID = 'main';

export async function ensureMainWarehouse(tenantId?: string) {
  const tid = normalizeTenantId(tenantId);
  let wh = await Warehouse.findOne({ tenantId: tid, warehouseId: MAIN_WAREHOUSE_ID });
  if (!wh) {
    wh = await Warehouse.create({
      tenantId: tid,
      warehouseId: MAIN_WAREHOUSE_ID,
      name: 'Ana Depo',
      code: 'MAIN',
      isDefault: true,
    });
  }
  return wh;
}

export async function listWarehouses(tenantId?: string) {
  const tid = normalizeTenantId(tenantId);
  await ensureMainWarehouse(tid);
  return Warehouse.find({ tenantId: tid }).sort({ isDefault: -1, name: 1 }).lean();
}

/** Ürün stok toplamlarını tüm depolardan yeniden hesapla */
export async function syncProductStockFromWarehouses(productId: string) {
  await migrateOrphanVariantWarehouseRows(productId);
  await ensureAllVariantWarehouseRows(productId);

  const product = await Product.findById(productId);
  if (!product) return null;

  const rows = await WarehouseStock.find({ productId }).lean();

  if (product.hasVariants && Array.isArray(product.variants) && product.variants.length) {
    const variants = product.variants.map((v: { sku?: string; barcode?: string; stock?: number }) => {
      const vSku = String(v.sku ?? '').trim();
      const total = rows
        .filter((r) => String(r.variantSku ?? '') === vSku)
        .reduce((a, r) => a + Math.max(0, Number(r.stock) || 0), 0);
      const prev = Math.max(0, Number(v.stock) || 0);
      /** Depo satırı yoksa ürün dokümanındaki stoku koru (diğer varyantları sıfırlama) */
      const stock = total > 0 || rows.some((r) => String(r.variantSku ?? '') === vSku) ? total : prev;
      return { ...v, stock };
    });
    product.variants = variants;
    product.stock = variants.reduce(
      (a: number, v: { stock?: number }) => a + Math.max(0, Number(v.stock) || 0),
      0
    );
    product.markModified('variants');
  } else {
    const total = rows
      .filter((r) => !String(r.variantSku ?? '').trim())
      .reduce((a, r) => a + Math.max(0, Number(r.stock) || 0), 0);
    product.stock = total;
  }

  await product.save();
  return product;
}

type MatchLike = {
  product: {
    _id: unknown;
    hasVariants?: boolean;
    variants?: Array<{ sku?: string; barcode?: string; stock?: number }>;
    sku?: string;
    barcode?: string;
    stock?: number;
  };
  variantIndex: number;
  matchedSku: string;
  matchedBarcode: string;
};

function normalizeSizeToken(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sizeLabelMatchesProductName(sizeLabel: string, productName: string): boolean {
  const sl = normalizeSizeToken(sizeLabel);
  const pn = normalizeSizeToken(productName);
  if (!sl || !pn) return false;
  if (pn.includes(sl)) return true;

  const slCore = sl.replace(/\s*yas\b/g, '').trim();
  if (slCore && pn.includes(slCore)) return true;

  const ageInLabel = sl.match(/\d+\s*[-–/]\s*\d+/);
  if (ageInLabel) {
    const normalized = ageInLabel[0].replace(/\s+/g, '').replace('/', '-');
    if (pn.replace(/\s+/g, '').includes(normalized)) return true;
  }

  return false;
}

function matchVariantSkuFromOrderLine(
  variants: Array<{ sku?: string; barcode?: string; sizeLabel?: string; colorLabel?: string }>,
  line: { productName?: string; sku?: string; barcode?: string }
): string {
  const barcode = String(line.barcode ?? '').trim();
  if (barcode) {
    const hit = variants.find((v) => String(v.barcode ?? '').trim() === barcode);
    if (hit) return String(hit.sku ?? '');
  }

  const sku = String(line.sku ?? '').trim();
  if (sku) {
    const hit = variants.find((v) => String(v.sku ?? '').trim() === sku);
    if (hit) return String(hit.sku ?? '');
  }

  const productName = String(line.productName ?? '').trim();
  if (productName) {
    for (const v of variants) {
      const sizeLabel = String(v.sizeLabel ?? '').trim();
      const colorLabel = String(v.colorLabel ?? '').trim();
      if (sizeLabel && sizeLabelMatchesProductName(sizeLabel, productName)) {
        return String(v.sku ?? '');
      }
      if (colorLabel && normalizeSizeToken(productName).includes(normalizeSizeToken(colorLabel))) {
        return String(v.sku ?? '');
      }
    }
  }

  return '';
}

export { matchVariantSkuFromOrderLine };

async function inferVariantSkuForOrphanStock(
  productId: string,
  variants: Array<{ sku?: string; barcode?: string; sizeLabel?: string }>,
  orphanSku: string
): Promise<string> {
  const lastMove = await StockMovement.findOne({
    productId,
    delta: { $lt: 0 },
    reason: { $in: ['order', 'webhook'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (lastMove?.variantSku) {
    const fromMove = String(lastMove.variantSku).trim();
    if (variants.some((v) => String(v.sku ?? '').trim() === fromMove)) {
      return fromMove;
    }
  }

  const ref = String(lastMove?.reference ?? '').trim();
  if (ref) {
    const order = await Order.findOne({ orderNumber: ref }).lean();
    const items =
      (order as { items?: Array<{ productName?: string; sku?: string; barcode?: string }> } | null)
        ?.items ?? [];
    for (const line of items) {
      const lineSku = String(line.sku ?? '').trim();
      if (orphanSku && lineSku && lineSku !== orphanSku) continue;
      const matched = matchVariantSkuFromOrderLine(variants, line);
      if (matched) return matched;
    }
    for (const line of items) {
      const matched = matchVariantSkuFromOrderLine(variants, line);
      if (matched) return matched;
    }
  }

  const idxByOrphanSku = variants.findIndex(
    (v) => String(v.sku ?? '').trim() === orphanSku
  );
  if (idxByOrphanSku >= 0) return String(variants[idxByOrphanSku].sku ?? '');

  return String(variants[0]?.sku ?? '');
}

async function splitOrphanStockToVariants(input: {
  warehouseId: string;
  productId: string;
  orphanStock: number;
  variants: Array<{ sku?: string; barcode?: string; stock?: number }>;
}) {
  const { warehouseId, productId, orphanStock, variants } = input;
  if (orphanStock <= 0 || !variants.length) return;

  const weights = variants.map((v) => Math.max(0, Number(v.stock) || 0));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let remaining = orphanStock;

  for (let i = 0; i < variants.length; i++) {
    const vSku = String(variants[i].sku ?? '').trim();
    if (!vSku) continue;

    let share =
      totalWeight > 0
        ? i === variants.length - 1
          ? remaining
          : Math.floor(orphanStock * (weights[i]! / totalWeight))
        : i === variants.length - 1
          ? remaining
          : Math.floor(orphanStock / variants.length);

    share = Math.max(0, Math.min(share, remaining));
    remaining -= share;

    if (share <= 0) continue;

    await WarehouseStock.findOneAndUpdate(
      { warehouseId, productId, variantSku: vSku },
      {
        $setOnInsert: {
          sku: vSku,
          barcode: String(variants[i]?.barcode ?? ''),
        },
        $inc: { stock: share },
      },
      { upsert: true }
    );
  }
}

/** Varyantlı ürünlerde variantSku boş kalan hatalı depo satırlarını düzeltir. */
export async function migrateOrphanVariantWarehouseRows(
  productId: string
): Promise<boolean> {
  const product = await Product.findById(productId);
  if (!product?.hasVariants || !product.variants?.length) return false;

  const orphans = await WarehouseStock.find({ productId, variantSku: '' });
  if (!orphans.length) return false;

  const variants = product.variants;
  let changed = false;

  for (const orphan of orphans) {
    const orphanStock = Math.max(0, Number(orphan.stock) || 0);
    const orphanSku = String(orphan.sku ?? '').trim();
    const parentSku = String(product.sku ?? '').trim();

    if (orphanStock > 0 && parentSku && orphanSku === parentSku) {
      await splitOrphanStockToVariants({
        warehouseId: String(orphan.warehouseId),
        productId,
        orphanStock,
        variants,
      });
      await orphan.deleteOne();
      changed = true;
      continue;
    }

    const targetVariantSku = await inferVariantSkuForOrphanStock(
      productId,
      variants,
      orphanSku
    );

    if (!targetVariantSku) {
      await orphan.deleteOne();
      changed = true;
      continue;
    }

    const variant = variants.find(
      (v: { sku?: string; barcode?: string }) =>
        String(v.sku ?? '') === targetVariantSku
    );
    if (orphanStock > 0) {
      await WarehouseStock.findOneAndUpdate(
        {
          warehouseId: orphan.warehouseId,
          productId,
          variantSku: targetVariantSku,
        },
        {
          $setOnInsert: {
            sku: targetVariantSku,
            barcode: String(variant?.barcode ?? ''),
          },
          $inc: { stock: orphanStock },
        },
        { upsert: true }
      );
    }

    await orphan.deleteOne();
    changed = true;
  }

  return changed;
}

/** Liste yüklemesinde toplu yetim satır onarımı */
export async function repairOrphanVariantWarehouseStockBatch(
  productIds: string[]
): Promise<number> {
  const ids = [...new Set(productIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return 0;

  const orphanProductIds = await WarehouseStock.distinct('productId', {
    productId: { $in: ids },
    variantSku: '',
  });

  let repaired = 0;
  for (const pid of orphanProductIds) {
    const migrated = await migrateOrphanVariantWarehouseRows(String(pid));
    if (migrated) {
      await syncProductStockFromWarehouses(String(pid));
      repaired++;
    }
  }
  return repaired;
}

/**
 * Varyantlı ürünlerde eksik depo satırlarını ürün dokümanından oluşturur.
 * Mevcut satırlara dokunmaz — yalnızca $setOnInsert.
 */
export async function ensureAllVariantWarehouseRows(
  productId: string,
  warehouseId: string = MAIN_WAREHOUSE_ID
): Promise<void> {
  await ensureMainWarehouse();
  const product = await Product.findById(productId);
  if (!product?.hasVariants || !product.variants?.length) return;

  for (const v of product.variants) {
    const variantSku = String(v.sku ?? '').trim();
    if (!variantSku) continue;

    await WarehouseStock.findOneAndUpdate(
      { warehouseId, productId: product._id, variantSku },
      {
        $setOnInsert: {
          sku: variantSku,
          barcode: String(v.barcode ?? ''),
          stock: Math.max(0, Number(v.stock) || 0),
        },
      },
      { upsert: true }
    );
  }
}

export async function ensureWarehouseStockRow(
  warehouseId: string,
  match: MatchLike
): Promise<{ stock: number }> {
  const p = match.product;

  if (p.hasVariants && p.variants?.length && match.variantIndex < 0) {
    throw new Error(
      `Varyantlı ürün için beden/varyant SKU veya barkod gerekli (${String(p.sku ?? '')})`
    );
  }

  const variantSku =
    match.variantIndex >= 0 && p.variants?.[match.variantIndex]
      ? String(p.variants[match.variantIndex].sku ?? '')
      : '';
  const sku = match.matchedSku || String(p.sku ?? '');
  const barcode = match.matchedBarcode || String(p.barcode ?? '');

  let row = await WarehouseStock.findOne({
    warehouseId,
    productId: p._id,
    variantSku,
  });

  if (!row) {
    const initial =
      match.variantIndex >= 0 && p.variants?.[match.variantIndex]
        ? Number(p.variants[match.variantIndex].stock) || 0
        : Number(p.stock) || 0;
    row = await WarehouseStock.create({
      warehouseId,
      productId: p._id,
      sku,
      barcode,
      variantSku,
      stock: initial,
    });
  }

  return { stock: Number(row.stock) || 0 };
}

export async function adjustWarehouseStock(input: {
  warehouseId: string;
  match: MatchLike;
  delta: number;
}): Promise<number> {
  const { warehouseId, match, delta } = input;
  const productId = String(match.product._id);
  await migrateOrphanVariantWarehouseRows(productId);
  await ensureAllVariantWarehouseRows(productId, warehouseId);
  await ensureWarehouseStockRow(warehouseId, match);
  const variantSku =
    match.variantIndex >= 0 && match.product.variants?.[match.variantIndex]
      ? String(match.product.variants[match.variantIndex].sku ?? '')
      : '';

  const qty = Math.floor(delta);
  const filter = { warehouseId, productId: match.product._id, variantSku };

  if (qty === 0) {
    const row = await WarehouseStock.findOne(filter).lean();
    return Math.max(0, Number(row?.stock) || 0);
  }

  if (qty < 0) {
    const abs = Math.abs(qty);
    const updated = await WarehouseStock.findOneAndUpdate(
      { ...filter, stock: { $gte: abs } },
      { $inc: { stock: qty } },
      { new: true }
    );
    if (!updated) {
      throw new Error('Yetersiz stok');
    }
    await syncProductStockFromWarehouses(String(match.product._id));
    return Math.max(0, Number(updated.stock) || 0);
  }

  const updated = await WarehouseStock.findOneAndUpdate(
    filter,
    { $inc: { stock: qty } },
    { new: true }
  );
  if (!updated) return 0;

  await syncProductStockFromWarehouses(String(match.product._id));
  return Math.max(0, Number(updated.stock) || 0);
}

export async function getWarehouseStockSummary(warehouseId: string) {
  const rows = await WarehouseStock.find({ warehouseId }).lean();
  const units = rows.reduce((a, r) => a + Math.max(0, Number(r.stock) || 0), 0);
  const skuSet = new Set(rows.map((r) => String(r.productId)));
  return { productCount: skuSet.size, totalUnits: units, rows: rows.length };
}

export async function seedWarehouseFromProduct(warehouseId: string, productId: string) {
  const product = await Product.findById(productId);
  if (!product) return;

  if (product.hasVariants && product.variants?.length) {
    for (const v of product.variants) {
      await WarehouseStock.findOneAndUpdate(
        {
          warehouseId,
          productId: product._id,
          variantSku: String(v.sku ?? ''),
        },
        {
          $setOnInsert: {
            sku: String(v.sku ?? product.sku),
            barcode: String(v.barcode ?? ''),
            stock: Math.max(0, Number(v.stock) || 0),
          },
        },
        { upsert: true }
      );
    }
  } else {
    await WarehouseStock.findOneAndUpdate(
      { warehouseId, productId: product._id, variantSku: '' },
      {
        $setOnInsert: {
          sku: String(product.sku ?? ''),
          barcode: String(product.barcode ?? ''),
          stock: Math.max(0, Number(product.stock) || 0),
        },
      },
      { upsert: true }
    );
  }
}
