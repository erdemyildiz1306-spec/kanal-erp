import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import {
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
  clearSessionCookieOptions,
  getSessionFromRequest,
  SESSION_COOKIE,
} from '@/lib/auth';
import { ROOT_SESSION_BACKUP_COOKIE } from '@/lib/root-auth';
import { resolveSessionRole } from '@/lib/root-auth';

export const dynamic = 'force-dynamic';

function readCookie(request: Request, name: string): string | null {
  const match = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

export async function POST(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session?.impersonatorId) {
      return NextResponse.json(
        { success: false, error: 'Aktif impersonation oturumu yok.' },
        { status: 400 }
      );
    }

    const backupToken = readCookie(request, ROOT_SESSION_BACKUP_COOKIE);
    let restoreToken = backupToken ? verifySessionToken(backupToken) : null;

    if (!restoreToken) {
      await connectToDatabase();
      const rootUser = await User.findById(session.impersonatorId).lean();
      if (!rootUser) {
        return NextResponse.json(
          { success: false, error: 'Root kullanıcı bulunamadı.' },
          { status: 404 }
        );
      }
      const role = resolveSessionRole(rootUser.email, rootUser.role);
      restoreToken = {
        userId: String(rootUser._id),
        email: rootUser.email,
        name: rootUser.name,
        role,
        tenantId: String(rootUser.tenantId ?? 'default'),
      };
    }

    const token = createSessionToken(restoreToken);
    const res = NextResponse.json({ success: true, redirect: '/root' });
    res.cookies.set(sessionCookieOptions(token));
    res.cookies.set({
      name: ROOT_SESSION_BACKUP_COOKIE,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Çıkış hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** Root yedek cookie temizliği — logout benzeri */
export async function DELETE(request: Request) {
  const res = NextResponse.json({ success: true });
  res.cookies.set(clearSessionCookieOptions());
  res.cookies.set({
    name: ROOT_SESSION_BACKUP_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
