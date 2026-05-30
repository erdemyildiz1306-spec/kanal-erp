import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  isPublicPath,
  isPortalPath,
  isStaffPath,
  verifySessionTokenEdge,
} from '@/lib/auth-edge';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionTokenEdge(token);

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Oturum gerekli. Lütfen giriş yapın.' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isCustomer = session.role === 'customer';

  const isRootPanelPath =
    pathname === '/root' ||
    pathname.startsWith('/root/') ||
    (pathname.startsWith('/api/root/') &&
      !pathname.startsWith('/api/root/exit-impersonate'));

  if (isRootPanelPath && session.role !== 'root') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Platform yönetici (root) yetkisi gerekli.' },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (isCustomer) {
    const allowed =
      isPortalPath(pathname) ||
      pathname.startsWith('/api/portal/') ||
      pathname.startsWith('/api/auth/');
    if (!allowed && isStaffPath(pathname)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, error: 'Bu API yalnızca yönetici paneline açıktır.' },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/portal', request.url));
    }
  } else {
    if (isPortalPath(pathname) || pathname.startsWith('/api/portal/')) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, error: 'Müşteri oturumu gerekli.' },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  if (pathname.startsWith('/api/users') && session.role !== 'admin') {
    if (request.method !== 'GET') {
      const ownProfilePatch =
        request.method === 'PATCH' &&
        pathname.match(/^\/api\/users\/[^/]+$/) &&
        pathname.endsWith(`/${session.userId}`);
      if (!ownProfilePatch) {
        return NextResponse.json(
          { success: false, error: 'Kullanıcı yönetimi yalnızca yöneticiye açıktır.' },
          { status: 403 }
        );
      }
    }
  }

  if (
    session.role !== 'admin' &&
    ((pathname === '/api/settings' && request.method === 'PUT') ||
      pathname === '/api/backup')
  ) {
    return NextResponse.json(
      { success: false, error: 'Bu işlem yalnızca yöneticiye açıktır.' },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
};
