/**
 * GelirUP tarzı finans analitiği — settlements + sipariş maliyeti
 */

import connectToDatabase from './mongodb';
import FinancialTransaction from '@/models/FinancialTransaction';
import AdSpendEntry from '@/models/AdSpendEntry';
import Order from '@/models/Order';
import Product from '@/models/Product';

export type FinanceRange = '7g' | '30g' | 'bu-ay' | 'bu-yil';

function rangeDates(range: FinanceRange): { since: Date; until: Date } {
  const until = new Date();
  const since = new Date(until);
  since.setHours(0, 0, 0, 0);
  switch (range) {
    case '7g':
      since.setDate(since.getDate() - 6);
      break;
    case '30g':
      since.setDate(since.getDate() - 29);
      break;
    case 'bu-yil':
      since.setMonth(0, 1);
      break;
    case 'bu-ay':
    default:
      since.setDate(1);
      break;
  }
  return { since, until };
}

function isSaleType(t: string) {
  return t === 'Sale' || t === 'Satış';
}

function isReturnType(t: string) {
  return t === 'Return' || t === 'İade';
}

function isCommissionNegativeType(t: string) {
  return /^CommissionNegative$/i.test(t) || t === 'Komisyon Negatif Düzeltme';
}

function isCommissionPositiveType(t: string) {
  return /^CommissionPositive$/i.test(t) || t === 'Komisyon Pozitif Düzeltme';
}

function isAdSpendDescription(desc: string): boolean {
  const d = desc.toLocaleLowerCase('tr-TR');
  return /reklam|sponsor|mağaza reklam|ürün reklam|advert|\bads\b|kampanya reklam|performance/.test(
    d
  );
}

function isCargoInvoiceDescription(desc: string): boolean {
  const d = String(desc ?? '').toLocaleLowerCase('tr-TR');
  return /kargo\s*fatur|kargo fatura|gönderi kargo|iade kargo/.test(d);
}

function isServiceFeeDescription(desc: string): boolean {
  const d = String(desc ?? '').toLocaleLowerCase('tr-TR');
  return /platform|hizmet bedel|international service|ty hizmet/.test(d);
}

function saleCommission(row: {
  credit?: number;
  sellerRevenue?: number;
  commissionAmount?: number;
}): number {
  const credit = Number(row.credit) || 0;
  const rev = Number(row.sellerRevenue) || 0;
  const fromField = Number(row.commissionAmount) || 0;
  const implied = credit > 0 && rev >= 0 ? Math.max(0, credit - rev) : 0;
  return Math.max(fromField, implied);
}

export async function computeFinanceAnalytics(range: FinanceRange = '30g') {
  await connectToDatabase();
  const { since, until } = rangeDates(range);

  const txRows = await FinancialTransaction.find({
    transactionDate: { $gte: since, $lte: until },
  }).lean();

  let grossSales = 0;
  let commission = 0;
  let sellerRevenue = 0;
  let returns = 0;
  let stopaj = 0;
  let serviceFee = 0;
  let cargoFee = 0;
  let discount = 0;
  let adSpendFromFinance = 0;

  const productAgg = new Map<
    string,
    { barcode: string; sales: number; revenue: number; profit: number; name: string }
  >();

  for (const row of txRows) {
    const type = String(row.transactionType ?? '');
    const descRaw = String(row.description ?? '');
    const desc = descRaw.toLocaleLowerCase('tr-TR');

    if (row.source === 'settlement') {
      if (isSaleType(type)) {
        const credit = Number(row.credit) || 0;
        const rev = Number(row.sellerRevenue) || 0;
        grossSales += credit;
        commission += saleCommission(row);
        sellerRevenue += rev;

        const bc = String(row.barcode ?? '').trim();
        if (bc) {
          const prev = productAgg.get(bc) ?? {
            barcode: bc,
            sales: 0,
            revenue: 0,
            profit: 0,
            name: bc,
          };
          prev.sales += 1;
          prev.revenue += credit;
          prev.profit += rev;
          productAgg.set(bc, prev);
        }
      } else if (isReturnType(type)) {
        returns += Number(row.debt) || 0;
        const rev = Number(row.sellerRevenue) || 0;
        sellerRevenue -= rev > 0 ? rev : Number(row.debt) || 0;
        const comm = Number(row.commissionAmount) || 0;
        if (comm > 0) commission -= comm;
      } else if (isCommissionNegativeType(type)) {
        commission += Number(row.commissionAmount) || Number(row.debt) || 0;
      } else if (isCommissionPositiveType(type)) {
        commission -= Number(row.commissionAmount) || Number(row.credit) || 0;
      } else if (
        type === 'Discount' ||
        type === 'İndirim' ||
        type === 'Coupon' ||
        type === 'Kupon'
      ) {
        discount += Number(row.debt) || 0;
        sellerRevenue -= Number(row.sellerRevenue) || Number(row.debt) || 0;
      } else if (
        type === 'DiscountCancel' ||
        type === 'İndirim İptal' ||
        type === 'CouponCancel' ||
        type === 'Kupon İptal'
      ) {
        discount -= Number(row.credit) || 0;
        sellerRevenue += Number(row.sellerRevenue) || Number(row.credit) || 0;
      }
    } else if (row.source === 'otherfinancial') {
      if (type === 'Stoppage' || type === 'E-ticaret Stopajı') {
        stopaj += Number(row.debt) || 0;
      } else if (type === 'DeductionInvoices') {
        const amt =
          Number(row.cargoInvoiceTotal) > 0
            ? Number(row.cargoInvoiceTotal)
            : Number(row.debt) || 0;
        if (isAdSpendDescription(desc)) {
          adSpendFromFinance += amt;
        } else if (isCargoInvoiceDescription(descRaw)) {
          cargoFee += amt;
        } else if (isServiceFeeDescription(desc)) {
          serviceFee += amt;
        } else if (desc.includes('kargo')) {
          cargoFee += amt;
        } else {
          serviceFee += amt;
        }
      }
    }
  }

  if (commission <= 0 && grossSales > 0 && sellerRevenue > 0) {
    commission = Math.max(0, grossSales - sellerRevenue);
  }

  const manualAdRows = await AdSpendEntry.find({
    spendDate: { $gte: since, $lte: until },
  }).lean();
  const manualAdSpend = manualAdRows.reduce(
    (a, r) => a + (Number(r.amount) || 0),
    0
  );

  const trendyolOrders = await Order.find({
    platform: 'trendyol',
    createdAt: { $gte: since, $lte: until },
    status: { $ne: 'İptal Edildi' },
  }).lean();

  let productCost = 0;
  let orderCount = trendyolOrders.length;
  let cancelled = 0;
  let returned = 0;
  let delivered = 0;

  for (const o of trendyolOrders) {
    productCost += Number(o.costAmount) || 0;
    const st = String(o.status ?? '');
    if (st === 'İptal Edildi') cancelled++;
    else if (st === 'İade Edildi') returned++;
    else if (st === 'Teslim Edildi') delivered++;
  }

  const netProfitBeforeAds =
    sellerRevenue - productCost - stopaj - serviceFee - cargoFee - discount;
  const adSpend = adSpendFromFinance + manualAdSpend;
  const netProfit = netProfitBeforeAds - adSpend;
  const roas = adSpend > 0 ? grossSales / adSpend : 0;
  const adRoiPct = adSpend > 0 ? (netProfitBeforeAds / adSpend) * 100 : 0;

  const marginPct = grossSales > 0 ? (netProfit / grossSales) * 100 : 0;
  const profitRatePct =
    productCost + commission > 0
      ? (netProfit / (productCost + commission)) * 100
      : 0;

  const barcodes = [...productAgg.keys()];
  if (barcodes.length) {
    const products = await Product.find({
      $or: [{ barcode: { $in: barcodes } }, { 'variants.barcode': { $in: barcodes } }],
    })
      .select('name barcode variants')
      .lean();
    const nameByBarcode = new Map<string, string>();
    for (const p of products) {
      if (p.barcode) nameByBarcode.set(String(p.barcode), String(p.name));
      for (const v of p.variants ?? []) {
        if (v.barcode) nameByBarcode.set(String(v.barcode), String(p.name));
      }
    }
    for (const [bc, agg] of productAgg) {
      agg.name = nameByBarcode.get(bc) ?? bc;
    }
  }

  const topBySales = [...productAgg.values()]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 10)
    .map((r) => ({
      name: r.name,
      barcode: r.barcode,
      sales: r.sales,
      revenue: r.revenue,
    }));

  const topByProfit = [...productAgg.values()]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10)
    .map((r) => ({
      name: r.name,
      barcode: r.barcode,
      profit: r.profit,
      marginPct: r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0,
    }));

  const expenseBreakdown = [
    { key: 'commission', label: 'Komisyon', amount: commission },
    { key: 'cargo', label: 'Kargo', amount: cargoFee },
    { key: 'service', label: 'Hizmet bedeli', amount: serviceFee },
    { key: 'stopaj', label: 'E-ticaret stopajı', amount: stopaj },
    { key: 'discount', label: 'İndirim', amount: discount },
    { key: 'ad', label: 'Reklam harcaması', amount: adSpend },
    { key: 'cost', label: 'Ürün maliyeti', amount: productCost },
  ].filter((e) => e.amount > 0);

  const expenseTotal = expenseBreakdown.reduce((a, e) => a + e.amount, 0);

  return {
    range,
    since: since.toISOString(),
    until: until.toISOString(),
    hasFinanceData: txRows.length > 0,
    kpis: {
      grossSales,
      netProfit,
      marginPct,
      profitRatePct,
      sellerRevenue,
      productCost,
      commission,
      cargoFee,
      serviceFee,
      stopaj,
      discount,
      returns,
      adSpend,
      adSpendFromFinance,
      manualAdSpend,
      roas,
      adRoiPct,
      netProfitBeforeAds,
    },
    orderSummary: {
      total: orderCount,
      delivered,
      returned,
      cancelled,
      netSales: orderCount - cancelled,
    },
    expenseBreakdown: expenseBreakdown.map((e) => ({
      ...e,
      pct: expenseTotal > 0 ? (e.amount / expenseTotal) * 100 : 0,
    })),
    topBySales,
    topByProfit,
    transactionCount: txRows.length,
    adSpendEntries: manualAdRows.map((r) => ({
      id: String(r._id),
      spendDate: r.spendDate,
      amount: Number(r.amount) || 0,
      campaign: String(r.campaign ?? ''),
      note: String(r.note ?? ''),
      source: String(r.source ?? 'manual'),
    })),
  };
}
