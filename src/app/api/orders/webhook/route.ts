import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import {
  findProductBySkuOrBarcode,
  decrementForOrderItemIfNotApplied,
  orderHasStockDeductions,
} from '@/lib/inventory';
import {
  pushStockAfterOrder,
  verifyStoreWebhookSecret,
} from '@/lib/channel-sync';

/** Trendyol veya özel web sitesinden gelen sipariş bildirimleri (Webhook). */
export async function POST(request: Request) {
  try {
    if (!verifyStoreWebhookSecret(request)) {
      return NextResponse.json(
        { success: false, error: 'Webhook doğrulaması başarısız.' },
        { status: 401 }
      );
    }

    await connectToDatabase();
    const data = await request.json();

    const platform =
      data.platform ||
      (data.orderNumber?.startsWith('TY') ? 'trendyol' : 'web');

    let calculatedCostAmount = 0;
    const enrichedItems: Array<{
      productId?: unknown;
      productName: string;
      sku: string;
      barcode: string;
      quantity: number;
      costPrice: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    for (const item of data.items || []) {
      const match = await findProductBySkuOrBarcode(item.sku, item.barcode);
      const product = match?.product;
      const currentCost = product ? (product.costPrice ?? 0) : 0;
      calculatedCostAmount += currentCost * item.quantity;

      enrichedItems.push({
        productId: product ? product._id : undefined,
        productName: item.productName || product?.name || 'Bilinmeyen Ürün',
        sku: item.sku,
        barcode: item.barcode || match?.matchedBarcode || product?.barcode || '',
        quantity: item.quantity,
        costPrice: currentCost,
        unitPrice: item.unitPrice,
        totalPrice: item.unitPrice * item.quantity,
      });
    }

    const totalAmount =
      data.totalAmount ||
      enrichedItems.reduce((acc, curr) => acc + curr.totalPrice, 0);
    const calculatedProfitAmount = totalAmount - calculatedCostAmount;

    const orderNumber = data.orderNumber || `ERP-${Date.now()}`;

    const existing = await Order.findOne({ orderNumber });
    if (existing) {
      if (!existing.stockApplied && (await orderHasStockDeductions(orderNumber))) {
        existing.stockApplied = true;
        await existing.save();
      }
      return NextResponse.json({
        success: true,
        message: 'Sipariş zaten kayıtlı (idempotent).',
        orderId: existing._id,
      });
    }

    const isTrendyol = platform === 'trendyol';
    const initialStatus = isTrendyol ? 'Beklemede' : 'Yeni';

    const newOrder = new Order({
      orderNumber,
      platform,
      status: initialStatus,
      customerName: data.customerName || 'N/A',
      customerAddress: data.customerAddress || '',
      costAmount: calculatedCostAmount,
      totalAmount,
      profitAmount: calculatedProfitAmount,
      items: enrichedItems,
      trackingNumber: data.trackingNumber || '',
      cargoCompany: data.cargoCompany || '',
      packageId: data.packageId || '',
      cargoLabelUrl: data.cargoLabelUrl || '',
      platformOrderId: data.platformOrderId || '',
      stockApplied: false,
    });

    await newOrder.save();

    if (!isTrendyol) {
      const touched = new Set<string>();
      for (const item of enrichedItems) {
        const { product: updated } = await decrementForOrderItemIfNotApplied({
          sku: item.sku,
          barcode: item.barcode,
          quantity: item.quantity,
          reason: 'webhook',
          reference: orderNumber,
        });
        if (updated && !touched.has(String(updated._id))) {
          touched.add(String(updated._id));
          await pushStockAfterOrder(
            updated as Parameters<typeof pushStockAfterOrder>[0],
            platform
          );
        }
      }

      newOrder.stockApplied = true;
      await newOrder.save();
    }

    return NextResponse.json({
      success: true,
      message: isTrendyol
        ? 'Trendyol siparişi beklemede kaydedildi; stok etiket alındığında düşecek.'
        : 'Sipariş alındı; stok güncellendi ve kanallara senkron gönderildi.',
      orderId: newOrder._id,
    });
  } catch (error: unknown) {
    console.error('Webhook Error:', error);
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
