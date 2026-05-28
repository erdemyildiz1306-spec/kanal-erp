import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import { resolveStoreSyncEndpoint } from '@/lib/store-endpoint';
import { OutboundUrlError } from '@/lib/outbound-url';
import { requireSession } from '@/lib/auth';
import { generateEan13 } from '@/lib/codes';
import { isProductExcluded } from '@/lib/product-exclusion';

/** Mağaza API'sinden ürün çeker — GET {webApiUrl}/products beklenir */
export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof Response) return session;

    await connectToDatabase();
    const doc = await resolveSingletonSettingDocument();
    const baseUrl = String(doc.get('webApiUrl') ?? '').trim();
    const token = String(doc.get('webApiToken') ?? '').trim();

    if (!baseUrl) {
      return NextResponse.json(
        {
          success: false,
          error: 'Mağaza API taban adresi tanımlı değil. Ayarlar > Next.js Mağaza API.',
        },
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
      endpoint = resolveStoreSyncEndpoint(baseUrl, 'products', 'Mağaza ürün senkronu');
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
        {
          success: false,
          error: `Mağaza HTTP ${res.status}: ${text.slice(0, 400)}`,
          endpoint,
        },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Mağaza yanıtı JSON değil.' },
        { status: 502 }
      );
    }

    const rows: Record<string, unknown>[] = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : Array.isArray((parsed as { items?: unknown }).items)
        ? ((parsed as { items: Record<string, unknown>[] }).items ?? [])
        : Array.isArray((parsed as { products?: unknown }).products)
          ? ((parsed as { products: Record<string, unknown>[] }).products ?? [])
          : [];

    if (!rows.length) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: 'Mağazadan ürün satırı gelmedi.',
      });
    }

    let synced = 0;
    let skippedExcluded = 0;
    for (const row of rows) {
      const sku = String(row.sku ?? row.merchantSku ?? '').trim();
      if (!sku) continue;
      const barcode = String(row.barcode ?? row.gtin ?? '').trim() || generateEan13();
      if (
        await isProductExcluded({
          sku,
          barcode,
          stockCode: sku,
        })
      ) {
        skippedExcluded++;
        continue;
      }
      const name = String(row.name ?? row.title ?? sku).trim();
      const price = Number(row.price ?? row.salePrice ?? row.listPrice ?? 0) || 0;
      const stock = Math.max(0, Math.floor(Number(row.stock ?? row.quantity ?? 0) || 0));

      await Product.findOneAndUpdate(
        { sku },
        {
          $set: {
            sku,
            name,
            description: String(row.description ?? name),
            barcode,
            price,
            costPrice: Number(row.costPrice ?? price * 0.4) || 0,
            stock,
            prices: { website: price, trendyol: price },
            category: String(row.category ?? row.categoryName ?? ''),
            platforms: ['web'],
            integrations: {
              web: { syncActive: true, productId: String(row.id ?? '') },
              trendyol: { syncActive: false, approved: false, productId: '' },
            },
          },
        },
        { upsert: true }
      );
      synced++;
    }

    return NextResponse.json({
      success: true,
      count: synced,
      skippedExcluded,
      message:
        `Mağazadan ${synced} ürün ERP'ye aktarıldı.` +
        (skippedExcluded > 0
          ? ` ${skippedExcluded} silinmiş ürün atlandı.`
          : ''),
      endpoint,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
