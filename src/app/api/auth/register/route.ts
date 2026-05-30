import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { getAuthPolicy } from '@/lib/auth-settings';
import {
  normalizeAuthEmail,
  validateAuthEmail,
  validateAuthName,
  validateAuthPassword,
} from '@/lib/auth-password';
import { createSessionToken, sessionCookieOptions } from '@/lib/auth';
import { provisionNewTenantWithTrial } from '@/lib/tenant-license';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    const email = normalizeAuthEmail(body.email);
    const password = String(body.password ?? '');
    const name = String(body.name ?? '').trim();

    const emailErr = validateAuthEmail(email);
    if (emailErr) {
      return NextResponse.json({ success: false, error: emailErr }, { status: 400 });
    }
    const nameErr = validateAuthName(name);
    if (nameErr) {
      return NextResponse.json({ success: false, error: nameErr }, { status: 400 });
    }
    const passErr = validateAuthPassword(password);
    if (passErr) {
      return NextResponse.json({ success: false, error: passErr }, { status: 400 });
    }

    const userCount = await User.countDocuments({});
    const policy = await getAuthPolicy();

    if (userCount > 0 && !policy.allowSignup) {
      return NextResponse.json(
        {
          success: false,
          error: 'Herkese açık kayıt kapalı. Yöneticinizden hesap isteyin.',
        },
        { status: 403 }
      );
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return NextResponse.json(
        { success: false, error: 'Bu e-posta zaten kayıtlı.' },
        { status: 409 }
      );
    }

    const isFirstUser = userCount === 0;
    const passwordHash = await bcrypt.hash(password, 10);
    const active = isFirstUser ? true : !policy.requireApproval;

    const orgName = name || email.split('@')[0] || 'Kuruluş';
    const tenant = await provisionNewTenantWithTrial(orgName);

    const user = await User.create({
      email,
      name,
      passwordHash,
      role: 'admin',
      active,
      tenantId: tenant.tenantId,
      signupSource: isFirstUser ? 'admin' : 'signup',
    });

    if (active) {
      const token = createSessionToken({
        userId: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: tenant.tenantId,
      });
      const res = NextResponse.json({
        success: true,
        message: isFirstUser
          ? 'İlk yönetici hesabı oluşturuldu. 14 günlük deneme süreniz başladı.'
          : active
            ? 'Kayıt tamamlandı. 14 günlük deneme süreniz başladı.'
            : 'Kayıt alındı. Onay sonrası 14 günlük deneme başlayacak.',
        pendingApproval: !active,
        trialDays: 14,
        tenantId: tenant.tenantId,
        user: { email: user.email, name: user.name, role: user.role },
        bootstrap: isFirstUser,
      });
      res.cookies.set(sessionCookieOptions(token));
      return res;
    }

    return NextResponse.json({
      success: true,
      message:
        'Kayıt alındı. Yönetici onayından sonra giriş yapabilirsiniz. Onaylandığında e-posta ile bilgilendirilebilirsiniz.',
      pendingApproval: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Kayıt hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
