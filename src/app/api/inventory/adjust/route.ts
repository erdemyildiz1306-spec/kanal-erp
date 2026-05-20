import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import { findProductBySkuOrBarcode, adjustProductStock } from '@/lib/inventory';
import { barcodeLookupKeys } from '@/lib/barcode-normalize';
import { pushProductStockToChannels } from '@/lib/channel-sync';
import { getSessionFromRequest } from '@/lib/auth';

async function resolveProductMatch(sku: string, barcode: string) {
  const barcodeKeys = barcode ? barcodeLookupKeys(barcode) : [];
  for (const key of barcodeKeys.length ? barcodeKeys : ['']) {
    if (!key && !sku) continue;
    const match = await findProductBySkuOrBarcode(sku, key || undefined);
    if (match) return match;
  }
  if (sku && barcode) {
    return findProductBySkuOrBarcode(sku, undefined);
  }
  return null;
}

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const barcodeList = searchParams
      .getAll('barcode')
      .map((value) => value.trim())
      .filter(Boolean);
    const barcode = barcodeList[0] ?? String(searchParams.get('barcode') ?? '').trim();
    const sku = String(searchParams.get('sku') ?? '').trim();

    if (!barcode && !sku && barcodeList.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Barkod veya SKU gerekli.' },
        { status: 400 }
      );
    }

    let match = null;
    for (const code of barcodeList.length ? barcodeList : [barcode]) {
      match = await resolveProductMatch(sku, code);
      if (match) break;
    }
    if (!match && sku) {
      match = await resolveProductMatch(sku, '');
    }
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

    const match = await resolveProductMatch(sku, barcode);
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
      sku,
      barcode,
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
        barcode: match.matchedBarcode || updated.barcode,
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
