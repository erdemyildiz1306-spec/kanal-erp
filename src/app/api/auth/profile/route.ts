import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import {
  getSessionFromRequest,
  requireSession,
  unauthorizedResponse,
} from '@/lib/auth';
import {
  normalizeAuthEmail,
  validateAuthEmail,
  validateAuthName,
  validateAuthPassword,
} from '@/lib/auth-password';

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session || session.role === 'customer') {
    return unauthorizedResponse();
  }

  await connectToDatabase();
  const user = await User.findById(session.userId).select('-passwordHash');
  if (!user || !user.active) {
    return unauthorizedResponse('Hesap bulunamadı.');
  }

  return NextResponse.json({
    success: true,
    user: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}

export async function PATCH(request: Request) {
  try {
    await connectToDatabase();
    const session = requireSession(request);
    if (session instanceof Response) return session;
    if (session.role === 'customer') {
      return NextResponse.json(
        { success: false, error: 'Müşteri profili /api/portal/profile üzerinden güncellenir.' },
        { status: 403 }
      );
    }

    const user = await User.findById(session.userId);
    if (!user || !user.active) {
      return unauthorizedResponse('Hesap bulunamadı.');
    }

    const data = (await request.json()) as Record<string, unknown>;

    if (data.name !== undefined) {
      const nameErr = validateAuthName(String(data.name ?? ''));
      if (nameErr) {
        return NextResponse.json({ success: false, error: nameErr }, { status: 400 });
      }
      user.name = String(data.name).trim();
    }

    if (data.email !== undefined) {
      const email = normalizeAuthEmail(data.email);
      const emailErr = validateAuthEmail(email);
      if (emailErr) {
        return NextResponse.json({ success: false, error: emailErr }, { status: 400 });
      }
      const dup = await User.findOne({ email, _id: { $ne: user._id } });
      if (dup) {
        return NextResponse.json(
          { success: false, error: 'Bu e-posta kullanımda.' },
          { status: 409 }
        );
      }
      user.email = email;
    }

    const currentPassword = String(data.currentPassword ?? '');
    const newPassword = String(data.password ?? data.newPassword ?? '').trim();

    if (newPassword) {
      const passErr = validateAuthPassword(newPassword);
      if (passErr) {
        return NextResponse.json({ success: false, error: passErr }, { status: 400 });
      }
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: 'Mevcut şifre hatalı.' },
          { status: 400 }
        );
      }
      user.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await user.save();

    return NextResponse.json({
      success: true,
      message: 'Profil güncellendi.',
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Profil güncellenemedi';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
