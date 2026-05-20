import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import Customer from '@/models/Customer';
import { getSessionFromRequest } from '@/lib/auth';
import { decrementForOrderItemIfNotApplied } from '@/lib/inventory';
import { restoreOrderStockIfApplied } from '@/lib/stock-reversal';
import { resolvePortalLine } from '@/lib/portal-orders';

async function getOwnedOrder(id: string, customerId: string) {
  return Order.findOne({
    _id: id,
    platform: 'b2b',
    customerId,
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    if (!session || session.role !== 'customer') {
      return NextResponse.json({ success: false, error: 'Müşteri oturumu gerekli.' }, { status: 401 });
    }

    const customer = await Customer.findById(session.userId).lean();
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Müşteri bulunamadı.' }, { status: 404 });
    }

    const { id } = await ctx.params;
    const order = await getOwnedOrder(id, String(customer._id));
    if (!order) {
      return NextResponse.json({ success: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    if (!session || session.role !== 'customer') {
      return NextResponse.json({ success: false, error: 'Müşteri oturumu gerekli.' }, { status: 401 });
    }

    const customer = await Customer.findById(session.userId);
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Müşteri bulunamadı.' }, { status: 404 });
    }

    const { id } = await ctx.params;
    const order = await getOwnedOrder(id, String(customer._id));
    if (!order) {
      return NextResponse.json({ success: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    }

    const body = await request.json();

    if (body.action === 'cancel') {
      if (!['Beklemede', 'Yeni'].includes(order.status)) {
        return NextResponse.json(
          { success: false, error: 'Bu sipariş iptal edilemez.' },
          { status: 400 }
        );
      }

      const prevTotal = Number(order.totalAmount) || 0;
      if (order.stockApplied) {
        await restoreOrderStockIfApplied(order.orderNumber);
        order.stockApplied = false;
      }
      order.status = 'İptal Edildi';
      await order.save();

      customer.balance = Math.max(0, (Number(customer.balance) || 0) - prevTotal);
      await customer.save();

      return NextResponse.json({ success: true, order, customerBalance: customer.balance });
    }

    if (order.status !== 'Beklemede') {
      return NextResponse.json(
        { success: false, error: 'Yalnızca bekleyen siparişler düzenlenebilir.' },
        { status: 400 }
      );
    }

    const warehouseId = String(order.warehouseId || 'main');
    const rawItems = Array.isArray(body.items) ? body.items : null;
    if (!rawItems || rawItems.length === 0) {
      if (body.notes !== undefined) {
        order.notes = String(body.notes ?? '');
        await order.save();
        return NextResponse.json({ success: true, order });
      }
      return NextResponse.json({ success: false, error: 'Geçersiz istek.' }, { status: 400 });
    }

    if (order.stockApplied) {
      await restoreOrderStockIfApplied(order.orderNumber);
      order.stockApplied = false;
    }

    const prevTotal = Number(order.totalAmount) || 0;
    const processedItems = [];
    let totalAmount = 0;
    let costAmount = 0;

    for (const raw of rawItems) {
      const resolved = await resolvePortalLine({
        productId: raw.productId,
        sku: raw.sku,
        barcode: raw.barcode,
        variantSku: raw.variantSku,
        quantity: raw.quantity,
        warehouseId,
      });
      if ('error' in resolved) {
        return NextResponse.json({ success: false, error: resolved.error }, { status: 400 });
      }
      const line = resolved.line;
      processedItems.push(line);
      totalAmount += line.totalPrice;
      costAmount += (line.costPrice || 0) * line.quantity;
    }

    order.items = processedItems;
    order.totalAmount = totalAmount;
    order.costAmount = costAmount;
    order.profitAmount = totalAmount - costAmount;
    if (body.notes !== undefined) order.notes = String(body.notes ?? '');

    let stockApplied = false;
    for (const item of processedItems) {
      const { product } = await decrementForOrderItemIfNotApplied({
        sku: item.sku,
        barcode: item.barcode,
        quantity: item.quantity,
        reason: 'order',
        reference: order.orderNumber,
        userId: session.userId,
        userName: session.name,
        warehouseId,
      });
      if (product) stockApplied = true;
    }
    order.stockApplied = stockApplied;
    await order.save();

    customer.balance = Math.max(0, (Number(customer.balance) || 0) - prevTotal + totalAmount);
    await customer.save();

    return NextResponse.json({ success: true, order, customerBalance: customer.balance });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
