/**
 * WordPress / WooCommerce REST API köprüsü (Faz 5)
 * Ayarlar: wpApiUrl, wpApiToken (consumer key/secret veya uygulama şifresi)
 */

import { resolveSettingDocument } from '@/lib/erp-settings';
import { secureCompareStrings } from '@/lib/secure-compare';
import { DEFAULT_TENANT_ID, normalizeTenantId } from '@/lib/tenant';

export type WordPressPushItem = {
  sku: string;
  stock: number;
  salePrice: number;
  listPrice: number;
};

function normalizeWpBaseUrl(raw: string): string {
  const input = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!input) return '';
  if (input.includes('/wp-json')) return input;
  return `${input}/wp-json/wc/v3`;
}

export async function readWordPressSettings(tenantId?: string) {
  const doc = await resolveSettingDocument(tenantId);
  const baseUrl = normalizeWpBaseUrl(String(doc.get('wpApiUrl') ?? ''));
  const token = String(doc.get('wpApiToken') ?? '').trim();
  return { baseUrl, token, configured: Boolean(baseUrl && token) };
}

/** Bearer veya Basic (key:secret base64) */
export async function verifyWordPressBearer(
  request: Request,
  tenantId?: string
): Promise<string | null> {
  const { token, configured } = await readWordPressSettings(tenantId);
  if (!configured) return null;

  const auth = request.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (bearer && secureCompareStrings(bearer, token)) {
    return normalizeTenantId(tenantId ?? DEFAULT_TENANT_ID);
  }
  return null;
}

export async function pushStockToWordPress(
  tenantId: string | undefined,
  items: WordPressPushItem[]
): Promise<{ ok: boolean; message: string }> {
  const { baseUrl, token, configured } = await readWordPressSettings(tenantId);
  if (!configured) {
    return { ok: false, message: 'WordPress API URL veya token tanımlı değil' };
  }
  if (!items.length) {
    return { ok: false, message: 'Gönderilecek kalem yok' };
  }

  const endpoint = `${baseUrl}/products/batch`;
  const updates = items.slice(0, 100).map((row) => ({
    sku: row.sku,
    stock_quantity: row.stock,
    regular_price: String(row.listPrice),
    sale_price: String(row.salePrice),
  }));

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ update: updates }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `WP HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, message: `${updates.length} ürün WordPress'e gönderildi` };
  } catch (e: unknown) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'WordPress gönderim hatası',
    };
  }
}
