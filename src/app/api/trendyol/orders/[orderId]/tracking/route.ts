import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { getSessionFromRequest } from '@/lib/auth';
import {
  getTrendyolSettings,
  updateTrendyolShipmentTrackingDetails,
  formatTrendyolAxiosError,
} from '@/lib/trendyol';
import {
  isTrendyolDhlCargo,
  trendyolDhlProviderCode,
} from '@/lib/trendyol-package-coalesce';
import { processOrderForFulfillment } from '@/lib/order-stock';

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    const { orderId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      cargoSenderNumber?: string;
      tracking?: string;
      providerCode?: string;
      returnTrackingNumber?: string;
    };

    const cargoSenderNumber = String(
      body.cargoSenderNumber ?? body.tracking ?? ''
    ).trim();
    if (!cargoSenderNumber) {
      return NextResponse.json(
        { success: false, error: 'DHL takip numarası (cargoSenderNumber) zorunlu.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const order = await Order.findById(orderId).lean();
    if (!order || order.platform !== 'trendyol') {
      return NextResponse.json(
        { success: false, error: 'Trendyol siparişi bulunamadı.' },
        { status: 404 }
      );
    }

    const packageId = String(order.packageId ?? '').trim();
    if (!packageId || !/^\d+$/.test(packageId)) {
      return NextResponse.json(
        { success: false, error: 'Geçerli Trendyol paket numarası yok. Önce «Trendyol\'dan Çek» yapın.' },
        { status: 400 }
      );
    }

    if (order.status === 'Beklemede') {
      const flow = await processOrderForFulfillment(
        order as Parameters<typeof processOrderForFulfillment>[0],
        { userId: session.userId, userName: session.name }
      );
      if (!flow.success) {
        return NextResponse.json(
          { success: false, error: flow.error || 'Sipariş işleme alınamadı (Picking gerekli).' },
          { status: 502 }
        );
      }
    }

    const cargoCompany = String(order.cargoCompany ?? '');
    const providerCode =
      String(body.providerCode ?? '').trim() ||
      (isTrendyolDhlCargo(cargoCompany) ? trendyolDhlProviderCode() : 'DHLMP');

    const settings = await getTrendyolSettings();
    await updateTrendyolShipmentTrackingDetails({
      sellerId: settings.sellerId,
      apiKey: settings.apiKey,
      apiSecret: settings.apiSecret,
      packageId,
      cargoSenderNumber,
      providerCode,
      returnTrackingNumber: body.returnTrackingNumber,
    });

    const displayCargo =
      providerCode === 'DHLMP' || isTrendyolDhlCargo(cargoCompany)
        ? 'DHL eCommerce'
        : cargoCompany || providerCode;

    const updated = await Order.findByIdAndUpdate(
      orderId,
      {
        $set: {
          trackingNumber: cargoSenderNumber,
          cargoCompany: displayCargo,
        },
      },
      { new: true }
    );

    return NextResponse.json({
      success: true,
      order: updated,
      message:
        'DHL takip numarası Trendyol\'a iletildi. Etiketi DHL panelinizden yazdırın.',
    });
  } catch (e: unknown) {
    const message = formatTrendyolAxiosError(e);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
