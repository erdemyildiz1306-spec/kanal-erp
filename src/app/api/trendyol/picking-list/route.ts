import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    getSessionFromRequest(request);
    const { searchParams } = new URL(request.url);
    const statusCsv = searchParams.get('status') || 'Beklemede,Hazırlanıyor';
    const statuses = statusCsv.split(',').map((s) => s.trim()).filter(Boolean);

    const orders = await Order.find({
      platform: 'trendyol',
      status: { $in: statuses },
    })
      .sort({ createdAt: 1 })
      .lean();

    type Row = {
      barcode: string;
      productName: string;
      qty: number;
      orderNumbers: string[];
    };
    const agg = new Map<string, Row>();

    for (const o of orders) {
      for (const line of o.items ?? []) {
        const barcode = String(line.barcode ?? line.sku ?? '').trim();
        const key = barcode || String(line.sku ?? '');
        if (!key) continue;
        const cur = agg.get(key) ?? {
          barcode,
          productName: String(line.productName ?? key),
          qty: 0,
          orderNumbers: [],
        };
        cur.qty += Number(line.quantity) || 1;
        if (!cur.orderNumbers.includes(o.orderNumber)) {
          cur.orderNumbers.push(o.orderNumber);
        }
        agg.set(key, cur);
      }
    }

    return NextResponse.json({
      success: true,
      rows: [...agg.values()],
      ordersScanned: orders.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
