import Product from '@/models/Product';
import Order from '@/models/Order';
import StockMovement from '@/models/StockMovement';
import Warehouse from '@/models/Warehouse';
import WarehouseStock from '@/models/WarehouseStock';

export const MAIN_WAREHOUSE_ID = 'main';

export async function ensureMainWarehouse() {
  let wh = await Warehouse.findOne({ warehouseId: MAIN_WAREHOUSE_ID });
  if (!wh) {
    wh = await Warehouse.create({
      warehouseId: MAIN_WAREHOUSE_ID,
      name: 'Ana Depo',
      code: 'MAIN',
      isDefault: true,
    });
  }
  return wh;
}

export async function listWarehouses() {
  await ensureMainWarehouse();
  return Warehouse.find({}).sort({ isDefault: -1, name: 1 }).lean();
}

/** Ürün stok toplamlarını tüm depolardan yeniden hesapla */
export async function syncProductStockFromWarehouses(productId: string) {
  await migrateOrphanVariantWarehouseRows(productId);

  const product = await Product.findById(productId);
  if (!product) return null;

  const rows = await WarehouseStock.find({ productId }).lean();

  if (product.hasVariants && Array.isArray(product.variants) && product.variants.length) {
    const variants = product.variants.map((v: { sku?: string; barcode?: string; stock?: number }) => {
      const vSku = String(v.sku ?? '').trim();
      const total = rows
        .filter((r) => String(r.variantSku ?? '') === vSku)
        .reduce((a, r) => a + Math.max(0, Number(r.stock) || 0), 0);
      return { ...v, stock: total };
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

function matchVariantSkuFromOrderLine(
  variants: Array<{ sku?: string; barcode?: string; sizeLabel?: string }>,
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

  const productName = String(line.productName ?? '').toLowerCase();
  if (productName) {
    for (const v of variants) {
      const sizeLabel = String(v.sizeLabel ?? '').trim().toLowerCase();
      if (sizeLabel && productName.includes(sizeLabel)) {
        return String(v.sku ?? '');
      }
    }
  }

  return '';
}

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
  await ensureWarehouseStockRow(warehouseId, match);
  const variantSku =
    match.variantIndex >= 0 && match.product.variants?.[match.variantIndex]
      ? String(match.product.variants[match.variantIndex].sku ?? '')
      : '';

  const row = await WarehouseStock.findOneAndUpdate(
    { warehouseId, productId: match.product._id, variantSku },
    {},
    { new: true }
  );
  if (!row) return 0;

  row.stock = Math.max(0, Math.floor(Number(row.stock) || 0) + Math.floor(delta));
  await row.save();
  await syncProductStockFromWarehouses(String(match.product._id));
  return row.stock;
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
