import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import {
  createSessionToken,
  sessionCookieOptions,
  getSessionFromRequest,
  SESSION_COOKIE,
} from '@/lib/auth';
import { requireRootSession, ROOT_SESSION_BACKUP_COOKIE } from '@/lib/root-auth';
import { normalizeTenantId } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const rootSession = requireRootSession(request, getSessionFromRequest);
    if (rootSession instanceof NextResponse) return rootSession;

    const body = (await request.json()) as { tenantId?: string; userId?: string };
    const tenantId = normalizeTenantId(body.tenantId);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'tenantId zorunlu.' }, { status: 400 });
    }

    await connectToDatabase();
    let target: { _id: unknown; email: string; name: string; role: string; tenantId?: string } | null =
      null;

    if (body.userId) {
      target = await User.findOne({ _id: body.userId, tenantId }).lean();
    } else {
      target =
        (await User.findOne({ tenantId, role: 'admin', active: { $ne: false } }).lean()) ??
        (await User.findOne({ tenantId, active: { $ne: false } }).lean());
    }

    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Bu kuruluşta oturum açılacak kullanıcı bulunamadı.' },
        { status: 404 }
      );
    }

    const cookieHeader = request.headers.get('cookie') ?? '';
    const currentToken = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);

    const impersonationToken = createSessionToken({
      userId: String(target._id),
      email: target.email,
      name: target.name,
      role: target.role as 'admin' | 'operator' | 'accountant',
      tenantId,
      impersonatorId: rootSession.userId,
    });

    const res = NextResponse.json({
      success: true,
      redirect: '/',
      impersonating: {
        tenantId,
        email: target.email,
        name: target.name,
      },
    });
    res.cookies.set(sessionCookieOptions(impersonationToken));
    if (currentToken) {
      res.cookies.set({
        name: ROOT_SESSION_BACKUP_COOKIE,
        value: currentToken,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
    }
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Impersonation hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
