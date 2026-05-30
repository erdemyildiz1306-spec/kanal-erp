import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { requireSession } from '@/lib/auth';
import { belongsToTenant } from '@/lib/tenant';

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof Response) return session;

    const { id } = await ctx.params;
    const data = await request.json();
    const customer = await Customer.findById(id);
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Müşteri bulunamadı.' }, { status: 404 });
    }
    if (!belongsToTenant(session, customer.tenantId)) {
      return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 403 });
    }

    if (data.name !== undefined) customer.name = String(data.name ?? '').trim();
    if (data.companyName !== undefined) customer.companyName = String(data.companyName ?? '');
    if (data.phone !== undefined) customer.phone = String(data.phone ?? '');
    if (data.notes !== undefined) customer.notes = String(data.notes ?? '');
    if (data.active !== undefined) customer.active = Boolean(data.active);

    if (data.balance !== undefined) {
      customer.balance = Math.max(0, Number(data.balance) || 0);
    }

    if (data.email !== undefined) {
      const email = String(data.email ?? '').toLowerCase().trim();
      if (!email) {
        return NextResponse.json({ success: false, error: 'E-posta boş olamaz.' }, { status: 400 });
      }
      const dup = await Customer.findOne({
        email,
        tenantId: customer.tenantId,
        _id: { $ne: customer._id },
      });
      if (dup) {
        return NextResponse.json({ success: false, error: 'Bu e-posta kullanımda.' }, { status: 409 });
      }
      customer.email = email;
    }

    const password = String(data.password ?? '').trim();
    if (password) {
      customer.passwordHash = await bcrypt.hash(password, 10);
    }

    await customer.save();
    const safe = customer.toObject();
    delete (safe as { passwordHash?: string }).passwordHash;

    return NextResponse.json({ success: true, customer: safe });
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
    const session = requireSession(request, ['admin']);
    if (session instanceof Response) return session;

    const { id } = await ctx.params;
    const customer = await Customer.findById(id);
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Müşteri bulunamadı.' }, { status: 404 });
    }
    if (!belongsToTenant(session, customer.tenantId)) {
      return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 403 });
    }

    customer.active = false;
    await customer.save();

    return NextResponse.json({ success: true, message: 'Müşteri pasifleştirildi.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
