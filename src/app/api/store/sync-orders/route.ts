import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import { findProductBySkuOrBarcode } from '@/lib/inventory';

function joinUrl(base: string, path: string): string {
  const b = base.trim().replace(/\/?$/, '/');
  const p = path.replace(/^\//, '');
  try {
    return new URL(p, b).href;
  } catch {
    return `${b}${p}`;
  }
}

/** Mağaza API'sinden sipariş çeker — GET {webApiUrl}/orders */
export async function GET() {
  try {
    await connectToDatabase();
    const doc = await resolveSingletonSettingDocument();
    const baseUrl = String(doc.get('webApiUrl') ?? '').trim();
    const token = String(doc.get('webApiToken') ?? '').trim();

    if (!baseUrl) {
      return NextResponse.json(
        { success: false, error: 'Mağaza API taban adresi tanımlı değil.' },
        { status: 400 }
      );
    }

    const endpoint = joinUrl(baseUrl, 'orders');
    const res = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(90_000),
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Mağaza HTTP ${res.status}: ${text.slice(0, 400)}` },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ success: false, error: 'Mağaza yanıtı JSON değil.' }, { status: 502 });
    }

    const rows: Record<string, unknown>[] = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : Array.isArray((parsed as { orders?: unknown }).orders)
        ? ((parsed as { orders: Record<string, unknown>[] }).orders ?? [])
        : [];

    let synced = 0;
    for (const row of rows) {
      const orderNumber = String(row.orderNumber ?? row.id ?? `WEB-${Date.now()}-${synced}`);
      const itemsIn = Array.isArray(row.items) ? row.items : [];
      let costAmount = 0;
      let totalAmount = Number(row.totalAmount ?? row.total ?? 0) || 0;
      const orderItems = [];

      for (const item of itemsIn as Array<Record<string, unknown>>) {
        const sku = String(item.sku ?? '');
        const barcode = String(item.barcode ?? '');
        const match = await findProductBySkuOrBarcode(sku, barcode);
        const product = match?.product as { costPrice?: number; name?: string } | undefined;
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice ?? item.price) || 0;
        const itemCost = product?.costPrice ?? unitPrice * 0.4;
        costAmount += itemCost * qty;
        orderItems.push({
          productName: String(item.productName ?? item.name ?? product?.name ?? sku),
          sku,
          barcode: barcode || match?.matchedBarcode || '',
          quantity: qty,
          unitPrice,
          totalPrice: unitPrice * qty,
          costPrice: itemCost,
        });
      }

      if (!totalAmount) {
        totalAmount = orderItems.reduce((a, i) => a + i.totalPrice, 0);
      }

      await Order.findOneAndUpdate(
        { orderNumber },
        {
          $set: {
            platform: 'web',
            status: String(row.status ?? 'Yeni'),
            customerName: String(row.customerName ?? 'Web Müşterisi'),
            customerAddress: String(row.customerAddress ?? row.address ?? ''),
            items: orderItems,
            totalAmount,
            costAmount,
            profitAmount: totalAmount - costAmount,
            platformOrderId: String(row.platformOrderId ?? row.id ?? ''),
          },
        },
        { upsert: true }
      );
      synced++;
    }

    return NextResponse.json({
      success: true,
      count: synced,
      message: synced
        ? `Mağazadan ${synced} sipariş aktarıldı.`
        : 'Mağazadan sipariş gelmedi.',
      endpoint,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
