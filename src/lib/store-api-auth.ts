import connectToDatabase from '@/lib/mongodb';
import Setting from '@/models/Setting';
import { resolveSettingDocument } from '@/lib/erp-settings';
import { isProductionEnv } from '@/lib/production-guard';
import { secureCompareStrings } from '@/lib/secure-compare';
import { DEFAULT_TENANT_ID, normalizeTenantId } from '@/lib/tenant';

/** Webhook / mağaza bildirimi için tenant çözümleme */
export async function resolveWebhookTenant(
  request: Request,
  body?: Record<string, unknown>
): Promise<string> {
  const header = request.headers.get('x-tenant-id')?.trim();
  if (header) return normalizeTenantId(header);

  const fromBearer = await resolveStoreTenantFromBearer(request);
  if (fromBearer) return fromBearer;

  if (body?.tenantId) return normalizeTenantId(body.tenantId);

  return DEFAULT_TENANT_ID;
}

function bearerToken(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

/** Bearer token → kuruluş tenantId (webApiToken eşleşmesi) */
export async function resolveStoreTenantFromBearer(
  request: Request
): Promise<string | null> {
  await connectToDatabase();
  const bearer = bearerToken(request);

  if (!bearer) {
    return isProductionEnv() ? null : DEFAULT_TENANT_ID;
  }

  const rows = await Setting.find({
    webApiToken: { $exists: true, $nin: ['', null] },
  });

  for (const doc of rows) {
    const expected = String(doc.get('webApiToken') ?? '').trim();
    if (expected && secureCompareStrings(bearer, expected)) {
      return normalizeTenantId(doc.get('tenantId'));
    }
  }

  return null;
}

/** Mağaza API Bearer token — Ayarlar > webApiToken ile eşleşmeli */
export async function verifyStoreApiBearer(request: Request): Promise<boolean> {
  const tenantId = await resolveStoreTenantFromBearer(request);
  return tenantId !== null;
}

/** Oturumlu ERP kullanıcısı veya Bearer ile tenant ayar belgesi */
export async function resolveStoreSettingsForRequest(
  request: Request,
  sessionTenantId?: string
) {
  await connectToDatabase();
  const fromBearer = await resolveStoreTenantFromBearer(request);
  const tenantId = fromBearer ?? sessionTenantId ?? DEFAULT_TENANT_ID;
  return { tenantId: normalizeTenantId(tenantId), doc: await resolveSettingDocument(tenantId) };
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
