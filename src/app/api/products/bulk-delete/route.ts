import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import mongoose from 'mongoose';
import { deleteProductsWithCleanup } from '@/lib/product-delete';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json().catch(() => ({}));
    const raw = body.ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Silinecek ürün id listesi (ids) gerekli.' },
        { status: 400 }
      );
    }

    const ids = raw
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Geçerli ürün id’si yok.' },
        { status: 400 }
      );
    }

    const result = await deleteProductsWithCleanup(ids);

    return NextResponse.json({
      success: true,
      message:
        `${result.deletedCount} ürün silindi. ` +
        `Depo stok satırı: ${result.warehouseRowsRemoved}, link: ${result.linksRemoved}. ` +
        `Trendyol/mağaza senkronunda tekrar gelmemesi için hariç listeye alındı.`,
      ...result,
    });
  } catch (error: unknown) {
    console.error('POST bulk-delete Error:', error);
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
