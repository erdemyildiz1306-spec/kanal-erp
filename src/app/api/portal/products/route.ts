import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import { getSessionFromRequest } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';
import {
  getWarehouseStockMap,
  stockFromWarehouseMap,
} from '@/lib/portal-orders';
import { MAIN_WAREHOUSE_ID } from '@/lib/warehouse-stock';
import { buildTurkishSearchRegex } from '@/lib/search-text';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    if (!session || session.role !== 'customer') {
      return NextResponse.json({ success: false, error: 'Müşteri oturumu gerekli.' }, { status: 401 });
    }

    const { tenantId } = tenantScope(session);
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get('q') ?? '').trim();
    const category = String(searchParams.get('category') ?? '').trim();
    const inStockOnly = searchParams.get('inStock') === '1';
    const warehouseId = String(searchParams.get('warehouseId') ?? MAIN_WAREHOUSE_ID);

    const filter: Record<string, unknown> = {
      tenantId,
      active: { $ne: false },
      customerVisible: { $ne: false },
    };

    if (q) {
      const regex = buildTurkishSearchRegex(q).source;
      filter.$or = [
        { name: { $regex: regex, $options: 'i' } },
        { sku: { $regex: regex, $options: 'i' } },
        { barcode: { $regex: regex, $options: 'i' } },
        { 'variants.sku': { $regex: regex, $options: 'i' } },
        { 'variants.barcode': { $regex: regex, $options: 'i' } },
      ];
    }
    if (category && category !== 'Tümü') {
      filter.category = category;
    }

    const products = await Product.find(filter)
      .select('name sku barcode stock price images hasVariants variants category')
      .sort({ name: 1 })
      .limit(200)
      .lean();

    const productIds = products.map((p) => String(p._id));
    const stockMap = await getWarehouseStockMap(productIds, warehouseId);

    const items = [];
    for (const p of products) {
      const pid = String(p._id);
      const variants: Array<{ sku?: string; barcode?: string; stock: number }> = p.hasVariants
        ? (p.variants ?? []).map((v: { sku?: string; barcode?: string; stock?: number }) => {
            const vSku = String(v.sku ?? '');
            return {
              sku: v.sku,
              barcode: v.barcode,
              stock: stockFromWarehouseMap(stockMap, pid, p, vSku),
            };
          })
        : [];

      let stock = stockFromWarehouseMap(stockMap, pid, p);
      if (p.hasVariants && variants.length) {
        stock = variants.reduce((a: number, v) => a + (Number(v.stock) || 0), 0);
      }

      if (inStockOnly && stock <= 0) continue;

      items.push({
        id: pid,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category || '',
        price: Number(p.price) || 0,
        stock,
        image:
          Array.isArray(p.images) && p.images[0]
            ? typeof p.images[0] === 'string'
              ? p.images[0]
              : (p.images[0] as { url?: string }).url
            : null,
        hasVariants: Boolean(p.hasVariants),
        variants,
      });
    }

    const categories = [
      'Tümü',
      ...Array.from(new Set(products.map((p) => String(p.category || '').trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, 'tr')
      ),
    ];

    return NextResponse.json({ success: true, products: items, categories });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
