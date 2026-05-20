import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';

/** Mağaza sözleşmesi: POST { source, items[] } — yerel ürün stok/fiyat günceller */
export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const data = await request.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) {
      return NextResponse.json({ success: false, error: 'items boş' }, { status: 400 });
    }

    let updated = 0;
    for (const row of items) {
      const barcode = String(row.barcode ?? '').trim();
      const sku = String(row.sku ?? '').trim();
      const stock = Math.max(0, Math.floor(Number(row.stock) || 0));
      const salePrice = Math.max(0, Number(row.salePrice) || 0);
      const listPrice = Math.max(0, Number(row.listPrice) || salePrice);

      const filter =
        barcode ? { barcode } : sku ? { sku } : null;
      if (!filter) continue;

      const p = await Product.findOne(filter);
      if (!p) continue;

      if (p.hasVariants && barcode && Array.isArray(p.variants)) {
        const vi = p.variants.findIndex(
          (v: { barcode?: string }) => String(v.barcode) === barcode
        );
        if (vi >= 0) {
          p.variants[vi].stock = stock;
          p.markModified('variants');
        }
      } else {
        p.stock = stock;
      }
      p.price = listPrice;
      p.prices = { ...(p.prices ?? {}), website: salePrice, trendyol: p.prices?.trendyol ?? salePrice };
      p.platforms = [...new Set([...(p.platforms ?? []), 'web'])];
      await p.save();
      updated++;
    }

    return NextResponse.json({ success: true, updated, received: items.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
