import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import Product from '@/models/Product';
import NotificationState from '@/models/NotificationState';
import OrderEvent from '@/models/OrderEvent';
import { getSessionFromRequest } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';

type NotifKind = 'order' | 'stock' | 'info' | 'order-event';

async function buildNotificationItems(tenantId: string) {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const pendingOrders = await Order.countDocuments({
    tenantId,
    status: { $in: ['Beklemede', 'Yeni'] },
    createdAt: { $gte: since },
  });

  const lowStock = await Product.countDocuments({
    tenantId,
    $expr: { $lte: ['$stock', { $ifNull: ['$safetyStock', 2] }] },
  });

  const recentEvents = await OrderEvent.find({
    tenantId,
    type: 'order-created',
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const items: Array<{
    id: string;
    title: string;
    detail: string;
    time: string;
    kind: NotifKind;
    fingerprint: string;
    url?: string;
  }> = [];

  for (const ev of recentEvents) {
    items.push({
      id: `event-${String(ev._id)}`,
      title: String(ev.title ?? 'Yeni sipariş'),
      detail: String(ev.body ?? ''),
      time: 'Az önce',
      kind: 'order-event',
      fingerprint: String(ev._id),
      url: String(ev.url ?? ''),
    });
  }

  if (pendingOrders > 0) {
    items.push({
      id: 'new-orders',
      title: 'Bekleyen siparişler',
      detail: `Son 48 saatte ${pendingOrders} adet beklemede sipariş.`,
      time: 'Az önce',
      kind: 'order',
      fingerprint: String(pendingOrders),
    });
  }
  if (lowStock > 0) {
    items.push({
      id: 'low-stock',
      title: 'Kritik stok',
      detail: `${lowStock} ürün emniyet stoğu veya altında.`,
      time: 'Bugün',
      kind: 'stock',
      fingerprint: String(lowStock),
    });
  }
  if (items.length === 0) {
    items.push({
      id: 'ok',
      title: 'Bekleyen uyarı yok',
      detail: 'Yeni sipariş ve kritik stok için burada özet görünecek.',
      time: '',
      kind: 'info',
      fingerprint: '0',
    });
  }

  return { items, counts: { pendingOrders, lowStock } };
}

function applyUserState(
  items: Awaited<ReturnType<typeof buildNotificationItems>>['items'],
  states: Array<{ itemId: string; fingerprint: string; read: boolean; deleted: boolean }>
) {
  const stateMap = new Map(states.map((s) => [s.itemId, s]));

  const visible = items
    .map((item) => {
      const st = stateMap.get(item.id);
      const deleted =
        st?.deleted === true && st.fingerprint === item.fingerprint;
      if (deleted) return null;
      const read =
        item.kind === 'info' ||
        (st?.read === true && st.fingerprint === item.fingerprint);
      return { ...item, read };
    })
    .filter(Boolean) as Array<
    (typeof items)[number] & { read: boolean }
  >;

  const unreadCount = visible.filter(
    (i) => !i.read && i.kind !== 'info'
  ).length;

  return { items: visible, unreadCount };
}

/** Dashboard üstü bildirim zili — özet olaylar */
export async function GET(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Oturum gerekli.' },
        { status: 401 }
      );
    }

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const { items, counts } = await buildNotificationItems(tenantId);

    const states = await NotificationState.find({ userId: session.userId }).lean();
    const merged = applyUserState(items, states);

    return NextResponse.json({
      success: true,
      unreadCount: Math.min(99, merged.unreadCount),
      counts,
      items: merged.items,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sunucu hatası';
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}

/** Okundu işaretle: { action: "read", id } veya { action: "readAll" } */
export async function PATCH(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const body = (await request.json()) as { action?: string; id?: string };
    const { items } = await buildNotificationItems(tenantId);

    if (body.action === 'readAll') {
      for (const item of items) {
        if (item.kind === 'info') continue;
        await NotificationState.findOneAndUpdate(
          { userId: session.userId, itemId: item.id },
          {
            $set: {
              read: true,
              deleted: false,
              fingerprint: item.fingerprint,
            },
          },
          { upsert: true }
        );
      }
    } else if (body.action === 'read' && body.id) {
      const item = items.find((i) => i.id === body.id);
      if (!item) {
        return NextResponse.json({ success: false, error: 'Bildirim bulunamadı.' }, { status: 404 });
      }
      await NotificationState.findOneAndUpdate(
        { userId: session.userId, itemId: item.id },
        {
          $set: {
            read: true,
            deleted: false,
            fingerprint: item.fingerprint,
          },
        },
        { upsert: true }
      );
    } else {
      return NextResponse.json({ success: false, error: 'Geçersiz istek.' }, { status: 400 });
    }

    const states = await NotificationState.find({ userId: session.userId }).lean();
    const merged = applyUserState(items, states);

    return NextResponse.json({
      success: true,
      unreadCount: merged.unreadCount,
      items: merged.items,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** Bildirimi sil: ?id=new-orders */
export async function DELETE(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    if (!id) {
      return NextResponse.json({ success: false, error: 'id zorunlu.' }, { status: 400 });
    }

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const { items } = await buildNotificationItems(tenantId);
    const item = items.find((i) => i.id === id);
    if (!item) {
      return NextResponse.json({ success: false, error: 'Bildirim bulunamadı.' }, { status: 404 });
    }

    await NotificationState.findOneAndUpdate(
      { userId: session.userId, itemId: id },
      {
        $set: {
          deleted: true,
          read: true,
          fingerprint: item.fingerprint,
        },
      },
      { upsert: true }
    );

    const states = await NotificationState.find({ userId: session.userId }).lean();
    const merged = applyUserState(items, states);

    return NextResponse.json({
      success: true,
      unreadCount: merged.unreadCount,
      items: merged.items,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
