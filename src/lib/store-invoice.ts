import { formatStorePushError } from '@/lib/store-push-error';
import { OutboundUrlError } from '@/lib/outbound-url';
import {
  readStorePushSettings,
  resolveStoreInvoiceEndpoint,
  type StorePushSettings,
} from '@/lib/store-endpoint';
import { StoreInvoiceError } from '@/lib/store-invoice-errors';

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
  if (!String(token ?? '').trim()) {
    throw new StoreInvoiceError(
      'Mağaza API token tanımlı değil. Ayarlar → Mağaza API → Erişim token.',
      400
    );
  }

  let endpoint: string;
  try {
    endpoint = resolveStoreInvoiceEndpoint(settings);
  } catch (error) {
    if (error instanceof OutboundUrlError) {
      throw new StoreInvoiceError(error.message, 400);
    }
    throw error;
  }

  if (!endpoint) {
    throw new StoreInvoiceError(
      'Mağaza fatura API adresi tanımlı değil. Ayarlar → Mağaza API → Fatura bildirim yolu.',
      400
    );
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.trim()}`,
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
