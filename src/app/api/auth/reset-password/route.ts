import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import PasswordResetToken from '@/models/PasswordResetToken';
import { validateAuthPassword } from '@/lib/auth-password';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = (await request.json()) as {
      token?: string;
      password?: string;
    };
    const token = String(body.token ?? '').trim();
    const password = String(body.password ?? '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Sıfırlama bağlantısı geçersiz.' },
        { status: 400 }
      );
    }

    const passErr = validateAuthPassword(password);
    if (passErr) {
      return NextResponse.json({ success: false, error: passErr }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const row = await PasswordResetToken.findOne({
      tokenHash,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!row) {
      return NextResponse.json(
        {
          success: false,
          error: 'Bağlantı süresi dolmuş veya geçersiz. Yeni sıfırlama talebi oluşturun.',
        },
        { status: 400 }
      );
    }

    const user = await User.findOne({ email: row.email });
    if (!user || !user.active) {
      return NextResponse.json(
        { success: false, error: 'Hesap bulunamadı veya pasif.' },
        { status: 400 }
      );
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();

    row.usedAt = new Date();
    await row.save();
    await PasswordResetToken.deleteMany({ email: row.email, usedAt: null });

    return NextResponse.json({
      success: true,
      message: 'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sıfırlama hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
