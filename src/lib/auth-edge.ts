/** Edge middleware için oturum doğrulama (Web Crypto). */

export const SESSION_COOKIE = 'kanal_erp_session';

export type SessionRole = 'root' | 'admin' | 'operator' | 'accountant' | 'customer';

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: SessionRole;
  tenantId: string;
};

import { isProductionEnv } from '@/lib/production-guard';

function sessionSecret(): string {
  const s = process.env.AUTH_SESSION_SECRET?.trim();
  if (s) return s;
  if (isProductionEnv()) {
    throw new Error('AUTH_SESSION_SECRET üretim ortamında zorunludur.');
  }
  return 'kanal-erp-dev-session-secret';
}

function b64urlToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(payloadB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadB64)
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function verifySessionTokenEdge(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = await hmacSign(payloadB64);
  if (expected.length !== sig.length) return null;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    if (expected.charCodeAt(i) === sig.charCodeAt(i)) ok++;
  }
  if (ok !== expected.length) return null;

  try {
    const json = new TextDecoder().decode(b64urlToBytes(payloadB64));
    const parsed = JSON.parse(json) as SessionUser & { exp?: number };
    if (!parsed.userId || !parsed.email || !parsed.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return {
      userId: parsed.userId,
      email: parsed.email,
      name: parsed.name,
      role: ['root', 'admin', 'operator', 'accountant', 'customer'].includes(parsed.role)
        ? (parsed.role as SessionRole)
        : 'operator',
      tenantId: String(parsed.tenantId ?? 'default'),
    };
  } catch {
    return null;
  }
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (pathname.startsWith('/api/auth/login')) return true;
  if (pathname.startsWith('/api/auth/customer-login')) return true;
  if (pathname.startsWith('/api/auth/register')) return true;
  if (pathname.startsWith('/api/auth/forgot-password')) return true;
  if (pathname.startsWith('/api/auth/reset-password')) return true;
  if (pathname.startsWith('/api/auth/register-config')) return true;
  if (pathname === '/api/store/stock-price') return true;
  if (pathname === '/api/cron/trendyol-sync') return true;
  if (pathname.startsWith('/api/cron/license-check')) return true;
  if (pathname.startsWith('/api/auth/dev-reset-users')) return true;
  if (pathname.startsWith('/api/auth/logout')) return true;
  if (pathname.startsWith('/api/auth/me')) return true;
  if (pathname.startsWith('/api/apk/')) return true;
  if (pathname.startsWith('/api/trendyol/webhook/')) return true;
  if (pathname === '/api/orders/webhook') return true;
  if (pathname === '/api/health') return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/uploads/')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname.endsWith('.apk')) return true;
  return false;
}

export function isPortalPath(pathname: string): boolean {
  return pathname === '/portal' || pathname.startsWith('/portal/');
}

export function isStaffPath(pathname: string): boolean {
  if (isPublicPath(pathname) || isPortalPath(pathname)) return false;
  if (pathname.startsWith('/api/portal/')) return false;
  return true;
}
