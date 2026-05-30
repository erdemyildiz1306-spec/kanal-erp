import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import OrderEvent from '@/models/OrderEvent';
import { getSessionFromRequest } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';

/** Yeni sipariş olayları — OrderNotifyPoller */
export async function GET(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const { searchParams } = new URL(request.url);
    const sinceRaw = searchParams.get('since');
    const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 48 * 60 * 60 * 1000);

    const events = await OrderEvent.find({
      tenantId,
      createdAt: { $gt: since },
      type: 'order-created',
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      success: true,
      events: events.map((e) => ({
        id: String(e._id),
        type: e.type,
        orderId: e.orderId,
        orderNumber: e.orderNumber,
        title: e.title,
        body: e.body,
        url: e.url,
        read: Boolean(e.read),
        createdAt: e.createdAt,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** Olayları okundu işaretle: { ids: string[] } */
export async function PATCH(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const body = (await request.json()) as { ids?: string[] };
    const ids = (body.ids ?? []).map((id) => String(id).trim()).filter(Boolean);
    if (!ids.length) {
      return NextResponse.json({ success: false, error: 'ids zorunlu.' }, { status: 400 });
    }

    await OrderEvent.updateMany({ tenantId, _id: { $in: ids } }, { $set: { read: true } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
