import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { requireSession } from '@/lib/auth';
import { tenantScope, belongsToTenant } from '@/lib/tenant';

export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin']);
    if (session instanceof Response) return session;

    await connectToDatabase();
    const users = await User.find(tenantScope(session))
      .select('-passwordHash')
      .sort({ createdAt: -1 });
    return NextResponse.json({ success: true, users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin']);
    if (session instanceof Response) return session;

    const { tenantId } = tenantScope(session);
    await connectToDatabase();
    const data = await request.json();
    const email = String(data.email || '').toLowerCase().trim();
    const password = String(data.password || '');
    const name = String(data.name || '').trim();
    const role = data.role || 'operator';

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'E-posta, ad ve şifre zorunludur.' },
        { status: 400 }
      );
    }

    const exists = await User.findOne({ tenantId, email });
    if (exists) {
      return NextResponse.json({ error: 'Bu e-posta zaten kayıtlı.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      tenantId,
      email,
      name,
      passwordHash,
      role,
      active: data.active !== false,
    });

    const safe = user.toObject();
    delete (safe as { passwordHash?: string }).passwordHash;

    return NextResponse.json({ success: true, user: safe });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
