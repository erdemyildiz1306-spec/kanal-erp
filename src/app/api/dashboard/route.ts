import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import Product from '@/models/Product';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

const DAY_LABELS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export async function GET() {
  try {
    await connectToDatabase();

    const since7 = daysAgo(6);
    const orders = await Order.find({
      createdAt: { $gte: since7 },
      status: { $ne: 'İptal Edildi' },
    })
      .select('platform totalAmount profitAmount costAmount createdAt status')
      .lean();

    const productCount = await Product.countDocuments({});
    const criticalStock = await Product.countDocuments({
      $expr: { $lte: ['$stock', '$safetyStock'] },
    });
    const pendingOrders = await Order.countDocuments({
      status: { $in: ['Beklemede', 'Yeni', 'Hazırlanıyor'] },
    });

    const totalSales = orders.reduce(
      (acc, o) => acc + (Number(o.totalAmount) || 0),
      0
    );
    const totalProfit = orders.reduce(
      (acc, o) => acc + (Number(o.profitAmount) || 0),
      0
    );
    const totalCost = orders.reduce(
      (acc, o) => acc + (Number(o.costAmount) || 0),
      0
    );

    const daily: Record<string, { trendyol: number; web: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = daysAgo(6 - i);
      const key = d.toISOString().slice(0, 10);
      daily[key] = { trendyol: 0, web: 0 };
    }

    for (const o of orders) {
      const key = startOfDay(new Date(o.createdAt as Date))
        .toISOString()
        .slice(0, 10);
      if (!daily[key]) continue;
      const amt = Number(o.totalAmount) || 0;
      const p = String(o.platform ?? '').toLowerCase();
      if (p === 'trendyol') daily[key].trendyol += amt;
      else daily[key].web += amt;
    }

    const labels: string[] = [];
    const trendyolSeries: number[] = [];
    const webSeries: number[] = [];
    let tyTotal = 0;
    let webTotal = 0;

    for (let i = 0; i < 7; i++) {
      const d = daysAgo(6 - i);
      const key = d.toISOString().slice(0, 10);
      labels.push(DAY_LABELS[d.getDay()]!);
      const row = daily[key] ?? { trendyol: 0, web: 0 };
      trendyolSeries.push(Math.round(row.trendyol));
      webSeries.push(Math.round(row.web));
      tyTotal += row.trendyol;
      webTotal += row.web;
    }

    const channelTotal = tyTotal + webTotal;
    const tyPct = channelTotal > 0 ? Math.round((tyTotal / channelTotal) * 100) : 0;
    const webPct = channelTotal > 0 ? 100 - tyPct : 0;

    return NextResponse.json({
      success: true,
      stats: {
        totalSales,
        totalProfit,
        totalCost,
        pendingOrders,
        productCount,
        criticalStock,
      },
      charts: {
        bar: { labels, trendyol: trendyolSeries, web: webSeries },
        doughnut: {
          labels: ['Trendyol', 'Web Sitesi'],
          values: [tyPct, webPct],
          amounts: [tyTotal, webTotal],
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
