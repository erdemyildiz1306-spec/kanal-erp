/**
 * Sipariş / ürün bazlı net kâr — GelirUP tarzı (hakediş + kargo + paylaştırılmış giderler)
 */

import FinancialTransaction from '@/models/FinancialTransaction';
import CargoCharge from '@/models/CargoCharge';
import Order from '@/models/Order';
import Product from '@/models/Product';
import { netVatFromInclusive } from '@/lib/profit-vat';
import { estimateOrderCargoFee, resolveProductDesi } from '@/lib/cargo-estimate';
import { getFinanceDefaults } from '@/lib/finance-defaults';

export type OrderProfitRow = {
  orderNumber: string;
  status: string;
  customerName: string;
  grossSales: number;
  sellerRevenue: number;
  commission: number;
  productCost: number;
  cargoFee: number;
  cargoEstimated: boolean;
  serviceFee: number;
  stopajShare: number;
  netProfit: number;
  marginPct: number;
  financeSynced: boolean;
};

export type ProductProfitRow = {
  barcode: string;
  name: string;
  sales: number;
  revenue: number;
  commission: number;
  cargoFee: number;
  productCost: number;
  netProfit: number;
  marginPct: number;
};

export type DailyFinancePoint = {
  date: string;
  grossSales: number;
  netProfit: number;
  orderCount: number;
};

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

export async function buildOrderFinanceMap(since: Date, until: Date) {
  const sales = await FinancialTransaction.find({
    source: 'settlement',
    transactionType: { $in: ['Sale', 'Satış'] },
    transactionDate: { $gte: since, $lte: until },
    orderNumber: { $ne: '' },
  }).lean();

  const byOrder = new Map<
    string,
    { gross: number; sellerRevenue: number; commission: number }
  >();

  for (const row of sales) {
    const key = String(row.orderNumber);
    const prev = byOrder.get(key) ?? { gross: 0, sellerRevenue: 0, commission: 0 };
    prev.gross += Number(row.credit) || 0;
    prev.sellerRevenue += Number(row.sellerRevenue) || 0;
    prev.commission += saleCommission(row);
    byOrder.set(key, prev);
  }

  return byOrder;
}

export async function buildCargoByOrder(orderNumbers: string[]) {
  const byOrder = new Map<string, number>();
  if (!orderNumbers.length) return byOrder;

  const charges = await CargoCharge.find({
    orderNumber: { $in: orderNumbers },
  }).lean();

  for (const c of charges) {
    const key = String(c.orderNumber ?? '').trim();
    if (!key) continue;
    byOrder.set(key, (byOrder.get(key) ?? 0) + (Number(c.amount) || 0));
  }
  return byOrder;
}

async function buildProductShippingMaps(barcodes: string[]) {
  const desiByBarcode = new Map<string, number>();
  const cargoByBarcode = new Map<string, number>();
  if (!barcodes.length) return { desiByBarcode, cargoByBarcode };

  const defaults = await getFinanceDefaults();
  const products = await Product.find({
    $or: [{ barcode: { $in: barcodes } }, { 'variants.barcode': { $in: barcodes } }],
  })
    .select('barcode variants dimensionalWeight cargoFee trendyolAttributes')
    .lean();

  for (const p of products) {
    const desi = resolveProductDesi(p, defaults.defaultDesi);
    const cargo = Number((p as { cargoFee?: number }).cargoFee) || 0;
    if (p.barcode) {
      desiByBarcode.set(String(p.barcode), desi);
      if (cargo > 0) cargoByBarcode.set(String(p.barcode), cargo);
    }
    for (const v of p.variants ?? []) {
      if (v.barcode) {
        desiByBarcode.set(String(v.barcode), desi);
        if (cargo > 0) cargoByBarcode.set(String(v.barcode), cargo);
      }
    }
  }
  return { desiByBarcode, cargoByBarcode };
}

export async function computeDetailedProfits(input: {
  since: Date;
  until: Date;
  totalServiceFee: number;
  totalStopaj: number;
  totalAdSpend?: number;
}): Promise<{
  orderRows: OrderProfitRow[];
  productRows: ProductProfitRow[];
  dailySeries: DailyFinancePoint[];
  lossOrders: OrderProfitRow[];
  lossProducts: ProductProfitRow[];
  vat: { salesVat: number; costVat: number; netVat: number };
}> {
  const { since, until, totalServiceFee, totalStopaj } = input;

  const orders = await Order.find({
    platform: 'trendyol',
    createdAt: { $gte: since, $lte: until },
    status: { $nin: ['İptal Edildi'] },
  }).lean();

  const financeByOrder = await buildOrderFinanceMap(since, until);
  const orderNumbers = orders.map((o) => o.orderNumber);
  const cargoByOrder = await buildCargoByOrder(orderNumbers);
  const financeDefaults = await getFinanceDefaults();

  const allBarcodes = new Set<string>();
  for (const o of orders) {
    for (const line of o.items ?? []) {
      const bc = String(line.barcode ?? line.sku ?? '').trim();
      if (bc) allBarcodes.add(bc);
    }
  }
  const { desiByBarcode, cargoByBarcode } = await buildProductShippingMaps([...allBarcodes]);

  let allocBase = 0;
  for (const o of orders) {
    const fin = financeByOrder.get(o.orderNumber);
    allocBase += (fin?.sellerRevenue ?? fin?.gross ?? Number(o.totalAmount)) || 0;
  }
  if (allocBase <= 0) {
    allocBase = orders.reduce((a, o) => a + (Number(o.totalAmount) || 0), 0) || 1;
  }

  const orderRows: OrderProfitRow[] = [];
  const dailyMap = new Map<string, DailyFinancePoint>();
  const productAgg = new Map<
    string,
    {
      barcode: string;
      name: string;
      sales: number;
      revenue: number;
      commission: number;
      cargoFee: number;
      productCost: number;
    }
  >();

  let totalGross = 0;
  let totalCost = 0;

  for (const o of orders) {
    const fin = financeByOrder.get(o.orderNumber);
    const gross = (fin?.gross ?? Number(o.totalAmount)) || 0;
    const sellerRevenue = fin?.sellerRevenue ?? gross - (fin?.commission ?? 0);
    const commission = fin?.commission ?? Math.max(0, gross - sellerRevenue);
    const productCost = Number(o.costAmount) || 0;
    let cargoFee =
      (cargoByOrder.get(o.orderNumber) ??
        Number((o as { trendyolCargoFee?: number }).trendyolCargoFee)) || 0;
    let cargoEstimated = false;
    if (cargoFee <= 0) {
      const est = estimateOrderCargoFee({
        lines: o.items ?? [],
        cargoByBarcode,
        desiByBarcode,
        defaults: {
          defaultDesi: financeDefaults.defaultDesi,
          defaultCargoFee: financeDefaults.defaultCargoFee,
          cargoTariff: financeDefaults.cargoTariff,
        },
      });
      cargoFee = est.fee;
      cargoEstimated = true;
    }

    const weight = sellerRevenue > 0 ? sellerRevenue : gross;
    const serviceFee = (weight / allocBase) * totalServiceFee;
    const stopajShare = (weight / allocBase) * totalStopaj;

    const netProfit = sellerRevenue - productCost - cargoFee - serviceFee - stopajShare;

    orderRows.push({
      orderNumber: o.orderNumber,
      status: String(o.status ?? ''),
      customerName: String(o.customerName ?? ''),
      grossSales: gross,
      sellerRevenue,
      commission,
      productCost,
      cargoFee,
      cargoEstimated,
      serviceFee,
      stopajShare,
      netProfit,
      marginPct: gross > 0 ? (netProfit / gross) * 100 : 0,
      financeSynced: Boolean(fin),
    });

    totalGross += gross;
    totalCost += productCost;

    const day = new Date(o.createdAt).toISOString().slice(0, 10);
    const d = dailyMap.get(day) ?? {
      date: day,
      grossSales: 0,
      netProfit: 0,
      orderCount: 0,
    };
    d.grossSales += gross;
    d.netProfit += netProfit;
    d.orderCount += 1;
    dailyMap.set(day, d);

    const lineCount = (o.items ?? []).length || 1;
    const cargoPerLine = cargoFee / lineCount;
    const servicePerLine = serviceFee / lineCount;
    const stopajPerLine = stopajShare / lineCount;

    for (const line of o.items ?? []) {
      const bc = String(line.barcode ?? line.sku ?? '').trim();
      if (!bc) continue;
      const lineGross =
        Number(line.totalPrice) ||
        Number(line.unitPrice) * (Number(line.quantity) || 1) ||
        gross / lineCount;
      const lineRev = gross > 0 ? (lineGross / gross) * sellerRevenue : lineGross;
      const lineComm = gross > 0 ? (lineGross / gross) * commission : 0;
      const lineCost =
        (Number(line.costPrice) || 0) * (Number(line.quantity) || 1) ||
        (productCost / lineCount);

      const prev = productAgg.get(bc) ?? {
        barcode: bc,
        name: String(line.productName ?? bc),
        sales: 0,
        revenue: 0,
        commission: 0,
        cargoFee: 0,
        productCost: 0,
      };
      prev.sales += Number(line.quantity) || 1;
      prev.revenue += lineRev;
      prev.commission += lineComm;
      prev.cargoFee += cargoPerLine;
      prev.productCost += lineCost;
      productAgg.set(bc, prev);
    }
  }

  const productRows: ProductProfitRow[] = [...productAgg.values()]
    .map((p) => {
      const lineService = allocBase > 0 ? (p.revenue / allocBase) * totalServiceFee : 0;
      const lineStopaj = allocBase > 0 ? (p.revenue / allocBase) * totalStopaj : 0;
      const netProfitFixed =
        p.revenue - p.productCost - p.cargoFee - lineService - lineStopaj;
      return {
        barcode: p.barcode,
        name: p.name,
        sales: p.sales,
        revenue: p.revenue,
        commission: p.commission,
        cargoFee: p.cargoFee,
        productCost: p.productCost,
        netProfit: netProfitFixed,
        marginPct: p.revenue > 0 ? (netProfitFixed / p.revenue) * 100 : 0,
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit);

  const vat = netVatFromInclusive(totalGross, totalCost);

  return {
    orderRows: orderRows.sort((a, b) => b.netProfit - a.netProfit),
    productRows,
    dailySeries: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    lossOrders: orderRows.filter((r) => r.netProfit < 0).sort((a, b) => a.netProfit - b.netProfit),
    lossProducts: productRows.filter((r) => r.netProfit < 0).sort((a, b) => a.netProfit - b.netProfit),
    vat,
  };
}

export async function syncOrderFinanceFields(since: Date): Promise<number> {
  const until = new Date();
  const financeByOrder = await buildOrderFinanceMap(since, until);
  const orderNumbers = [...financeByOrder.keys()];
  const cargoByOrder = await buildCargoByOrder(orderNumbers);

  let updated = 0;
  for (const [orderNumber, fin] of financeByOrder) {
    const order = await Order.findOne({ orderNumber }).lean();
    const cargo = cargoByOrder.get(orderNumber) ?? 0;
    const cost = Number(order?.costAmount) || 0;
    const netProfit = fin.sellerRevenue - cost - cargo;
    await Order.updateOne(
      { orderNumber },
      {
        $set: {
          trendyolCommission: fin.commission,
          trendyolSellerRevenue: fin.sellerRevenue,
          trendyolCargoFee: cargo,
          netProfitAmount: netProfit,
          financeSyncedAt: new Date(),
        },
      }
    );
    updated++;
  }

  for (const [orderNumber, cargo] of cargoByOrder) {
    if (financeByOrder.has(orderNumber)) continue;
    await Order.updateOne(
      { orderNumber },
      { $set: { trendyolCargoFee: cargo, financeSyncedAt: new Date() } }
    );
    updated++;
  }

  return updated;
}
