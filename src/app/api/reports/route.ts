import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import Product from '@/models/Product';

function rangeStart(range: string): Date {
  const now = new Date();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  switch (range) {
    case 'Bugün':
      return d;
    case 'Bu Hafta':
      d.setDate(d.getDate() - 7);
      return d;
    case 'Son 3 Ay':
      d.setMonth(d.getMonth() - 3);
      return d;
    case 'Bu Yıl':
      return new Date(now.getFullYear(), 0, 1);
    case 'Bu Ay':
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'Bu Ay';
    const since = rangeStart(range);

    const orders = await Order.find({
      createdAt: { $gte: since },
      status: { $ne: 'İptal Edildi' },
    }).lean();

    let totalRevenue = 0;
    let totalProfit = 0;
    let trendyolRevenue = 0;
    let webRevenue = 0;
    const productSales = new Map<
      string,
      { name: string; sales: number; revenue: number }
    >();

    for (const o of orders) {
      const amt = Number(o.totalAmount) || 0;
      const profit = Number(o.profitAmount) || 0;
      totalRevenue += amt;
      totalProfit += profit;
      const p = String(o.platform ?? '').toLowerCase();
      if (p === 'trendyol') trendyolRevenue += amt;
      else webRevenue += amt;

      for (const item of o.items ?? []) {
        const name = String(item.productName ?? item.sku ?? 'Ürün');
        const key = String(item.sku ?? name);
        const prev = productSales.get(key) ?? { name, sales: 0, revenue: 0 };
        prev.sales += Number(item.quantity) || 0;
        prev.revenue += Number(item.totalPrice) || 0;
        productSales.set(key, prev);
      }
    }

    const topProducts = [...productSales.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const skus = topProducts.map((_, i) => [...productSales.keys()][i]).filter(Boolean);
    const stockMap = new Map<string, number>();
    if (skus.length) {
      const products = await Product.find({ sku: { $in: skus } })
        .select('sku stock')
        .lean();
      for (const p of products) {
        stockMap.set(String(p.sku), Number(p.stock) || 0);
      }
    }

    const topWithStock = topProducts.map((row, idx) => {
      const sku = [...productSales.entries()].sort((a, b) => b[1].revenue - a[1].revenue)[idx]?.[0];
      return {
        ...row,
        stock: sku ? stockMap.get(sku) ?? 0 : 0,
      };
    });

    const lowStock = await Product.find({
      $expr: { $lte: ['$stock', '$safetyStock'] },
    })
      .select('name sku stock safetyStock')
      .sort({ stock: 1 })
      .limit(12)
      .lean();

    return NextResponse.json({
      success: true,
      range,
      kpis: {
        totalRevenue,
        totalProfit,
        orderCount: orders.length,
        trendyolRevenue,
        webRevenue,
        trendyolShare:
          totalRevenue > 0
            ? Math.round((trendyolRevenue / totalRevenue) * 100)
            : 0,
        webShare:
          totalRevenue > 0
            ? Math.round((webRevenue / totalRevenue) * 100)
            : 0,
      },
      topProducts: topWithStock,
      lowStock,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
