import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import { formatStorePushError } from '@/lib/store-push-error';
import { readStorePushSettings, resolveStorePushEndpoint } from '@/lib/store-endpoint';

/**
 * Mağaza web API’sine seçili ürünlerin site fiyatı + stok.
 * Ayarlar’daki taban URL’ye POST: /stock-price (Bearer token).
 * Gövde: { source: "kanal-erp", items: [{ sku, barcode, salePrice, listPrice, stock }] }
 * salePrice = Mağaza web ₺, listPrice = Liste ₺ (ERP ana fiyat)
 */
export async function POST(request: Request) {
  try {
    await connectToDatabase();

    const doc = await resolveSingletonSettingDocument();
    const storeSettings = readStorePushSettings(doc);
    const token = String(doc.get('webApiToken') ?? '').trim();

    const endpoint = resolveStorePushEndpoint(storeSettings);

    let body: { productIds?: string[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Geçersiz JSON gövde.' },
        { status: 400 }
      );
    }

    const ids = Array.isArray(body.productIds)
      ? body.productIds.filter((id) => typeof id === 'string' && mongoose.isValidObjectId(id))
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'En az bir ürün seçin.' },
        { status: 400 }
      );
    }

    const products = await Product.find({ _id: { $in: ids } }).exec();
    if (products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Seçilen ürünler bulunamadı.' },
        { status: 404 }
      );
    }

    type Row = {
      sku: string;
      barcode: string;
      salePrice: number;
      listPrice: number;
      stock: number;
    };

    const items: Row[] = [];
    const skipped: string[] = [];

    for (const p of products) {
      const listPrice = Math.max(0, Number(p.price) || 0);
      const salePrice = Math.max(
        0,
        Number(p.prices?.website) || listPrice
      );

      if (p.hasVariants && Array.isArray(p.variants) && p.variants.length > 0) {
        for (const v of p.variants) {
          const bc = String(v.barcode ?? '').trim();
          const sku = String(v.sku ?? p.sku ?? '').trim();
          if (!bc) {
            skipped.push(`${p.name} • varyant barkodsuz`);
            continue;
          }
          items.push({
            sku: sku || String(p.sku ?? ''),
            barcode: bc,
            salePrice,
            listPrice,
            stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
          });
        }
      } else {
        const bc = String(p.barcode ?? '').trim();
        if (!bc) {
          skipped.push(`${p.sku || p.name} (barkod yok)`);
          continue;
        }
        items.push({
          sku: String(p.sku ?? ''),
          barcode: bc,
          salePrice,
          listPrice,
          stock: Math.max(0, Math.floor(Number(p.stock) || 0)),
        });
      }
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Gönderilecek satır yok. ' + (skipped[0] ?? ''),
          skipped,
        },
        { status: 400 }
      );
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        source: 'kanal-erp',
        items,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: formatStorePushError(res.status, text, endpoint),
          endpoint,
          skipped: skipped.length ? skipped : undefined,
        },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }

    return NextResponse.json({
      success: true,
      message: `${items.length} satır mağazaya gönderildi (site fiyatı salePrice, liste listPrice).`,
      sent: items.length,
      endpoint,
      storeResponse: parsed,
      skipped: skipped.length ? skipped : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('store push-stock-price:', e);
    return NextResponse.json(
      { success: false, error: msg || 'Mağaza gönderim hatası.' },
      { status: 500 }
    );
  }
}
