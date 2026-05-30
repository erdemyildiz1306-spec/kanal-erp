import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import {
  createSessionToken,
  sessionCookieOptions,
} from '@/lib/auth';
import { resolveSessionRole } from '@/lib/root-auth';
import { assertTenantOperational, applyTrialToTenant } from '@/lib/tenant-license';
import { ensureDefaultTenant } from '@/lib/tenant';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = checkRateLimit(`login:${ip}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: `Çok fazla giriş denemesi. ${rl.retryAfterSec} sn sonra deneyin.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

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
      await ensureDefaultTenant();
      await applyTrialToTenant('default');
      const passwordHash = await bcrypt.hash(password, 10);
      const created = await User.create({
        email,
        name: email.split('@')[0] || 'Yönetici',
        passwordHash,
        role: 'admin',
        active: true,
        tenantId: 'default',
      });
      const token = createSessionToken({
        userId: String(created._id),
        email: created.email,
        name: created.name,
        role: created.role,
        tenantId: 'default',
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

    const role = resolveSessionRole(user.email, user.role);
    const tenantId = String(user.tenantId ?? 'default');

    if (role !== 'root') {
      const op = await assertTenantOperational(tenantId);
      if (!op.ok) {
        return NextResponse.json({ success: false, error: op.error }, { status: 403 });
      }
    }

    const token = createSessionToken({
      userId: String(user._id),
      email: user.email,
      name: user.name,
      role,
      tenantId,
    });

    const res = NextResponse.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        role,
      },
      redirect: role === 'root' ? '/root' : '/',
    });
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Giriş hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
