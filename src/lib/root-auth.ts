import type { SessionUser, SessionRole } from '@/lib/auth';
import { NextResponse } from 'next/server';

export { type SessionUser };

export const ROOT_SESSION_BACKUP_COOKIE = 'kanal_erp_root_backup';

/** Ortam değişkeni: virgülle ayrılmış root e-postaları */
export function rootAdminEmails(): Set<string> {
  const raw = process.env.ROOT_ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isRootEmail(email: string): boolean {
  return rootAdminEmails().has(String(email ?? '').trim().toLowerCase());
}

export function resolveSessionRole(email: string, dbRole: string): SessionRole {
  if (dbRole === 'root' || isRootEmail(email)) return 'root';
  return dbRole as SessionRole;
}

export function isRootSession(session: SessionUser | null | undefined): boolean {
  return session?.role === 'root';
}

export function requireRootSession(
  request: Request,
  getSession: (req: Request) => SessionUser | null
): SessionUser | NextResponse {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
  }
  if (!isRootSession(session)) {
    return NextResponse.json(
      { success: false, error: 'Platform yönetici (root) yetkisi gerekli.' },
      { status: 403 }
    );
  }
  return session;
}
