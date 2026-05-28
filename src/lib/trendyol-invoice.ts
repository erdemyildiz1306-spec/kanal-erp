import axios from 'axios';
import { TrendyolEndpoints } from '@/lib/trendyol-endpoints';
import { getTrendyolAuthHeader, formatTrendyolAxiosError } from '@/lib/trendyol';

export type TrendyolInvoiceLinkPayload = {
  invoiceLink: string;
  shipmentPackageId: number;
  invoiceDateTime?: number;
  invoiceNumber?: string;
};

export type TrendyolDeleteInvoiceLinkPayload = {
  serviceSourceId: number;
  channelId: 1;
  customerId: number;
};

/** Trendyol fatura numarası: [3 alfanumerik][4 yıl][9 rakam] */
export function isValidTrendyolInvoiceNumber(value: string): boolean {
  return /^[A-Za-z0-9]{3}20[2-9][0-9]\d{9}$/.test(String(value ?? '').trim());
}

export function buildTrendyolInvoiceNumber(prefix: string, sequence: number): string {
  const p = String(prefix ?? 'ERP')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .padEnd(3, 'X')
    .slice(0, 3);
  const year = new Date().getFullYear();
  const seq = Math.max(1, Math.floor(sequence));
  return `${p}${year}${String(seq).padStart(9, '0')}`;
}

export async function sendTrendyolInvoiceLink(input: {
  sellerId: string;
  apiKey: string;
  apiSecret: string;
  payload: TrendyolInvoiceLinkPayload;
}) {
  const headers = getTrendyolAuthHeader(input.apiKey, input.apiSecret, input.sellerId);
  const url = TrendyolEndpoints.sellerInvoiceLinks(input.sellerId);
  const response = await axios.post(url, input.payload, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    timeout: 90_000,
    validateStatus: (s) => s === 201 || s < 500,
  });
  if (response.status !== 201) {
    throw new Error(formatTrendyolAxiosError({ response, message: 'Fatura linki gönderilemedi' }));
  }
  return response.data;
}

export async function deleteTrendyolInvoiceLink(input: {
  sellerId: string;
  apiKey: string;
  apiSecret: string;
  payload: TrendyolDeleteInvoiceLinkPayload;
}) {
  const headers = getTrendyolAuthHeader(input.apiKey, input.apiSecret, input.sellerId);
  const url = TrendyolEndpoints.sellerInvoiceLinksDelete(input.sellerId);
  const response = await axios.post(url, input.payload, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    timeout: 90_000,
    validateStatus: (s) => s === 202 || s < 500,
  });
  if (response.status !== 202) {
    throw new Error(formatTrendyolAxiosError({ response, message: 'Fatura linki silinemedi' }));
  }
  return response.data;
}

export async function uploadTrendyolInvoiceFile(input: {
  sellerId: string;
  apiKey: string;
  apiSecret: string;
  shipmentPackageId: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  invoiceDateTime?: number;
  invoiceNumber?: string;
}) {
  const headers = getTrendyolAuthHeader(input.apiKey, input.apiSecret, input.sellerId);
  const form = new FormData();
  form.append('shipmentPackageId', input.shipmentPackageId);
  form.append(
    'file',
    new Blob([new Uint8Array(input.fileBuffer)], { type: input.mimeType }),
    input.fileName
  );
  if (input.invoiceDateTime != null && input.invoiceDateTime > 0) {
    form.append('invoiceDateTime', String(input.invoiceDateTime));
  }
  if (input.invoiceNumber?.trim()) {
    form.append('invoiceNumber', input.invoiceNumber.trim());
  }

  const url = TrendyolEndpoints.sellerInvoiceFile(input.sellerId);
  const response = await axios.post(url, form, {
    headers,
    timeout: 120_000,
    maxBodyLength: 11 * 1024 * 1024,
    maxContentLength: 11 * 1024 * 1024,
  });
  return response.data;
}

export function unixInvoiceDateTime(date = new Date()): number {
  return Math.floor(date.getTime() / 1000);
}
