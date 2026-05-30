import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { resolveSettingDocument } from '@/lib/erp-settings';
import { resolveStoreSyncEndpoint } from '@/lib/store-endpoint';
import { OutboundUrlError } from '@/lib/outbound-url';
import { requireSession } from '@/lib/auth';
import { findProductBySkuOrBarcode } from '@/lib/inventory';
import { buildStoreMetaFromPayload } from '@/lib/store-order-meta';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';
import { tenantScope } from '@/lib/tenant';
import { orderByNumber } from '@/lib/tenant-query';

/** Mağaza API'sinden sipariş çeker — GET {webApiUrl}/orders */
export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof Response) return session;

    const { tenantId } = tenantScope(session);
    await connectToDatabase();

    const mod = await assertIntegrationModuleEnabled('webStoreApi', tenantId);
    if (!mod.ok) {
      return NextResponse.json({ success: false, error: mod.error }, { status: 403 });
    }

    const doc = await resolveSettingDocument(tenantId);
    const baseUrl = String(doc.get('webApiUrl') ?? '').trim();
    const token = String(doc.get('webApiToken') ?? '').trim();

    if (!baseUrl) {
      return NextResponse.json(
        { success: false, error: 'Mağaza API taban adresi tanımlı değil.' },
        { status: 400 }
      );
    }
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Mağaza API token tanımlı değil.' },
        { status: 400 }
      );
    }

    let endpoint: string;
    try {
      endpoint = resolveStoreSyncEndpoint(baseUrl, 'orders', 'Mağaza sipariş senkronu');
    } catch (error) {
      const message = error instanceof OutboundUrlError ? error.message : 'Geçersiz mağaza URL.';
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    const res = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
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
        const match = await findProductBySkuOrBarcode(sku, barcode, tenantId);
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

      const storeMeta = buildStoreMetaFromPayload(row);

      await Order.findOneAndUpdate(
        orderByNumber(tenantId, orderNumber),
        {
          $set: {
            tenantId,
            platform: 'web',
            status: String(row.status ?? 'Yeni'),
            customerName: String(row.customerName ?? 'Web Müşterisi'),
            customerAddress: String(row.customerAddress ?? row.address ?? ''),
            items: orderItems,
            totalAmount,
            costAmount,
            profitAmount: totalAmount - costAmount,
            platformOrderId: String(row.platformOrderId ?? row.id ?? ''),
            ...(storeMeta ? { storeMeta } : {}),
          },
        },
        { upsert: true }
      );
      synced++;
    }

    return NextResponse.json({
      success: true,
      count: synced,
      message: `${synced} mağaza siparişi ERP'ye aktarıldı.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
