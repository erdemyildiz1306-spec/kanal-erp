import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Warehouse from '@/models/Warehouse';
import { findProductBySkuOrBarcode } from '@/lib/inventory';
import { adjustWarehouseStock } from '@/lib/warehouse-stock';
import { requireSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof Response) return session;

    const body = (await request.json()) as {
      fromWarehouseId?: string;
      toWarehouseId?: string;
      sku?: string;
      barcode?: string;
      quantity?: number;
    };

    const fromId = String(body.fromWarehouseId ?? '').trim();
    const toId = String(body.toWarehouseId ?? '').trim();
    const qty = Math.floor(Number(body.quantity) || 0);

    if (!fromId || !toId || fromId === toId || qty <= 0) {
      return NextResponse.json(
        { success: false, error: 'Kaynak/hedef depo ve pozitif adet gerekli.' },
        { status: 400 }
      );
    }

    const [fromWh, toWh] = await Promise.all([
      Warehouse.findOne({ warehouseId: fromId }),
      Warehouse.findOne({ warehouseId: toId }),
    ]);
    if (!fromWh || !toWh) {
      return NextResponse.json({ success: false, error: 'Depo bulunamadı.' }, { status: 404 });
    }

    const match = await findProductBySkuOrBarcode(body.sku, body.barcode);
    if (!match) {
      return NextResponse.json({ success: false, error: 'Ürün bulunamadı.' }, { status: 404 });
    }

    const fromAfter = await adjustWarehouseStock({
      warehouseId: fromId,
      match,
      delta: -qty,
    });

    const toAfter = await adjustWarehouseStock({
      warehouseId: toId,
      match,
      delta: qty,
    });

    return NextResponse.json({
      success: true,
      fromStock: fromAfter,
      toStock: toAfter,
      productId: String(match.product._id),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
