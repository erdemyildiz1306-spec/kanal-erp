import { formatStorePushError } from '@/lib/store-push-error';
import {
  readStorePushSettings,
  resolveStoreInvoiceEndpoint,
  type StorePushSettings,
} from '@/lib/store-endpoint';

export type StoreInvoicePushPayload = {
  source: 'kanal-erp';
  orderNumber: string;
  platformOrderId?: string;
  invoiceNumber?: string;
  invoiceLink?: string;
  invoiceUuid?: string;
  invoiceDateTime?: number;
  invoiceFileBase64?: string;
  invoiceFileName?: string;
  invoiceFileMime?: string;
};

export async function pushInvoiceToStore(
  settings: StorePushSettings,
  token: string,
  payload: StoreInvoicePushPayload
) {
  const endpoint = resolveStoreInvoiceEndpoint(settings);
  if (!endpoint) {
    throw new Error(
      'Mağaza fatura API adresi tanımlı değil. Ayarlar → Mağaza API → Fatura bildirim yolu.'
    );
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(formatStorePushError(res.status, text, endpoint));
  }

  let data: unknown = text;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }
  }
  return { endpoint, data };
}
