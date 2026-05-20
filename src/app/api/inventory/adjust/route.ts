import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import { findProductBySkuOrBarcode, adjustProductStock } from '@/lib/inventory';
import { pushProductStockToChannels } from '@/lib/channel-sync';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const barcode = String(searchParams.get('barcode') ?? '').trim();
    const sku = String(searchParams.get('sku') ?? '').trim();

    if (!barcode && !sku) {
      return NextResponse.json(
        { success: false, error: 'Barkod veya SKU gerekli.' },
        { status: 400 }
      );
    }

    const match = await findProductBySkuOrBarcode(sku, barcode);
    if (!match) {
      return NextResponse.json(
        { success: false, error: 'Ürün bulunamadı.' },
        { status: 404 }
      );
    }

    const p = match.product;
    let displayStock = Number(p.stock) || 0;
    if (match.variantIndex >= 0 && Array.isArray(p.variants)) {
      displayStock = Number(p.variants[match.variantIndex]?.stock) || 0;
    }

    return NextResponse.json({
      success: true,
      product: {
        _id: String(p._id),
        name: p.name,
        sku: match.matchedSku || p.sku,
        barcode: match.matchedBarcode || p.barcode,
        stock: displayStock,
        price: Number(p.price) || 0,
        hasVariants: Boolean(p.hasVariants),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    const body = (await request.json()) as {
      barcode?: string;
      sku?: string;
      delta?: number;
      syncChannels?: boolean;
      warehouseId?: string;
      reason?: string;
      note?: string;
    };

    const barcode = String(body.barcode ?? '').trim();
    const sku = String(body.sku ?? '').trim();
    const delta = Math.floor(Number(body.delta) || 0);

    if ((!barcode && !sku) || delta === 0) {
      return NextResponse.json(
        { success: false, error: 'Barkod/SKU ve sıfır olmayan delta gerekli.' },
        { status: 400 }
      );
    }

    const match = await findProductBySkuOrBarcode(sku, barcode);
    if (!match) {
      return NextResponse.json(
        { success: false, error: 'Ürün bulunamadı.' },
        { status: 404 }
      );
    }

    const updated = await adjustProductStock({
      match,
      delta,
      reason: String(body.reason ?? 'adjustment'),
      userId: session?.userId,
      userName: session?.name,
      note: body.note,
      warehouseId: body.warehouseId,
    });

    let channelSync;
    if (body.syncChannels !== false) {
      channelSync = await pushProductStockToChannels(updated._id);
    }

    let displayStock = Number(updated.stock) || 0;
    if (match.variantIndex >= 0 && Array.isArray(updated.variants)) {
      displayStock = Number(updated.variants[match.variantIndex]?.stock) || 0;
    }

    return NextResponse.json({
      success: true,
      product: {
        _id: String(updated._id),
        name: updated.name,
        sku: match.matchedSku || updated.sku,
        stock: displayStock,
        price: Number(updated.price) || 0,
      },
      channelSync,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
