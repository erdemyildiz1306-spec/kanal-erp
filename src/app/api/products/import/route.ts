import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import { generateEan13 } from '@/lib/codes';
import { getSessionFromRequest } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    const text = await request.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return NextResponse.json({ success: false, error: 'Boş dosya' }, { status: 400 });
    }

    let start = 0;
    if (/^sku/i.test(lines[0] ?? '')) start = 1;

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = start; i < lines.length; i++) {
      const cols = lines[i]!.split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ''));
      const [sku, name, barcode, priceS, stockS, costS] = cols;
      if (!sku) continue;
      try {
        const payload = {
          sku,
          name: name || sku,
          barcode: barcode || generateEan13(),
          price: Math.max(0, Number(priceS?.replace(',', '.')) || 0),
          stock: Math.max(0, Math.floor(Number(stockS) || 0)),
          costPrice: Math.max(0, Number(costS?.replace(',', '.')) || 0),
          platforms: ['web', 'trendyol'],
        };
        const existing = await Product.findOne({ sku });
        if (existing) {
          Object.assign(existing, payload);
          await existing.save();
          updated++;
        } else {
          await Product.create(payload);
          created++;
        }
      } catch (e: unknown) {
        errors.push(`${sku}: ${e instanceof Error ? e.message : 'hata'}`);
      }
    }

    await logActivity({
      action: 'product_import',
      module: 'products',
      detail: `${created} yeni, ${updated} güncellendi`,
      userId: session?.userId,
      userName: session?.name,
    });

    return NextResponse.json({ success: true, created, updated, errors: errors.slice(0, 20) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Import hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
