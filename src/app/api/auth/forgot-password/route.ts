import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import PasswordResetToken from '@/models/PasswordResetToken';
import { normalizeAuthEmail, validateAuthEmail } from '@/lib/auth-password';
import { buildPasswordResetUrl, sendPasswordResetEmail } from '@/lib/auth-mail';

const RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = (await request.json()) as { email?: string };
    const email = normalizeAuthEmail(body.email);
    const emailErr = validateAuthEmail(email);
    if (emailErr) {
      return NextResponse.json({ success: false, error: emailErr }, { status: 400 });
    }

    const user = await User.findOne({ email, active: true });
    const genericMessage =
      'Kayıtlı bir hesap varsa şifre sıfırlama bağlantısı e-posta adresinize gönderildi.';

    if (!user) {
      return NextResponse.json({ success: true, message: genericMessage });
    }

    await PasswordResetToken.deleteMany({ email, usedAt: null });

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    await PasswordResetToken.create({
      email,
      tokenHash,
      expiresAt,
    });

    const resetUrl = buildPasswordResetUrl(rawToken);
    const mail = await sendPasswordResetEmail(email, resetUrl);

    const payload: Record<string, unknown> = {
      success: true,
      message: genericMessage,
    };

    if (mail.devPreview && process.env.NODE_ENV !== 'production') {
      payload.devResetUrl = mail.devPreview;
    }

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'İstek işlenemedi';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
