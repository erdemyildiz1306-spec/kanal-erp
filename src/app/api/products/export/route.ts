import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  try {
    await connectToDatabase();
    const products = await Product.find({}).sort({ name: 1 }).lean();

    const header = [
      'sku',
      'name',
      'barcode',
      'stock',
      'price',
      'price_trendyol',
      'price_website',
      'category',
      'platforms',
    ].join(',');

    const lines = [header];
    for (const p of products) {
      if (p.hasVariants && Array.isArray(p.variants) && p.variants.length) {
        for (const v of p.variants) {
          lines.push(
            [
              csvEscape(String(v.sku ?? p.sku ?? '')),
              csvEscape(String(p.name ?? '')),
              csvEscape(String(v.barcode ?? '')),
              csvEscape(Number(v.stock) || 0),
              csvEscape(Number(p.price) || 0),
              csvEscape(Number(p.prices?.trendyol) || 0),
              csvEscape(Number(p.prices?.website) || 0),
              csvEscape(String(p.category ?? '')),
              csvEscape((p.platforms ?? []).join('|')),
            ].join(',')
          );
        }
      } else {
        lines.push(
          [
            csvEscape(String(p.sku ?? '')),
            csvEscape(String(p.name ?? '')),
            csvEscape(String(p.barcode ?? '')),
            csvEscape(Number(p.stock) || 0),
            csvEscape(Number(p.price) || 0),
            csvEscape(Number(p.prices?.trendyol) || 0),
            csvEscape(Number(p.prices?.website) || 0),
            csvEscape(String(p.category ?? '')),
            csvEscape((p.platforms ?? []).join('|')),
          ].join(',')
        );
      }
    }

    const csv = '\uFEFF' + lines.join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="urunler.csv"',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
