import Product from '@/models/Product';
import WarehouseStock from '@/models/WarehouseStock';
import { MAIN_WAREHOUSE_ID } from '@/lib/warehouse-stock';

type ProductStockSource = {
  stock?: number;
  hasVariants?: boolean;
  variants?: Array<{ sku?: string; stock?: number }>;
};

/** Depo stoklarını tek sorguda toplu oku — portal listesi için. */
export async function getWarehouseStockMap(
  productIds: string[],
  warehouseId: string
): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();

  const rows = await WarehouseStock.find({
    warehouseId,
    productId: { $in: productIds },
  })
    .select('productId variantSku stock')
    .lean();

  const map = new Map<string, number>();
  for (const row of rows) {
    const pid = String(row.productId);
    const variantSku = String(row.variantSku ?? '').trim();
    const key = variantSku ? `${pid}::${variantSku}` : pid;
    map.set(key, (map.get(key) ?? 0) + Math.max(0, Number(row.stock) || 0));
  }
  return map;
}

export function stockFromWarehouseMap(
  map: Map<string, number>,
  productId: string,
  product: ProductStockSource,
  variantSku = ''
): number {
  const vSku = String(variantSku ?? '').trim();
  const key = vSku ? `${productId}::${vSku}` : productId;
  if (map.has(key)) return map.get(key)!;

  if (vSku && product.hasVariants) {
    const v = (product.variants ?? []).find((x) => String(x.sku ?? '') === vSku);
    return Math.max(0, Number(v?.stock) || 0);
  }
  return Math.max(0, Number(product.stock) || 0);
}

export async function getProductStockInWarehouse(
  productId: string,
  warehouseId: string,
  variantSku = ''
): Promise<number> {
  const row = await WarehouseStock.findOne({
    warehouseId,
    productId,
    variantSku: variantSku || '',
  })
    .select('stock')
    .lean();
  if (row) return Math.max(0, Number(row.stock) || 0);

  const product = await Product.findById(productId)
    .select('stock hasVariants variants.stock variants.sku')
    .lean();
  if (!product) return 0;
  return stockFromWarehouseMap(new Map(), productId, product, variantSku);
}

export async function resolvePortalLine(input: {
  productId: string;
  sku?: string;
  barcode?: string;
  variantSku?: string;
  quantity: number;
  warehouseId: string;
}) {
  const product = await Product.findById(input.productId);
  if (!product || product.active === false || product.customerVisible === false) {
    return { error: 'Ürün bulunamadı veya portalda kapalı.' as const };
  }

  const qty = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const warehouseId = input.warehouseId || MAIN_WAREHOUSE_ID;
  const variantSku = String(input.variantSku ?? '').trim();

  let sku = String(input.sku ?? product.sku ?? '').trim();
  let barcode = String(input.barcode ?? product.barcode ?? '').trim();
  const productName = product.name;
  let unitPrice = Number(product.price) || 0;

  if (variantSku && product.hasVariants) {
    const v = (product.variants ?? []).find((x: { sku?: string }) => String(x.sku) === variantSku);
    if (!v) return { error: 'Varyant bulunamadı.' as const };
    sku = String(v.sku ?? sku);
    barcode = String(v.barcode ?? barcode);
  }

  const available = await getProductStockInWarehouse(String(product._id), warehouseId, variantSku);
  if (available < qty) {
    return { error: `${productName} için yeterli stok yok (mevcut: ${available}).` as const };
  }

  return {
    line: {
      productId: String(product._id),
      productName,
      sku,
      barcode,
      variantSku,
      quantity: qty,
      unitPrice,
      totalPrice: unitPrice * qty,
      costPrice: Number(product.costPrice) || 0,
    },
  };
}

export function generateB2BOrderNumber() {
  return `B2B-${Date.now().toString(36).toUpperCase()}`;
}
