import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import {
  findProductBySkuOrBarcode,
  decrementForOrderItemIfNotApplied,
  orderHasStockDeductions,
} from '@/lib/inventory';
import { pushStockAfterOrder } from '@/lib/channel-sync';
import { getSessionFromRequest } from '@/lib/auth';
import {
  applyOrderStockDeduction,
  notifyTrendyolOrderPicking,
  statusRequiresStockDeduction,
} from '@/lib/order-stock';
import { validateTrendyolRefund } from '@/lib/order-refund-rules';
import { restoreOrderStockIfApplied } from '@/lib/stock-reversal';
import { logActivity } from '@/lib/activity-log';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const status = searchParams.get('status');

    const query: Record<string, string> = {};
    if (platform && platform !== 'Tümü') query.platform = platform.toLowerCase();
    if (status && status !== 'Tümü') query.status = status;

    const limit = Math.min(
      2000,
      Math.max(1, parseInt(searchParams.get('limit') || '500', 10) || 500)
    );

    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    return NextResponse.json({ success: true, orders, limit });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    console.error('GET Orders Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    const data = await request.json();

    let costAmount = 0;
    let totalAmount = 0;
    const processedItems = [];

    for (const item of data.items || []) {
      const match = await findProductBySkuOrBarcode(item.sku, item.barcode);
      const product = match?.product;
      const itemCost = product ? (Number(product.costPrice) || 0) : 0;
      const itemPrice = Number(item.unitPrice) || 0;
      const itemQty = Number(item.quantity) || 1;

      processedItems.push({
        productName: item.productName || product?.name || 'Bilinmeyen Ürün',
        sku: item.sku,
        barcode: item.barcode || match?.matchedBarcode || product?.barcode || '',
        quantity: itemQty,
        unitPrice: itemPrice,
        totalPrice: itemPrice * itemQty,
        costPrice: itemCost,
      });

      costAmount += itemCost * itemQty;
      totalAmount += itemPrice * itemQty;
    }

    const orderNumber =
      data.orderNumber || 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const platform = String(data.platform || 'retail').toLowerCase();

    const newOrder = new Order({
      orderNumber,
      platform,
      status: data.status || 'Yeni',
      customerName: data.customerName || 'Perakende Müşterisi',
      customerAddress: data.customerAddress || '',
      cargoCompany: data.cargoCompany || '',
      trackingNumber: data.trackingNumber || '',
      packageId: data.packageId || '',
      items: processedItems,
      totalAmount,
      costAmount,
      profitAmount: totalAmount - costAmount,
      platformOrderId: data.platformOrderId || '',
      cargoLabelUrl: data.cargoLabelUrl || '',
      stockApplied: false,
    });

    await newOrder.save();

    const touched = new Set<string>();
    for (const item of processedItems) {
      const { product: updated } = await decrementForOrderItemIfNotApplied({
        sku: item.sku,
        barcode: item.barcode,
        quantity: item.quantity,
        reason: 'order',
        reference: orderNumber,
        userId: session?.userId,
        userName: session?.name,
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

    return NextResponse.json({ success: true, order: newOrder });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    console.error('POST Order Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Sipariş ID belirtilmelidir.' }, { status: 400 });
    }

    const data = await request.json();
    const order = await Order.findById(id);

    if (!order) {
      return NextResponse.json({ error: 'Sipariş bulunamadı.' }, { status: 404 });
    }

    const prevStatus = order.status;
    const newStatus = data.status ? String(data.status) : prevStatus;

    const refundCheck = validateTrendyolRefund({
      platform: order.platform,
      prevStatus,
      newStatus,
      stockApplied: Boolean(order.stockApplied),
      trendyolIadeIslendi: Boolean(order.trendyolIadeIslendi),
    });
    if (!refundCheck.ok) {
      return NextResponse.json({ success: false, error: refundCheck.error }, { status: 400 });
    }

    if (
      newStatus === 'Hazırlanıyor' &&
      prevStatus !== 'Hazırlanıyor' &&
      statusRequiresStockDeduction(newStatus)
    ) {
      if (order.platform === 'trendyol' && prevStatus === 'Beklemede') {
        const ty = await notifyTrendyolOrderPicking(order.toObject());
        if (!ty.ok && !ty.skipped) {
          return NextResponse.json(
            { success: false, error: ty.error },
            { status: 502 }
          );
        }
      }

      await applyOrderStockDeduction(order.toObject(), {
        userId: session?.userId,
        userName: session?.name,
      });
      order.stockApplied = true;
    }

    let stockRestored = 0;
    let stockRestoreSkipped = false;

    if (
      (newStatus === 'İptal Edildi' || newStatus === 'İade Edildi') &&
      prevStatus !== newStatus
    ) {
      const hadDeduction =
        Boolean(order.stockApplied) ||
        (await orderHasStockDeductions(order.orderNumber));
      if (hadDeduction) {
        stockRestored = await restoreOrderStockIfApplied(order.orderNumber);
        if (stockRestored > 0) {
          order.stockApplied = false;
          order.trendyolIadeIslendi = true;
        } else {
          stockRestoreSkipped = true;
        }
      } else if (newStatus === 'İptal Edildi' || newStatus === 'İade Edildi') {
        order.trendyolIadeIslendi = true;
      }
    }

    if (data.status) order.status = newStatus;
    if (data.cargoCompany !== undefined) order.cargoCompany = String(data.cargoCompany ?? '');
    if (data.trackingNumber !== undefined) order.trackingNumber = String(data.trackingNumber ?? '');
    if (data.packageId !== undefined) order.packageId = String(data.packageId ?? '');
    if (data.cargoLabelUrl !== undefined) order.cargoLabelUrl = String(data.cargoLabelUrl ?? '');

    await order.save();

    await logActivity({
      action: 'order_status_update',
      module: 'orders',
      detail: `${order.orderNumber}: ${prevStatus} → ${newStatus}`,
      userId: session?.userId,
      userName: session?.name,
    });

    return NextResponse.json({
      success: true,
      order,
      stockRestored,
      message:
        stockRestored > 0
          ? `${stockRestored} adet stok depoya geri yüklendi.`
          : stockRestoreSkipped
            ? 'Durum güncellendi; stok iadesi yapılamadı (ürün eşleşmesi veya daha önce iade).'
            : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    console.error('PUT Order Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
