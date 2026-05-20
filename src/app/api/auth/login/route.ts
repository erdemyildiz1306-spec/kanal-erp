import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import {
  createSessionToken,
  sessionCookieOptions,
} from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = String(body.email ?? '').toLowerCase().trim();
    const password = String(body.password ?? '');

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'E-posta ve şifre zorunludur.' },
        { status: 400 }
      );
    }

    const userCount = await User.countDocuments({});
    if (userCount === 0) {
      const passwordHash = await bcrypt.hash(password, 10);
      const created = await User.create({
        email,
        name: email.split('@')[0] || 'Yönetici',
        passwordHash,
        role: 'admin',
        active: true,
      });
      const token = createSessionToken({
        userId: String(created._id),
        email: created.email,
        name: created.name,
        role: created.role,
      });
      const res = NextResponse.json({
        success: true,
        message: 'İlk yönetici hesabı oluşturuldu ve oturum açıldı.',
        user: {
          email: created.email,
          name: created.name,
          role: created.role,
        },
        bootstrap: true,
      });
      res.cookies.set(sessionCookieOptions(token));
      return res;
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz e-posta veya şifre.' },
        { status: 401 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        {
          success: false,
          error:
            user.signupSource === 'signup'
              ? 'Hesabınız henüz yönetici tarafından onaylanmadı. Onay sonrası giriş yapabilirsiniz.'
              : 'Hesabınız pasif. Yöneticinizle iletişime geçin.',
        },
        { status: 403 }
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz e-posta veya şifre.' },
        { status: 401 }
      );
    }

    const token = createSessionToken({
      userId: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const res = NextResponse.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Giriş hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
