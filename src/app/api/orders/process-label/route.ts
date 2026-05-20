import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { getSessionFromRequest } from '@/lib/auth';
import { processOrderForFulfillment } from '@/lib/order-stock';

/** Etiket yazdır / işleme al: Hazırlanıyor + stok düş + Trendyol Picking */
export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Sipariş ID belirtilmelidir.' },
        { status: 400 }
      );
    }

    const order = await Order.findById(id).lean();
    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Sipariş bulunamadı.' },
        { status: 404 }
      );
    }

    if (order.status === 'İptal Edildi' || order.status === 'İade Edildi') {
      return NextResponse.json(
        { success: false, error: 'İptal veya iade edilmiş sipariş işleme alınamaz.' },
        { status: 400 }
      );
    }

    const result = await processOrderForFulfillment(
      order as Parameters<typeof processOrderForFulfillment>[0],
      { userId: session?.userId, userName: session?.name }
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          warning: result.warning,
          stockApplied: result.stockApplied,
        },
        { status: 502 }
      );
    }

    const updated = await Order.findById(id);
    return NextResponse.json({
      success: true,
      order: updated,
      stockApplied: result.stockApplied,
      trendyolSynced: result.trendyolSynced,
      warning: result.warning,
      message: result.trendyolSynced
        ? 'Sipariş işleme alındı, stok düşüldü ve Trendyol güncellendi.'
        : 'Sipariş işleme alındı ve stok düşüldü.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    console.error('process-label error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
