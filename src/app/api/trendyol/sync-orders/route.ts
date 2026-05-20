import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import {
  getTrendyolSettings,
  fetchTrendyolOrders,
  formatTrendyolAxiosError,
} from '@/lib/trendyol';
import { findProductBySkuOrBarcode, orderHasStockDeductions } from '@/lib/inventory';
import {
  applyOrderStockDeduction,
  statusRequiresStockDeduction,
} from '@/lib/order-stock';
import { restoreOrderStockIfApplied } from '@/lib/stock-reversal';
import { allowTrendyolOrderMock } from '@/lib/channel-sync';

export async function GET() {
  try {
    await connectToDatabase();

    let settings;
    let ordersList: Array<Record<string, unknown>> = [];
    let isMock = false;
    let apiError: string | null = null;

    try {
      settings = await getTrendyolSettings();
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

    if (ordersList.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Trendyol sipariş listesi boş.',
        count: 0,
      });
    }

    const sellerId = settings?.sellerId ?? '';
    const stockDeductAt = settings?.stockDeductAt ?? 'processing';
    let syncedCount = 0;
    let stockAdjusted = 0;
    let stockRestored = 0;

    for (const item of ordersList) {
      const orderNumber = String(item.orderNumber ?? '');
      const mappedStatus = mapTrendyolStatus(String(item.status ?? ''));
      const existing = await Order.findOne({ orderNumber }).lean();
      const alreadyDeducted =
        Boolean((existing as { stockApplied?: boolean } | null)?.stockApplied) ||
        (existing ? await orderHasStockDeductions(orderNumber) : false);
      const shouldApplyStock =
        statusRequiresStockDeduction(mappedStatus, stockDeductAt) &&
        mappedStatus !== 'İptal Edildi' &&
        !alreadyDeducted;

      const addr = (item.shipmentAddress ?? {}) as Record<string, string>;
      const customerName = `${addr.firstName ?? ''} ${addr.lastName ?? ''}`.trim();
      const customerAddress = `${addr.address1 ?? ''} ${addr.address2 ?? ''} ${addr.district ?? ''} / ${addr.city ?? ''}`.trim();

      let costAmount = 0;
      const orderItems = [];

      for (const line of (item.lines as Array<Record<string, unknown>>) ?? []) {
        const sku = String(line.merchantSku ?? line.stockCode ?? line.sku ?? '');
        const barcode = String(line.barcode ?? '');
        const match = await findProductBySkuOrBarcode(sku, barcode);
        const product = match?.product as { costPrice?: number } | undefined;
        const price = Number(line.price ?? line.lineUnitPrice) || 0;
        const qty = Number(line.quantity) || 1;
        const itemCost = product ? (product.costPrice || 0) : price * 0.4;

        orderItems.push({
          productName: String(line.productName ?? 'Ürün'),
          sku,
          barcode,
          lineId: line.lineId != null ? String(line.lineId) : '',
          quantity: qty,
          unitPrice: price,
          totalPrice: Number(line.amount ?? line.lineGrossAmount) || price * qty,
          costPrice: itemCost,
        });

        costAmount += itemCost * qty;
      }

      const totalAmount = Number(item.totalPrice ?? item.packageTotalPrice) || 0;
      const profitAmount = totalAmount - costAmount;
      const packageId = String(item.id ?? item.shipmentPackageId ?? '');

      await Order.findOneAndUpdate(
        { orderNumber },
        {
          $set: {
            platform: 'trendyol',
            status: mappedStatus,
            customerName,
            customerAddress,
            totalAmount,
            costAmount,
            profitAmount,
            items: orderItems,
            cargoCompany: String(item.cargoProviderName ?? ''),
            trackingNumber: String(item.cargoTrackingNumber ?? ''),
            packageId,
            platformOrderId: packageId,
            cargoLabelUrl: sellerId
              ? `https://api.trendyol.com/sapigw/suppliers/${encodeURIComponent(sellerId)}/shipment-packages/${packageId}/cargo-label`
              : '',
          },
        },
        { upsert: true, new: true }
      );

      if (shouldApplyStock) {
        const result = await applyOrderStockDeduction({
          orderNumber,
          platform: 'trendyol',
          items: orderItems,
        });
        if (result.applied) stockAdjusted++;
      } else if (
        (mappedStatus === 'İptal Edildi' || mappedStatus === 'İade Edildi') &&
        alreadyDeducted
      ) {
        const restored = await restoreOrderStockIfApplied(orderNumber);
        if (restored > 0) stockRestored += restored;
      } else if (existing && !existing.stockApplied && alreadyDeducted) {
        await Order.updateOne({ orderNumber }, { $set: { stockApplied: true } });
      }

      syncedCount++;
    }

    return NextResponse.json({
      success: true,
      message: isMock
        ? `Lokal test siparişleri (${syncedCount} adet) eşitlendi; ${stockAdjusted} siparişte stok düşüldü (işleme alınmış).`
        : `Trendyol'dan ${syncedCount} sipariş senkronize edildi; ${stockAdjusted} işleme alınmış siparişte stok düşüldü${stockRestored > 0 ? `; ${stockRestored} adet iptal/iade stok iadesi yapıldı` : ''}.`,
      count: syncedCount,
      stockAdjusted,
      stockRestored,
      mockUsed: isMock,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    console.error('Sipariş senkronizasyon hatası:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function mapTrendyolStatus(status: string): string {
  switch (status) {
    case 'Created':
      return 'Beklemede';
    case 'Awaiting':
    case 'Picking':
    case 'Invoiced':
      return 'Hazırlanıyor';
    case 'Shipped':
      return 'Kargolandı';
    case 'Delivered':
      return 'Teslim Edildi';
    case 'Cancelled':
    case 'UnSupplied':
      return 'İptal Edildi';
    case 'Returned':
      return 'İade Edildi';
    default:
      return 'Beklemede';
  }
}
