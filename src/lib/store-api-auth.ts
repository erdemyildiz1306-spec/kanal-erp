import connectToDatabase from '@/lib/mongodb';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import { isProductionEnv } from '@/lib/production-guard';

/** Mağaza API Bearer token — Ayarlar > webApiToken ile eşleşmeli */
export async function verifyStoreApiBearer(request: Request): Promise<boolean> {
  await connectToDatabase();
  const doc = await resolveSingletonSettingDocument();
  const expected = String(doc.get('webApiToken') ?? '').trim();

  const auth = request.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (!expected) {
    return !isProductionEnv();
  }

  return bearer.length > 0 && bearer === expected;
}

/** Vitrin kök domaini girildiyse /api/store ekle */
export function normalizeStoreApiBaseUrl(raw: string): string {
  const input = String(raw ?? '').trim();
  if (!input) return input;

  try {
    const u = new URL(input);
    const path = u.pathname.replace(/\/+$/, '') || '';
    if (!path || path === '/') {
      u.pathname = '/api/store';
      return u.href.replace(/\/$/, '');
    }
    if (!path.includes('store') && !path.endsWith('/api')) {
      u.pathname = `${path}/api/store`.replace(/\/{2,}/g, '/');
      return u.href.replace(/\/$/, '');
    }
    return u.href.replace(/\/$/, '');
  } catch {
    return input.replace(/\/+$/, '');
  }
}
