/** Mağaza stok/fiyat gönderim uç noktasını ayarlardan çözümler */

import { assertSafeOutboundHttpsUrl, OutboundUrlError } from '@/lib/outbound-url';
import { isProductionEnv } from '@/lib/production-guard';

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
  webApiInvoicePath: string;
  webApiInvoicePushUrl: string;
};

export function readStorePushSettings(doc: {
  get: (key: string) => unknown;
}): StorePushSettings {
  return {
    webApiUrl: String(doc.get('webApiUrl') ?? '').trim(),
    webApiStockPath: String(doc.get('webApiStockPath') ?? 'stock-price').trim() || 'stock-price',
    webApiPushUrl: String(doc.get('webApiPushUrl') ?? '').trim(),
    webApiInvoicePath:
      String(doc.get('webApiInvoicePath') ?? 'orders/invoice').trim() || 'orders/invoice',
    webApiInvoicePushUrl: String(doc.get('webApiInvoicePushUrl') ?? '').trim(),
  };
}

/** Tam URL verilmişse onu kullan; yoksa taban + yol birleştir */
export function resolveStorePushEndpoint(settings: StorePushSettings): string {
  if (settings.webApiPushUrl) {
    return assertSafeOutboundHttpsUrl(settings.webApiPushUrl, 'Stok tam URL');
  }

  const base = settings.webApiUrl.replace(/\/+$/, '');
  if (!base) {
    if (isProductionEnv()) {
      throw new OutboundUrlError('Mağaza API taban adresi tanımlı değil.');
    }
    const fallback = `${process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3005'}/api/store`;
    const path = settings.webApiStockPath.replace(/^\//, '');
    return joinUrl(`${fallback.replace(/\/+$/, '')}/`, path);
  }

  const path = settings.webApiStockPath.replace(/^\//, '');
  const joined = joinUrl(`${base}/`, path);
  return assertSafeOutboundHttpsUrl(joined, 'Mağaza stok URL');
}

/** Mağaza senkron GET uç noktası (orders, products vb.) */
export function resolveStoreSyncEndpoint(webApiUrl: string, pathSegment: string, label: string): string {
  const base = webApiUrl.replace(/\/+$/, '');
  if (!base) {
    throw new OutboundUrlError(`${label} için mağaza API taban adresi tanımlı değil.`);
  }
  const joined = joinUrl(`${base}/`, pathSegment.replace(/^\//, ''));
  return assertSafeOutboundHttpsUrl(joined, label);
}

/** Mağazaya fatura bildirimi — tam URL veya taban + yol */
export function resolveStoreInvoiceEndpoint(settings: StorePushSettings): string {
  if (settings.webApiInvoicePushUrl) {
    return assertSafeOutboundHttpsUrl(settings.webApiInvoicePushUrl, 'Mağaza fatura URL');
  }
  const base = settings.webApiUrl.replace(/\/+$/, '');
  if (!base) return '';
  const path = settings.webApiInvoicePath.replace(/^\//, '');
  const joined = joinUrl(`${base}/`, path);
  return assertSafeOutboundHttpsUrl(joined, 'Mağaza fatura URL');
}
