/**
 * GelirUP tarzı finans analitiği — settlements + sipariş maliyeti
 */

import connectToDatabase from './mongodb';
import FinancialTransaction from '@/models/FinancialTransaction';
import AdSpendEntry from '@/models/AdSpendEntry';
import Order from '@/models/Order';
import Product from '@/models/Product';
import { computeDetailedProfits } from '@/lib/profit-detail';
import { netVatFromInclusive } from '@/lib/profit-vat';
import { computeCampaignProfitability } from '@/lib/campaign-profit';
import { normalizeTenantId } from '@/lib/tenant';
import {
  deductionAmount,
  isAdSpendFinanceRow,
  isCargoFinanceRow,
  isNonExpenseOtherFinancial,
  isServiceFeeFinanceRow,
  isStopajFinanceRow,
} from './trendyol-finance-classify';

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
  return isAdSpendFinanceRow('', desc);
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

export async function computeFinanceAnalytics(
  range: FinanceRange = '30g',
  tenantId?: string
) {
  await connectToDatabase();
  const scope = tenantId ? { tenantId: normalizeTenantId(tenantId) } : {};
  const { since, until } = rangeDates(range);

  const txRows = await FinancialTransaction.find({
    ...scope,
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
      if (isNonExpenseOtherFinancial(type)) {
        continue;
      }
      if (isStopajFinanceRow(type)) {
        stopaj += Number(row.debt) || 0;
      } else {
        const amt = deductionAmount(row);
        if (amt <= 0) continue;

        if (isAdSpendFinanceRow(type, descRaw)) {
          adSpendFromFinance += amt;
        } else if (isCargoFinanceRow(type, descRaw)) {
          cargoFee += amt;
        } else if (isServiceFeeFinanceRow(type, descRaw)) {
          serviceFee += amt;
        } else if (type === 'DeductionInvoices') {
          if (isAdSpendDescription(desc)) {
            adSpendFromFinance += amt;
          } else if (desc.includes('kargo')) {
            cargoFee += amt;
          } else if (desc.includes('platform') || desc.includes('hizmet')) {
            serviceFee += amt;
          } else {
            serviceFee += amt;
          }
        } else if (Number(row.debt) > 0) {
          // Bilinmeyen kesinti faturası — açıklamada kargo geçmiyorsa hizmet varsay
          serviceFee += amt;
        }
      }
    }
  }

  if (commission <= 0 && grossSales > 0 && sellerRevenue > 0) {
    commission = Math.max(0, grossSales - sellerRevenue);
  }

  const manualAdRows = await AdSpendEntry.find({
    ...scope,
    spendDate: { $gte: since, $lte: until },
  }).lean();
  const manualAdSpend = manualAdRows.reduce(
    (a, r) => a + (Number(r.amount) || 0),
    0
  );

  const trendyolOrders = await Order.find({
    ...scope,
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
  const roas = adSpend > 0 ? grossSales / adSpend : 0;
  const adRoiPct = adSpend > 0 ? (netProfitBeforeAds / adSpend) * 100 : 0;

  const barcodes = [...productAgg.keys()];
  if (barcodes.length) {
    const products = await Product.find({
      ...scope,
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

  const detailed = await computeDetailedProfits({
    since,
    until,
    totalServiceFee: serviceFee,
    totalStopaj: stopaj,
    totalAdSpend: adSpend,
    tenantId,
  });

  const cargoFromOrders = detailed.orderRows.reduce((a, r) => a + r.cargoFee, 0);
  if (cargoFromOrders > cargoFee) cargoFee = cargoFromOrders;

  const estimatedCargoCount = detailed.orderRows.filter((r) => r.cargoEstimated).length;

  const campaignProfits = await computeCampaignProfitability({
    since,
    until,
    totalServiceFee: serviceFee,
    totalStopaj: stopaj,
  });

  const vatKpis = detailed.vat;

  const netProfit =
    netProfitBeforeAds - adSpend - (vatKpis.netVat > 0 ? vatKpis.netVat : 0);
  const marginPct = grossSales > 0 ? (netProfit / grossSales) * 100 : 0;
  const profitRatePct =
    productCost + commission > 0
      ? (netProfit / (productCost + commission)) * 100
      : 0;

  const expenseBreakdown = [
    { key: 'commission', label: 'Komisyon', amount: commission },
    { key: 'cargo', label: 'Kargo', amount: cargoFee },
    { key: 'service', label: 'Hizmet bedeli', amount: serviceFee },
    { key: 'stopaj', label: 'E-ticaret stopajı', amount: stopaj },
    { key: 'discount', label: 'İndirim', amount: discount },
    { key: 'ad', label: 'Reklam harcaması', amount: adSpend },
    { key: 'cost', label: 'Ürün maliyeti', amount: productCost },
  ];
  if (detailed.vat.netVat > 0) {
    expenseBreakdown.push({
      key: 'netVat',
      label: 'Net KDV',
      amount: detailed.vat.netVat,
    });
  }
  const expenseFiltered = expenseBreakdown.filter((e) => e.amount > 0);
  const expenseTotal = expenseFiltered.reduce((a, e) => a + e.amount, 0);

  // Ürün adlarını ERP'den zenginleştir
  const barcodesDetailed = detailed.productRows.map((p) => p.barcode).filter(Boolean);
  if (barcodesDetailed.length) {
    const products = await Product.find({
      ...scope,
      $or: [
        { barcode: { $in: barcodesDetailed } },
        { 'variants.barcode': { $in: barcodesDetailed } },
      ],
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
    for (const row of detailed.productRows) {
      row.name = nameByBarcode.get(row.barcode) ?? row.name;
    }
    for (const row of detailed.lossProducts) {
      row.name = nameByBarcode.get(row.barcode) ?? row.name;
    }
  }

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
      salesVat: vatKpis.salesVat,
      costVat: vatKpis.costVat,
      netVat: vatKpis.netVat,
    },
    orderSummary: {
      total: orderCount,
      delivered,
      returned,
      cancelled,
      netSales: orderCount - cancelled,
    },
    expenseBreakdown: expenseFiltered.map((e) => ({
      ...e,
      pct: expenseTotal > 0 ? (e.amount / expenseTotal) * 100 : 0,
    })),
    topBySales,
    topByProfit,
    dailySeries: detailed.dailySeries,
    orderProfits: detailed.orderRows.slice(0, 50),
    productProfits: detailed.productRows.slice(0, 50),
    lossOrders: detailed.lossOrders.slice(0, 20),
    lossProducts: detailed.lossProducts.slice(0, 20),
    estimatedCargoCount,
    campaignProfits,
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
