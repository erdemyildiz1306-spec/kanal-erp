import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { getSessionFromRequest, requireSession } from '@/lib/auth';

export async function GET(request: Request) {
  await connectToDatabase();
  const session = getSessionFromRequest(request);
  if (session instanceof Response) return session;
  if (session?.role === 'customer') {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 });
  }
  const customers = await Customer.find({}).sort({ name: 1 }).lean();
  return NextResponse.json({ success: true, customers });
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof Response) return session;

    const data = await request.json();
    const email = String(data.email ?? '').toLowerCase().trim();
    const password = String(data.password ?? '').trim();
    const name = String(data.name ?? '').trim();

    if (!email || !password || !name) {
      return NextResponse.json(
        { success: false, error: 'Ad, e-posta ve şifre zorunlu.' },
        { status: 400 }
      );
    }

    const existing = await Customer.findOne({ email });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Bu e-posta zaten kayıtlı.' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await Customer.create({
      email,
      name,
      companyName: String(data.companyName ?? ''),
      phone: String(data.phone ?? ''),
      passwordHash,
      balance: Math.max(0, Number(data.balance) || 0),
      notes: String(data.notes ?? ''),
      active: true,
    });

    return NextResponse.json({
      success: true,
      customer: {
        _id: customer._id,
        email: customer.email,
        name: customer.name,
        balance: customer.balance,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Kayıt hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
