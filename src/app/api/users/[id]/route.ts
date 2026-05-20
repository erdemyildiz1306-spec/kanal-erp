import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { requireSession } from '@/lib/auth';

const ALLOWED_ROLES = ['admin', 'operator', 'accountant'] as const;

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin']);
    if (session instanceof Response) return session;

    const { id } = await ctx.params;
    const data = (await request.json()) as Record<string, unknown>;

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı.' }, { status: 404 });
    }

    if (data.name !== undefined) user.name = String(data.name ?? '').trim();
    if (data.email !== undefined) {
      const email = String(data.email ?? '').toLowerCase().trim();
      if (!email) {
        return NextResponse.json({ success: false, error: 'E-posta boş olamaz.' }, { status: 400 });
      }
      const dup = await User.findOne({ email, _id: { $ne: user._id } });
      if (dup) {
        return NextResponse.json({ success: false, error: 'Bu e-posta kullanımda.' }, { status: 409 });
      }
      user.email = email;
    }
    if (data.role !== undefined) {
      const role = String(data.role ?? '').trim();
      if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
        return NextResponse.json(
          { success: false, error: 'Geçersiz rol. admin, operator veya accountant seçin.' },
          { status: 400 }
        );
      }
      if (String(session.userId) === String(user._id) && role !== 'admin') {
        return NextResponse.json(
          { success: false, error: 'Kendi yönetici rolünüzü düşüremezsiniz.' },
          { status: 400 }
        );
      }
      user.role = role as typeof user.role;
    }
    if (data.active !== undefined) user.active = Boolean(data.active);

    const password = String(data.password ?? '').trim();
    if (password) {
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    await user.save();
    const safe = user.toObject();
    delete (safe as { passwordHash?: string }).passwordHash;

    return NextResponse.json({ success: true, user: safe });
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
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı.' }, { status: 404 });
    }
    user.active = false;
    await user.save();
    return NextResponse.json({ success: true, message: 'Kullanıcı pasifleştirildi.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
