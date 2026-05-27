import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import FcmToken from '@/models/FcmToken';
import { getSessionFromRequest } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    const body = (await request.json()) as { token?: string; platform?: string };
    const token = String(body.token ?? '').trim();
    if (!token) {
      return NextResponse.json({ success: false, error: 'token zorunlu.' }, { status: 400 });
    }

    await connectToDatabase();
    await FcmToken.findOneAndUpdate(
      { token },
      {
        $set: {
          token,
          userId: session.userId,
          platform: String(body.platform ?? 'web').slice(0, 32),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
