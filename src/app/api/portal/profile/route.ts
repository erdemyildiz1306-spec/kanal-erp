import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { getSessionFromRequest } from '@/lib/auth';

export async function PATCH(request: Request) {
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

    const data = await request.json();

    if (data.name !== undefined) customer.name = String(data.name ?? '').trim();
    if (data.phone !== undefined) customer.phone = String(data.phone ?? '');
    if (data.companyName !== undefined) customer.companyName = String(data.companyName ?? '');

    if (data.email !== undefined) {
      const email = String(data.email ?? '').toLowerCase().trim();
      if (!email) {
        return NextResponse.json({ success: false, error: 'E-posta boş olamaz.' }, { status: 400 });
      }
      const dup = await Customer.findOne({ email, _id: { $ne: customer._id } });
      if (dup) {
        return NextResponse.json({ success: false, error: 'Bu e-posta kullanımda.' }, { status: 409 });
      }
      customer.email = email;
    }

    const currentPassword = String(data.currentPassword ?? '');
    const newPassword = String(data.newPassword ?? '').trim();
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: 'Mevcut şifre gerekli.' },
          { status: 400 }
        );
      }
      const ok = await bcrypt.compare(currentPassword, customer.passwordHash);
      if (!ok) {
        return NextResponse.json({ success: false, error: 'Mevcut şifre hatalı.' }, { status: 401 });
      }
      customer.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await customer.save();

    return NextResponse.json({
      success: true,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        companyName: customer.companyName,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
