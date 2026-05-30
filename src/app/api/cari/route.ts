import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import CariEntry from '@/models/CariEntry';
import Cashbox from '@/models/Cashbox';
import Customer from '@/models/Customer';
import { getSessionFromRequest, requireSession } from '@/lib/auth';
import { tenantScope, belongsToTenant } from '@/lib/tenant';
import { logActivity } from '@/lib/activity-log';

async function ensureDefaultCashbox(tenantId: string) {
  let box = await Cashbox.findOne({ tenantId, isDefault: true });
  if (!box) {
    box = await Cashbox.create({
      tenantId,
      name: 'Ana Kasa',
      type: 'general',
      balance: 0,
      isDefault: true,
    });
  }
  return box;
}

export async function GET(request: Request) {
  await connectToDatabase();
  const session = getSessionFromRequest(request);
  if (!session || session.role === 'customer') {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 });
  }

  const { tenantId } = tenantScope(session);
  await ensureDefaultCashbox(tenantId);
  const [entries, cashboxes, customers] = await Promise.all([
    CariEntry.find({ tenantId }).sort({ createdAt: -1 }).limit(500).lean(),
    Cashbox.find({ tenantId }).sort({ isDefault: -1, name: 1 }).lean(),
    Customer.find({ tenantId, active: true }).sort({ name: 1 }).lean(),
  ]);

  const cashBalance = cashboxes.reduce((a, c) => a + (Number(c.balance) || 0), 0);
  const receivables = customers.reduce((a, c) => a + (Number(c.balance) || 0), 0);
  const ledgerBalance = entries.reduce((acc, e) => {
    const amt = Number(e.amount) || 0;
    if (e.type === 'gider' || e.direction === 'out') return acc - amt;
    return acc + amt;
  }, 0);

  return NextResponse.json({
    success: true,
    entries,
    cashboxes,
    customers,
    summary: { cashBalance, receivables, ledgerBalance },
  });
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'operator', 'accountant']);
    if (session instanceof Response) return session;

    const { tenantId } = tenantScope(session);
    const data = await request.json();
    const action = String(data.action ?? 'entry');

    if (action === 'cashbox') {
      const name = String(data.name ?? '').trim();
      if (!name) {
        return NextResponse.json({ success: false, error: 'Kasa adı zorunlu' }, { status: 400 });
      }
      const box = await Cashbox.create({
        tenantId,
        name,
        type: data.type === 'bank' ? 'bank' : data.type === 'pos' ? 'pos' : 'general',
        balance: 0,
      });
      return NextResponse.json({ success: true, cashbox: box });
    }

    if (action === 'tahsilat') {
      const customerId = String(data.customerId ?? '');
      const amount = Math.max(0, Number(data.amount) || 0);
      if (!customerId || amount <= 0) {
        return NextResponse.json({ success: false, error: 'Müşteri ve tutar zorunlu' }, { status: 400 });
      }
      const customer = await Customer.findById(customerId);
      if (!customer || !belongsToTenant(session, customer.tenantId)) {
        return NextResponse.json({ success: false, error: 'Müşteri bulunamadı' }, { status: 404 });
      }
      const box = data.cashboxId
        ? await Cashbox.findOne({ _id: data.cashboxId, tenantId })
        : await ensureDefaultCashbox(tenantId);
      if (!box) {
        return NextResponse.json({ success: false, error: 'Kasa bulunamadı' }, { status: 404 });
      }

      customer.balance = Math.max(0, (Number(customer.balance) || 0) - amount);
      box.balance = (Number(box.balance) || 0) + amount;
      await customer.save();
      await box.save();

      const entry = await CariEntry.create({
        tenantId,
        type: 'tahsilat',
        amount,
        description: String(data.description ?? 'Cari tahsilat'),
        reference: String(data.reference ?? customer.name),
        customerId: customer._id,
        cashboxId: box._id,
        direction: 'in',
        category: 'Tahsilat',
      });

      await logActivity({
        action: 'cari_tahsilat',
        module: 'cari',
        detail: `${customer.name}: ₺${amount}`,
        userId: session.userId,
        userName: session.name,
        tenantId,
      });

      return NextResponse.json({ success: true, entry, customerBalance: customer.balance });
    }

    const type = data.type === 'gider' ? 'gider' : 'gelir';
    const amount = Math.max(0, Number(data.amount) || 0);
    if (amount <= 0) {
      return NextResponse.json({ success: false, error: 'Tutar zorunlu' }, { status: 400 });
    }
    const entry = await CariEntry.create({
      tenantId,
      type,
      amount,
      description: String(data.description ?? ''),
      reference: String(data.reference ?? ''),
      category: String(data.category ?? 'Genel'),
      direction: type === 'gider' ? 'out' : 'in',
    });
    return NextResponse.json({ success: true, entry });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Kayıt hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
