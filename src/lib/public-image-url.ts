/** Trendyol yayımlama — herkese açık HTTPS görsel adresleri */

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

export function toAbsolutePublicUrl(url: string, baseOverride?: string): string {
  const u = String(url ?? '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;

  const base = resolvePublicAppBaseUrl(baseOverride);
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
  const ok: string[] = [];
  const bad: string[] = [];
  for (const raw of rawUrls) {
    const abs = toAbsolutePublicUrl(raw, baseOverride);
    if (!abs || !isTrendyolPublicImageUrl(abs)) {
      bad.push(raw.trim() || abs);
    } else {
      ok.push(abs);
    }
  }
  return { ok, bad };
}

export function trendyolImagePublishError(
  badUrls: string[],
  baseOverride?: string
): string {
  const base = resolvePublicAppBaseUrl(baseOverride);
  const sample = badUrls.slice(0, 2).join(', ');
  if (!base) {
    return (
      'Trendyol görselleri herkese açık HTTPS adresi olmalı (localhost kabul etmez). ' +
      'Çözüm: Ayarlar > Trendyol bölümünde «Yayımlama adresi (HTTPS)» alanına Railway / mağaza adresinizi yazın ' +
      '(ör. https://sizin-app.up.railway.app) ve kaydedin; veya görsel satırına doğrudan CDN HTTPS linki yapıştırın.' +
      (sample ? ` Sorunlu: ${sample}` : '')
    );
  }
  return (
    'Trendyol görselleri herkese açık HTTPS olmalı. Yayımlama adresiniz tanımlı ama görseller hâlâ yerel görünüyor — ' +
    'görseli yeniden yükleyin veya tam HTTPS URL yapıştırın (cdn.trendyol.com, imgix vb.).' +
    (sample ? ` Sorunlu: ${sample}` : '')
  );
}
