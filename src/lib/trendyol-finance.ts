/**
 * Trendyol Cari Hesap Ekstresi — settlements + otherfinancials
 * @see https://developers.trendyol.com/docs/cari-hesap-ekstresi-entegrasyonu.md
 */

import axios from 'axios';
import connectToDatabase from './mongodb';
import FinancialTransaction from '@/models/FinancialTransaction';
import Order from '@/models/Order';
import AdSpendEntry from '@/models/AdSpendEntry';
import { getTrendyolAuthHeader, getTrendyolSettings } from './trendyol';
import { TrendyolEndpoints } from './trendyol-endpoints';
import {
  deductionAmount,
  isAdSpendFinanceRow,
  isCargoFinanceRow,
} from './trendyol-finance-classify';

const MS_DAY = 86_400_000;
const MAX_WINDOW_MS = 15 * MS_DAY;

export const SETTLEMENT_SYNC_TYPES = [
  'Sale',
  'Return',
  'Discount',
  'DiscountCancel',
  'Coupon',
  'CouponCancel',
  'CommissionNegative',
  'CommissionPositive',
  'CommissionNegativeCancel',
  'CommissionPositiveCancel',
  'SellerRevenuePositive',
  'SellerRevenueNegative',
  'ProvisionPositive',
  'ProvisionNegative',
] as const;

export const OTHER_FINANCIAL_SYNC_TYPES = [
  'Stoppage',
  'DeductionInvoices',
] as const;

type FinanceRow = {
  id?: string | number;
  transactionDate?: number;
  barcode?: string | null;
  transactionType?: string;
  description?: string | null;
  debt?: number;
  credit?: number;
  commissionRate?: number | null;
  commissionAmount?: number | null;
  sellerRevenue?: number | null;
  orderNumber?: string | null;
  paymentOrderId?: number | null;
  shipmentPackageId?: number | string | null;
};

type PageResponse = {
  content?: FinanceRow[];
  totalPages?: number;
};

function toDate(ms: unknown): Date {
  const n = Number(ms);
  return Number.isFinite(n) ? new Date(n) : new Date();
}

function mapRow(
  row: FinanceRow,
  source: 'settlement' | 'otherfinancial'
): Record<string, unknown> | null {
  const trendyolId = String(row.id ?? '').trim();
  if (!trendyolId) return null;
  return {
    trendyolId,
    source,
    transactionType: String(row.transactionType ?? ''),
    transactionDate: toDate(row.transactionDate),
    barcode: String(row.barcode ?? '').trim(),
    orderNumber: String(row.orderNumber ?? '').trim(),
    shipmentPackageId: row.shipmentPackageId != null ? String(row.shipmentPackageId) : '',
    paymentOrderId:
      row.paymentOrderId != null && Number.isFinite(Number(row.paymentOrderId))
        ? Number(row.paymentOrderId)
        : null,
    commissionAmount: Number(row.commissionAmount) || 0,
    commissionRate: row.commissionRate != null ? Number(row.commissionRate) : null,
    sellerRevenue: Number(row.sellerRevenue) || 0,
    debt: Number(row.debt) || 0,
    credit: Number(row.credit) || 0,
    description: String(row.description ?? '').trim(),
  };
}

async function fetchFinancePage(
  url: string,
  headers: Record<string, string>,
  params: Record<string, string | number>
): Promise<PageResponse> {
  const { data } = await axios.get<PageResponse>(url, {
    headers,
    params,
    timeout: 90_000,
  });
  return data ?? {};
}

async function syncTypeWindow(
  baseUrl: string,
  headers: Record<string, string>,
  source: 'settlement' | 'otherfinancial',
  transactionType: string,
  startMs: number,
  endMs: number,
  extraParams?: Record<string, string>
): Promise<number> {
  let page = 0;
  let totalPages = 1;
  let upserted = 0;

  while (page < totalPages) {
    const params: Record<string, string | number> = {
      transactionType,
      startDate: startMs,
      endDate: endMs,
      page,
      size: 500,
      ...extraParams,
    };
    const data = await fetchFinancePage(baseUrl, headers, params);
    const rows = Array.isArray(data.content) ? data.content : [];
    totalPages = Math.max(1, Number(data.totalPages) || 1);

    for (const row of rows) {
      const doc = mapRow(row, source);
      if (!doc) continue;
      await FinancialTransaction.findOneAndUpdate(
        { trendyolId: doc.trendyolId },
        { $set: doc },
        { upsert: true }
      );
      upserted++;
    }
    page++;
    if (rows.length === 0) break;
  }
  return upserted;
}

function dateWindows(start: Date, end: Date): Array<{ startMs: number; endMs: number }> {
  const windows: Array<{ startMs: number; endMs: number }> = [];
  let cursor = start.getTime();
  const endMs = end.getTime();
  while (cursor < endMs) {
    const windowEnd = Math.min(cursor + MAX_WINDOW_MS, endMs);
    windows.push({ startMs: cursor, endMs: windowEnd });
    cursor = windowEnd + 1;
  }
  return windows;
}

/** Siparişlere settlement Sale verilerinden komisyon / hakediş yansıt */
async function applySaleFinanceToOrders(since: Date): Promise<number> {
  const sales = await FinancialTransaction.find({
    transactionType: { $in: ['Sale', 'Satış'] },
    transactionDate: { $gte: since },
    orderNumber: { $ne: '' },
  }).lean();

  const byOrder = new Map<
    string,
    { commission: number; sellerRevenue: number; gross: number }
  >();

  for (const row of sales) {
    const key = String(row.orderNumber);
    const prev = byOrder.get(key) ?? { commission: 0, sellerRevenue: 0, gross: 0 };
    prev.commission += Number(row.commissionAmount) || 0;
    prev.sellerRevenue += Number(row.sellerRevenue) || 0;
    prev.gross += Number(row.credit) || 0;
    byOrder.set(key, prev);
  }

  let updated = 0;
  for (const [orderNumber, fin] of byOrder) {
    const order = await Order.findOne({ orderNumber }).lean();
    if (!order) continue;
    const cost = Number(order.costAmount) || 0;
    const netProfit = fin.sellerRevenue - cost;
    await Order.updateOne(
      { orderNumber },
      {
        $set: {
          trendyolCommission: fin.commission,
          trendyolSellerRevenue: fin.sellerRevenue,
          netProfitAmount: netProfit,
          financeSyncedAt: new Date(),
        },
      }
    );
    updated++;
  }
  return updated;
}

function isAdSpendDescription(desc: string): boolean {
  return isAdSpendFinanceRow('', desc);
}

async function fetchCargoInvoiceItemsTotal(
  sellerId: string,
  invoiceSerialNumber: string,
  headers: Record<string, string>
): Promise<number> {
  const url = TrendyolEndpoints.financeCargoInvoiceItems(sellerId, invoiceSerialNumber);
  let page = 0;
  let totalPages = 1;
  let sum = 0;

  while (page < totalPages) {
    const { data } = await axios.get<PageResponse & { content?: Array<{ amount?: number }> }>(
      url,
      { headers, params: { page, size: 500 }, timeout: 90_000 }
    );
    const rows = Array.isArray(data?.content) ? data.content : [];
    totalPages = Math.max(1, Number(data?.totalPages) || 1);
    for (const row of rows) {
      sum += Number(row.amount) || 0;
    }
    page++;
    if (!rows.length) break;
  }
  return sum;
}

/** Kargo faturası DeductionInvoices kayıtları için detay API toplamını yansıt */
async function enrichCargoInvoicesFromApi(
  since: Date,
  sellerId: string,
  headers: Record<string, string>
): Promise<number> {
  const rows = await FinancialTransaction.find({
    source: 'otherfinancial',
    transactionDate: { $gte: since },
    $or: [
      { transactionType: /kargo/i },
      { description: /kargo/i },
    ],
  }).lean();

  let enriched = 0;
  for (const row of rows) {
    const type = String(row.transactionType ?? '');
    const desc = String(row.description ?? '');
    if (!isCargoFinanceRow(type, desc)) continue;

    const invoiceId = String(row.trendyolId ?? '').trim();
    if (!invoiceId) continue;

    let cargoTotal = Number(row.debt) || 0;
    try {
      const itemSum = await fetchCargoInvoiceItemsTotal(sellerId, invoiceId, headers);
      if (itemSum > 0) cargoTotal = itemSum;
    } catch (error) {
      console.warn(`Kargo faturası detay alınamadı (${invoiceId}):`, error);
    }

    await FinancialTransaction.updateOne(
      { trendyolId: row.trendyolId },
      { $set: { cargoInvoiceTotal: cargoTotal } }
    );
    enriched++;
  }
  return enriched;
}

/** Finans ekstresindeki reklam kalemlerini AdSpendEntry olarak kaydet */
async function syncAdSpendFromFinance(since: Date): Promise<number> {
  const rows = await FinancialTransaction.find({
    source: 'otherfinancial',
    transactionDate: { $gte: since },
  }).lean();

  let upserted = 0;
  for (const row of rows) {
    const desc = String(row.description ?? '');
    const type = String(row.transactionType ?? '');
    if (!isAdSpendFinanceRow(type, desc)) continue;
    const trendyolId = `ad:${String(row.trendyolId)}`;
    const amount = Number(row.debt) || 0;
    if (amount <= 0) continue;
    await AdSpendEntry.findOneAndUpdate(
      { trendyolId },
      {
        $set: {
          trendyolId,
          spendDate: row.transactionDate,
          amount,
          platform: 'trendyol',
          campaign: desc.slice(0, 120),
          note: desc,
          source: 'trendyol_finance',
        },
      },
      { upsert: true }
    );
    upserted++;
  }
  return upserted;
}

export async function syncTrendyolFinance(opts?: {
  daysBack?: number;
}): Promise<{
  upserted: number;
  ordersUpdated: number;
  adSpendSynced: number;
  cargoInvoicesEnriched: number;
  from: string;
  to: string;
}> {
  await connectToDatabase();
  const settings = await getTrendyolSettings();
  const headers = getTrendyolAuthHeader(
    settings.apiKey,
    settings.apiSecret,
    settings.sellerId
  );

  const daysBack = Math.min(Math.max(opts?.daysBack ?? 30, 1), 90);
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * MS_DAY);
  const windows = dateWindows(start, end);

  let upserted = 0;
  const settlementsUrl = TrendyolEndpoints.financeSettlements(settings.sellerId);
  const otherUrl = TrendyolEndpoints.financeOtherFinancials(settings.sellerId);

  for (const w of windows) {
    for (const t of SETTLEMENT_SYNC_TYPES) {
      upserted += await syncTypeWindow(
        settlementsUrl,
        headers,
        'settlement',
        t,
        w.startMs,
        w.endMs
      );
    }
    for (const t of OTHER_FINANCIAL_SYNC_TYPES) {
      upserted += await syncTypeWindow(
        otherUrl,
        headers,
        'otherfinancial',
        t,
        w.startMs,
        w.endMs
      );
    }
    upserted += await syncTypeWindow(
      otherUrl,
      headers,
      'otherfinancial',
      'DeductionInvoices',
      w.startMs,
      w.endMs,
      { transactionSubType: 'PlatformServiceFee' }
    );
  }

  const ordersUpdated = await applySaleFinanceToOrders(start);
  const adSpendSynced = await syncAdSpendFromFinance(start);
  const cargoInvoicesEnriched = await enrichCargoInvoicesFromApi(
    start,
    settings.sellerId,
    headers
  );

  return {
    upserted,
    ordersUpdated,
    adSpendSynced,
    cargoInvoicesEnriched,
    from: start.toISOString(),
    to: end.toISOString(),
  };
}
