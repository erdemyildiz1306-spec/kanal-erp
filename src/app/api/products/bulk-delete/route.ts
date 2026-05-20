import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import mongoose from 'mongoose';

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

    const result = await Product.deleteMany({
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `${result.deletedCount} ürün silindi.`,
    });
  } catch (error: unknown) {
    console.error('POST bulk-delete Error:', error);
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
