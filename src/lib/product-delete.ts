import mongoose from 'mongoose';
import Product from '@/models/Product';
import ProductLink from '@/models/ProductLink';
import WarehouseStock from '@/models/WarehouseStock';
import { registerProductExclusion } from '@/lib/product-exclusion';
import { normalizeTenantId } from '@/lib/tenant';

type ProductDoc = {
  _id: unknown;
  sku?: string;
  barcode?: string;
  name?: string;
  variants?: Array<{ sku?: string; barcode?: string }>;
  integrations?: {
    trendyol?: { productId?: string; productMainId?: string };
  };
};

function collectExclusionKeys(product: ProductDoc): Array<{
  sku?: string;
  barcode?: string;
  trendyolProductId?: string;
  trendyolProductMainId?: string;
  stockCode?: string;
  productName?: string;
}> {
  const keys: Array<{
    sku?: string;
    barcode?: string;
    trendyolProductId?: string;
    trendyolProductMainId?: string;
    stockCode?: string;
    productName?: string;
  }> = [];

  const sku = String(product.sku ?? '').trim();
  const barcode = String(product.barcode ?? '').trim();
  const trendyolProductId = String(product.integrations?.trendyol?.productId ?? '').trim();
  const trendyolProductMainId = String(
    product.integrations?.trendyol?.productMainId ?? ''
  ).trim();

  keys.push({
    sku,
    barcode,
    trendyolProductId,
    trendyolProductMainId,
    stockCode: sku,
    productName: String(product.name ?? ''),
  });

  for (const v of product.variants ?? []) {
    const vSku = String(v.sku ?? '').trim();
    const vBarcode = String(v.barcode ?? '').trim();
    if (vSku || vBarcode) {
      keys.push({
        sku: vSku,
        barcode: vBarcode,
        trendyolProductId,
        trendyolProductMainId,
        stockCode: vSku,
        productName: String(product.name ?? ''),
      });
    }
  }

  return keys;
}

/** Silinen ürünlerin depo stok, link ve kanal tekrar içe aktarım kayıtlarını temizle */
export async function deleteProductsWithCleanup(
  ids: string[],
  tenantId?: string
): Promise<{
  deletedCount: number;
  exclusionsRegistered: number;
  warehouseRowsRemoved: number;
  linksRemoved: number;
  orphanWarehouseRowsRemoved: number;
}> {
  const objectIds = ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (objectIds.length === 0) {
    return {
      deletedCount: 0,
      exclusionsRegistered: 0,
      warehouseRowsRemoved: 0,
      linksRemoved: 0,
      orphanWarehouseRowsRemoved: 0,
    };
  }

  const products = (await Product.find({ _id: { $in: objectIds } }).lean()) as ProductDoc[];

  let exclusionsRegistered = 0;
  for (const product of products) {
    for (const keys of collectExclusionKeys(product)) {
      await registerProductExclusion(keys);
      exclusionsRegistered++;
    }
  }

  const matchKeys = new Set<string>();
  for (const product of products) {
    const sku = String(product.sku ?? '').trim();
    const barcode = String(product.barcode ?? '').trim();
    if (sku) matchKeys.add(sku);
    if (barcode) matchKeys.add(barcode);
    for (const v of product.variants ?? []) {
      const vSku = String(v.sku ?? '').trim();
      const vBarcode = String(v.barcode ?? '').trim();
      if (vSku) matchKeys.add(vSku);
      if (vBarcode) matchKeys.add(vBarcode);
    }
  }
  const keysArr = [...matchKeys];

  const whResult = await WarehouseStock.deleteMany({ productId: { $in: objectIds } });

  const tid = normalizeTenantId(tenantId);
  const linkFilter: Record<string, unknown> = {
    tenantId: tid,
    $or: [
      { productId: { $in: objectIds } },
      ...(keysArr.length ? [{ matchKey: { $in: keysArr } }] : []),
    ],
  };
  const linkResult = await ProductLink.deleteMany(linkFilter);

  const deleteResult = await Product.deleteMany({ _id: { $in: objectIds } });

  const liveIds = new Set(
    (await Product.find({}).select('_id').lean()).map((p) => String(p._id))
  );
  const orphanRows = await WarehouseStock.find({}).select('productId').lean();
  const orphanIds = orphanRows
    .map((r) => String(r.productId))
    .filter((id) => id && !liveIds.has(id));
  let orphanWarehouseRowsRemoved = 0;
  if (orphanIds.length > 0) {
    const orphanObjectIds = [
      ...new Set(orphanIds.filter((id) => mongoose.Types.ObjectId.isValid(id))),
    ].map((id) => new mongoose.Types.ObjectId(id));
    const orphanResult = await WarehouseStock.deleteMany({
      productId: { $in: orphanObjectIds },
    });
    orphanWarehouseRowsRemoved = orphanResult.deletedCount ?? 0;
  }

  return {
    deletedCount: deleteResult.deletedCount ?? 0,
    exclusionsRegistered,
    warehouseRowsRemoved: whResult.deletedCount ?? 0,
    linksRemoved: linkResult.deletedCount ?? 0,
    orphanWarehouseRowsRemoved,
  };
}
