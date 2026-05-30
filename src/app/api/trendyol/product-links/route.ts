import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import ProductLink from '@/models/ProductLink';
import { requireSession } from '@/lib/auth';
import { tenantScope, belongsToTenant } from '@/lib/tenant';

export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const rows = await ProductLink.find({ tenantId })
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    return NextResponse.json({ success: true, links: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const data = await request.json();
    const matchType = String(data.matchType ?? 'barcode').toLowerCase();
    const matchKey = String(data.matchKey ?? '').trim();
    const productId = String(data.productId ?? '').trim();
    if (!matchKey || !productId) {
      return NextResponse.json(
        { success: false, error: 'matchKey ve productId zorunlu' },
        { status: 400 }
      );
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return NextResponse.json({ success: false, error: 'Ürün bulunamadı.' }, { status: 404 });
    }
    if (!belongsToTenant(session, product.tenantId)) {
      return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 403 });
    }

    const link = await ProductLink.findOneAndUpdate(
      { tenantId, matchType, matchKey },
      {
        $set: {
          tenantId,
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
  try {
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id zorunlu' }, { status: 400 });
    }

    const row = await ProductLink.findOne({ _id: id, tenantId }).lean();
    if (!row) {
      return NextResponse.json({ success: false, error: 'Kayıt bulunamadı.' }, { status: 404 });
    }
    await ProductLink.deleteOne({ _id: id, tenantId });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Silme hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
