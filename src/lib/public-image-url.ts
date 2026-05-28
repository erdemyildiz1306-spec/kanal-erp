/** Trendyol yayımlama — herkese açık HTTPS görsel adresleri */

export const DEFAULT_PRODUCTION_APP_URL = 'https://erp-stok.vercel.app';

export function resolvePublicAppBaseUrl(override?: string): string {
  const fromOverride = String(override ?? '').trim();
  if (fromOverride) {
    return fromOverride.replace(/\/+$/, '');
  }

  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    const host = railway.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${host}`;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${host}`;
  }

  return '';
}

/** Ayarlar + ortam değişkenlerinden Trendyol görsel tabanı (canlı Vercel yedek). */
export function getEffectivePublicAppUrl(settingsUrl?: string): string {
  const fromSettings = resolvePublicAppBaseUrl(settingsUrl);
  if (fromSettings) return fromSettings;
  if (process.env.VERCEL) {
    return resolvePublicAppBaseUrl() || DEFAULT_PRODUCTION_APP_URL;
  }
  return '';
}

export function isVercelBlobImageUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes('blob.vercel-storage.com') || host.includes('public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export function toAbsolutePublicUrl(url: string, baseOverride?: string): string {
  const u = String(url ?? '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;

  const base = getEffectivePublicAppUrl(baseOverride);
  if (!base) {
    const fallback =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://127.0.0.1:3005';
    return new URL(u.startsWith('/') ? u : `/${u}`, `${fallback}/`).href;
  }

  return new URL(u.startsWith('/') ? u : `/${u}`, `${base}/`).href;
}

export function isTrendyolPublicImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function resolveTrendyolImageUrls(
  rawUrls: string[],
  baseOverride?: string
): { ok: string[]; bad: string[] } {
  const base = getEffectivePublicAppUrl(baseOverride);
  const ok: string[] = [];
  const bad: string[] = [];
  for (const raw of rawUrls) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) continue;
    if (isVercelBlobImageUrl(trimmed) && isTrendyolPublicImageUrl(trimmed)) {
      ok.push(trimmed);
      continue;
    }
    const abs = toAbsolutePublicUrl(trimmed, base);
    if (!abs || !isTrendyolPublicImageUrl(abs)) {
      bad.push(trimmed || abs);
    } else {
      ok.push(abs);
    }
  }
  return { ok, bad };
}

/** Kayıt öncesi görselleri mümkünse tam HTTPS adrese çevirir. */
export function normalizeProductImageUrls(
  rawUrls: string[],
  baseOverride?: string
): string[] {
  const { ok } = resolveTrendyolImageUrls(rawUrls, baseOverride);
  return ok;
}

export function trendyolImagePublishError(
  badUrls: string[],
  baseOverride?: string
): string {
  const base = getEffectivePublicAppUrl(baseOverride);
  const sample = badUrls.slice(0, 2).join(', ');
  if (!base) {
    return (
      'Trendyol görselleri herkese açık HTTPS adresi olmalı. ' +
      'Ayarlar > Trendyol > «Yayımlama adresi (HTTPS)» alanına canlı site adresinizi yazın ' +
      '(ör. https://erp-stok.vercel.app) veya görseli «Görsel seç» ile yükleyin / CDN HTTPS linki yapıştırın.' +
      (sample ? ` Sorunlu: ${sample}` : '')
    );
  }
  return (
    'Trendyol görselleri herkese açık HTTPS olmalı. Canlı sitede «Görsel seç» ile yükleyin (Vercel Blob) ' +
    'veya tam HTTPS CDN linki yapıştırın. Eski /uploads/… yollarını yeniden yükleyin.' +
    (sample ? ` Sorunlu: ${sample}` : '')
  );
}
