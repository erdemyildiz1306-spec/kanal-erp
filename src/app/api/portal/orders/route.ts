import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import Customer from '@/models/Customer';
import Warehouse from '@/models/Warehouse';
import { getSessionFromRequest } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';
import { mergeTenant } from '@/lib/tenant-query';
import { decrementForOrderItemIfNotApplied } from '@/lib/inventory';
import { MAIN_WAREHOUSE_ID } from '@/lib/warehouse-stock';
import { generateB2BOrderNumber, resolvePortalLine } from '@/lib/portal-orders';

async function getCustomerOrders(
  customerId: string,
  customerName: string,
  tenantId: string
) {
  return Order.find({
    ...mergeTenant(tenantId, {}),
    platform: 'b2b',
    $or: [{ customerId }, { customerName, customerId: { $exists: false } }],
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
}

export async function GET(request: Request) {
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

    const orders = await getCustomerOrders(
      String(customer._id),
      customer.name,
      tenantScope(session).tenantId
    );
    return NextResponse.json({ success: true, orders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    if (!session || session.role !== 'customer') {
      return NextResponse.json({ success: false, error: 'Müşteri oturumu gerekli.' }, { status: 401 });
    }

    const customer = await Customer.findById(session.userId);
    if (!customer || !customer.active) {
      return NextResponse.json({ success: false, error: 'Müşteri bulunamadı.' }, { status: 404 });
    }

    const body = (await request.json()) as {
      items?: Array<{
        productId: string;
        sku?: string;
        barcode?: string;
        variantSku?: string;
        quantity: number;
      }>;
      warehouseId?: string;
      notes?: string;
    };

    const warehouseId = String(body.warehouseId ?? MAIN_WAREHOUSE_ID);
    const tenantId = tenantScope(session).tenantId;
    const wh = await Warehouse.findOne(
      mergeTenant(tenantId, { warehouseId, active: { $ne: false } })
    );
    if (!wh) {
      return NextResponse.json({ success: false, error: 'Geçersiz depo.' }, { status: 400 });
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return NextResponse.json({ success: false, error: 'Sepet boş.' }, { status: 400 });
    }

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

    const orderNumber = generateB2BOrderNumber();
    const order = await Order.create({
      tenantId,
      orderNumber,
      platform: 'b2b',
      status: 'Beklemede',
      customerId: customer._id,
      customerName: customer.name,
      customerAddress: customer.companyName || '',
      notes: String(body.notes ?? ''),
      warehouseId,
      items: processedItems,
      totalAmount,
      costAmount,
      profitAmount: totalAmount - costAmount,
      stockApplied: false,
    });

    let stockApplied = false;
    for (const item of processedItems) {
      const { product } = await decrementForOrderItemIfNotApplied({
        sku: item.sku,
        barcode: item.barcode,
        quantity: item.quantity,
        reason: 'order',
        reference: orderNumber,
        userId: session.userId,
        userName: session.name,
        warehouseId,
        tenantId,
      });
      if (product) stockApplied = true;
    }

    if (stockApplied) {
      order.stockApplied = true;
      await order.save();
    }

    customer.balance = (Number(customer.balance) || 0) + totalAmount;
    await customer.save();

    return NextResponse.json({
      success: true,
      order,
      customerBalance: customer.balance,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
