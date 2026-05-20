import Product from '@/models/Product';
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

export async function ensureWarehouseStockRow(
  warehouseId: string,
  match: MatchLike
): Promise<{ stock: number }> {
  const p = match.product;
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
