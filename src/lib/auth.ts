import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE = 'kanal_erp_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionRole = 'admin' | 'operator' | 'accountant' | 'customer';

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: SessionRole;
};

function sessionSecret(): string {
  const s = process.env.AUTH_SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SESSION_SECRET üretim ortamında zorunludur.');
  }
  return 'kanal-erp-dev-session-secret';
}

function sign(payloadB64: string): string {
  return createHmac('sha256', sessionSecret())
    .update(payloadB64)
    .digest('base64url');
}

export function createSessionToken(user: SessionUser): string {
  const payload = {
    ...user,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as SessionUser & { exp?: number };
    if (!parsed.userId || !parsed.email || !parsed.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return {
      userId: parsed.userId,
      email: parsed.email,
      name: parsed.name,
      role: parsed.role,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function clearSessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  };
}

export function getSessionFromRequest(request: NextRequest | Request): SessionUser | null {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const token = match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
  return verifySessionToken(token);
}

export async function getSessionFromCookies(): Promise<SessionUser | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export function unauthorizedResponse(message = 'Oturum gerekli.') {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Bu işlem için yetkiniz yok.') {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export function requireSession(
  request: NextRequest | Request,
  roles?: SessionUser['role'][]
): SessionUser | NextResponse {
  const session = getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (roles && roles.length > 0 && !roles.includes(session.role)) {
    return forbiddenResponse();
  }
  return session;
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (pathname.startsWith('/api/auth/login')) return true;
  if (pathname.startsWith('/api/auth/customer-login')) return true;
  if (pathname.startsWith('/api/auth/register')) return true;
  if (pathname.startsWith('/api/auth/forgot-password')) return true;
  if (pathname.startsWith('/api/auth/reset-password')) return true;
  if (pathname === '/api/store/stock-price') return true;
  if (pathname.startsWith('/api/auth/dev-reset-users')) return true;
  if (pathname.startsWith('/api/auth/logout')) return true;
  if (pathname.startsWith('/api/auth/me')) return true;
  if (pathname.startsWith('/api/apk/')) return true;
  if (pathname.startsWith('/api/trendyol/webhook/')) return true;
  if (pathname === '/api/orders/webhook') return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/uploads/')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname.endsWith('.apk')) return true;
  return false;
}

export function isPortalPath(pathname: string): boolean {
  return pathname === '/portal' || pathname.startsWith('/portal/');
}
