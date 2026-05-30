import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import Order from '@/models/Order';
import { buildTurkishSearchRegex, normalizeSearchQuery } from '@/lib/search-text';
import { getSessionFromRequest } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    const scope = tenantScope(session);

    const { searchParams } = new URL(request.url);
    const q = normalizeSearchQuery(String(searchParams.get('q') ?? ''));
    if (q.length < 2) {
      return NextResponse.json({ success: true, products: [], orders: [] });
    }

    const regex = buildTurkishSearchRegex(q);

    const [products, orders] = await Promise.all([
      Product.find({
        ...scope,
        $or: [
          { name: regex },
          { sku: regex },
          { barcode: regex },
          { description: regex },
          { category: regex },
          { 'variants.sku': regex },
          { 'variants.barcode': regex },
          { 'variants.sizeLabel': regex },
          { 'variants.colorLabel': regex },
        ],
      })
        .select('name sku barcode stock price costPrice hasVariants')
        .limit(10)
        .lean(),
      Order.find({
        ...scope,
        $or: [
          { orderNumber: regex },
          { customerName: regex },
          { 'items.sku': regex },
          { 'items.barcode': regex },
          { 'items.productName': regex },
        ],
      })
        .select('orderNumber customerName status platform totalAmount')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    return NextResponse.json({ success: true, products, orders, query: q });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
