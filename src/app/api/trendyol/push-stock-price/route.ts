import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import { getTrendyolSettings, updateTrendyolStockAndPrice, formatTrendyolAxiosError } from '@/lib/trendyol';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';
import { requireSession } from '@/lib/auth';
import { tenantScope, belongsToTenant } from '@/lib/tenant';

/** Seçilen ürünlerin Trendyol satış fiyatı + stoku (price-and-inventory). Liste ₺ → listPrice, Trendyol ₺ → salePrice */
export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof Response) return session;

    const { tenantId } = tenantScope(session);
    await connectToDatabase();

    const mod = await assertIntegrationModuleEnabled('trendyolSeller', tenantId);
    if (!mod.ok) {
      return NextResponse.json({ success: false, error: mod.error }, { status: 403 });
    }

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
        { success: false, error: 'En az bir ürün seçin (MongoDB nesne kimliği).' },
        { status: 400 }
      );
    }

    const products = await Product.find({ tenantId, _id: { $in: ids } }).exec();
    if (products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Seçilen ürünler bulunamadı.' },
        { status: 404 }
      );
    }

    for (const p of products) {
      if (!belongsToTenant(session, p.tenantId)) {
        return NextResponse.json({ success: false, error: 'Yetkisiz ürün seçimi.' }, { status: 403 });
      }
    }

    type TyItem = {
      barcode: string;
      quantity: number;
      salePrice: number;
      listPrice: number;
    };

    const items: TyItem[] = [];
    const skipped: string[] = [];

    for (const p of products) {
      const listPrice = Math.max(0, Number(p.price) || 0);
      const salePrice = Math.max(
        0,
        Number(p.prices?.trendyol) || listPrice
      );

      if (p.hasVariants && Array.isArray(p.variants) && p.variants.length > 0) {
        for (const v of p.variants) {
          const bc = String(v.barcode ?? '').trim();
          if (!bc) {
            skipped.push(`${p.sku} (varyant barkodsuz)`);
            continue;
          }
          items.push({
            barcode: bc,
            quantity: Math.max(0, Math.floor(Number(v.stock) || 0)),
            salePrice,
            listPrice,
          });
        }
      } else {
        const bc = String(p.barcode ?? '').trim();
        if (!bc) {
          skipped.push(`${p.sku} (barkod yok)`);
          continue;
        }
        items.push({
          barcode: bc,
          quantity: Math.max(0, Math.floor(Number(p.stock) || 0)),
          salePrice,
          listPrice,
        });
      }
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Gönderilecek satır yok: barkod eksik. ' +
            (skipped.length ? skipped.slice(0, 5).join('; ') : ''),
        },
        { status: 400 }
      );
    }

    const settings = await getTrendyolSettings(tenantId);
    const chunkSize = 100;
    const chunks: TyItem[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }

    const apiResults: unknown[] = [];
    for (const chunk of chunks) {
      const r = await updateTrendyolStockAndPrice(
        settings.sellerId,
        settings.apiKey,
        settings.apiSecret,
        chunk
      );
      apiResults.push(r);
    }

    return NextResponse.json({
      success: true,
      message: `Trendyol’a ${items.length} barkod satırı gönderildi (liste fiyatı listPrice, kanal fiyatı salePrice).`,
      sent: items.length,
      products: products.length,
      skipped: skipped.length ? skipped : undefined,
      batches: chunks.length,
    });
  } catch (e: unknown) {
    const msg = formatTrendyolAxiosError(e);
    console.error('Trendyol push-stock-price:', e);
    return NextResponse.json(
      { success: false, error: msg || 'Trendyol gönderim hatası.' },
      { status: 502 }
    );
  }
}
