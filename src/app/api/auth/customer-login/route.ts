import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import Customer from '@/models/Customer';
import User from '@/models/User';
import { createSessionToken, sessionCookieOptions } from '@/lib/auth';

/** Toptan müşteri paneli girişi (ayrı oturum, role: customer) */
export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = (await request.json()) as { email?: string; password?: string };
    const email = String(body.email ?? '').toLowerCase().trim();
    const password = String(body.password ?? '');

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'E-posta ve şifre zorunludur.' },
        { status: 400 }
      );
    }

    const customer = await Customer.findOne({ email });
    if (!customer || !customer.active) {
      const staffUser = await User.findOne({ email }).select('_id').lean();
      return NextResponse.json(
        {
          success: false,
          error: staffUser
            ? 'Bu e-posta yönetici/personel hesabına ait. «Yönetici» sekmesinden giriş yapın.'
            : 'Geçersiz e-posta veya şifre. Toptan müşteri hesabınız yönetici tarafından oluşturulur.',
          hint: staffUser ? 'use_staff_login' : undefined,
        },
        { status: 401 }
      );
    }

    const ok = await bcrypt.compare(password, customer.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz e-posta veya şifre.' },
        { status: 401 }
      );
    }

    const token = createSessionToken({
      userId: String(customer._id),
      email: customer.email,
      name: customer.name,
      role: 'customer',
      tenantId: String(customer.tenantId ?? 'default'),
    });

    const res = NextResponse.json({
      success: true,
      redirect: '/portal',
      customer: {
        name: customer.name,
        email: customer.email,
        balance: customer.balance,
      },
    });
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Giriş hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
