import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import CariEntry from '@/models/CariEntry';
import Cashbox from '@/models/Cashbox';
import Customer from '@/models/Customer';
import { requireSession } from '@/lib/auth';
import { tenantScope, belongsToTenant } from '@/lib/tenant';

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'operator', 'accountant']);
    if (session instanceof NextResponse) return session;

    const { tenantId } = tenantScope(session);
    const { id } = await ctx.params;
    const data = await request.json();
    const entry = await CariEntry.findById(id);
    if (!entry) {
      return NextResponse.json({ success: false, error: 'Hareket bulunamadı.' }, { status: 404 });
    }
    if (!belongsToTenant(session, entry.tenantId)) {
      return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 403 });
    }

    if (data.description !== undefined) entry.description = String(data.description ?? '');
    if (data.category !== undefined) entry.category = String(data.category ?? '');
    if (data.reference !== undefined) entry.reference = String(data.reference ?? '');

    await entry.save();
    return NextResponse.json({ success: true, entry });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'accountant']);
    if (session instanceof NextResponse) return session;

    const { tenantId } = tenantScope(session);
    const { id } = await ctx.params;
    const entry = await CariEntry.findById(id);
    if (!entry) {
      return NextResponse.json({ success: false, error: 'Hareket bulunamadı.' }, { status: 404 });
    }
    if (!belongsToTenant(session, entry.tenantId)) {
      return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 403 });
    }

    const amount = Math.max(0, Number(entry.amount) || 0);

    if (entry.type === 'tahsilat' && entry.customerId) {
      const customer = await Customer.findOne({ _id: entry.customerId, tenantId });
      if (customer) {
        customer.balance = (Number(customer.balance) || 0) + amount;
        await customer.save();
      }
      if (entry.cashboxId) {
        const box = await Cashbox.findOne({ _id: entry.cashboxId, tenantId });
        if (box) {
          box.balance = Math.max(0, (Number(box.balance) || 0) - amount);
          await box.save();
        }
      }
    }

    await CariEntry.deleteOne({ _id: entry._id, tenantId });
    return NextResponse.json({ success: true, message: 'Hareket silindi.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
