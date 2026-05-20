/** Mağaza stok/fiyat gönderim uç noktasını ayarlardan çözümler */

function joinUrl(base: string, path: string): string {
  const b = base.trim().replace(/\/?$/, '/');
  const p = path.replace(/^\//, '');
  try {
    return new URL(p, b).href;
  } catch {
    return `${b}${p}`;
  }
}

export type StorePushSettings = {
  webApiUrl: string;
  webApiStockPath: string;
  webApiPushUrl: string;
};

export function readStorePushSettings(doc: {
  get: (key: string) => unknown;
}): StorePushSettings {
  return {
    webApiUrl: String(doc.get('webApiUrl') ?? '').trim(),
    webApiStockPath: String(doc.get('webApiStockPath') ?? 'stock-price').trim() || 'stock-price',
    webApiPushUrl: String(doc.get('webApiPushUrl') ?? '').trim(),
  };
}

/** Tam URL verilmişse onu kullan; yoksa taban + yol birleştir */
export function resolveStorePushEndpoint(settings: StorePushSettings): string {
  if (settings.webApiPushUrl) {
    return settings.webApiPushUrl;
  }

  let base = settings.webApiUrl;
  if (!base) {
    base = `${process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3005'}/api/store`;
  }

  base = base.replace(/\/+$/, '');
  const path = settings.webApiStockPath.replace(/^\//, '');
  return joinUrl(`${base}/`, path);
}
