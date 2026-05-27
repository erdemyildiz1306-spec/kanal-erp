import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import {
  getTrendyolSettings,
  fetchTrendyolOrders,
  formatTrendyolAxiosError,
} from '@/lib/trendyol';
import { runTrendyolOrderSync } from '@/lib/trendyol-order-ingest';
import { allowTrendyolOrderMock } from '@/lib/channel-sync';

export async function GET() {
  try {
    await connectToDatabase();

    let ordersList: Array<Record<string, unknown>> = [];
    let isMock = false;
    let apiError: string | null = null;

    try {
      const settings = await getTrendyolSettings();
      const res = (await fetchTrendyolOrders(
        settings.sellerId,
        settings.apiKey,
        settings.apiSecret
      )) as { content?: Array<Record<string, unknown>> };
      ordersList = res.content || [];
    } catch (err: unknown) {
      apiError = formatTrendyolAxiosError(err);
      if (allowTrendyolOrderMock()) {
        isMock = true;
      } else {
        return NextResponse.json(
          {
            success: false,
            error: apiError,
            hint: 'Yerel test için .env: TRENDYOL_ALLOW_ORDER_SYNC_MOCK=true',
          },
          { status: 502 }
        );
      }
    }

    if ((isMock || ordersList.length === 0) && allowTrendyolOrderMock()) {
      isMock = true;
      ordersList = [
        {
          id: 11232381077,
          orderNumber: 'TY-11232381077',
          status: 'Created',
          totalPrice: 299.9,
          cargoProviderName: 'Trendyol Express',
          cargoTrackingNumber: '7280032734032128',
          shipmentAddress: {
            firstName: 'Emine',
            lastName: 'Sezer',
            address1: 'Atatürk Mah. 1234. Sok. No: 56',
            address2: '',
            district: 'Kadıköy',
            city: 'İstanbul',
          },
          lines: [
            {
              lineId: 4765111111,
              productName: 'Premium Pamuklu Tişört',
              merchantSku: 'TSH-PRM-WHT-M',
              barcode: '8681234567890',
              quantity: 1,
              price: 299.9,
              amount: 299.9,
            },
          ],
        },
      ];
    }

    if (ordersList.length === 0 && !isMock) {
      return NextResponse.json({
        success: true,
        message: 'Trendyol sipariş listesi boş.',
        count: 0,
      });
    }

    const result = await runTrendyolOrderSync({
      preloadedOrders: ordersList,
      skipTerminal: isMock,
      skipClaims: isMock,
    });

    return NextResponse.json({
      success: true,
      message: isMock
        ? `Lokal test siparişleri (${result.syncedCount} adet) eşitlendi; ${result.stockAdjusted} siparişte stok düşüldü.`
        : `Trendyol'dan ${result.syncedCount} sipariş senkronize edildi; ${result.stockAdjusted} işleme alınmış siparişte stok düşüldü${result.stockRestored > 0 ? `; ${result.stockRestored} adet iptal/iade stok iadesi` : ''}${result.claimsReturned > 0 ? `; ${result.claimsReturned} iade talebi işlendi` : ''}.`,
      count: result.syncedCount,
      stockAdjusted: result.stockAdjusted,
      stockRestored: result.stockRestored,
      claimsReturned: result.claimsReturned,
      terminalSynced: result.terminalSynced,
      mockUsed: isMock,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    console.error('Sipariş senkronizasyon hatası:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
