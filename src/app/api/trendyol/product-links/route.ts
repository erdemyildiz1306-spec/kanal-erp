import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ProductLink from '@/models/ProductLink';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET() {
  await connectToDatabase();
  const rows = await ProductLink.find({}).sort({ updatedAt: -1 }).limit(500).lean();
  return NextResponse.json({ success: true, links: rows });
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    getSessionFromRequest(request);
    const data = await request.json();
    const matchType = String(data.matchType ?? 'barcode').toLowerCase();
    const matchKey = String(data.matchKey ?? '').trim();
    const productId = String(data.productId ?? '').trim();
    if (!matchKey || !productId) {
      return NextResponse.json({ success: false, error: 'matchKey ve productId zorunlu' }, { status: 400 });
    }
    const link = await ProductLink.findOneAndUpdate(
      { matchType, matchKey },
      {
        $set: {
          matchType,
          matchKey,
          productId,
          variantSku: String(data.variantSku ?? ''),
          note: String(data.note ?? ''),
        },
      },
      { upsert: true, new: true }
    );
    return NextResponse.json({ success: true, link });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Kayıt hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  await connectToDatabase();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id zorunlu' }, { status: 400 });
  await ProductLink.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
