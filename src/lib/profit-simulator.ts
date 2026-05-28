/**
 * Fiyat / kampanya simülatörü — satış öncesi net kâr projeksiyonu.
 * Gerçek hakediş formülüne uyumlu; GelirUP’tan daha detaylı kırılım.
 */

import {
  estimateCargoFee,
  type CargoTariffTier,
  DEFAULT_CARGO_TARIFF,
} from '@/lib/cargo-estimate';
import { netVatFromInclusive } from '@/lib/profit-vat';

export type SimulateInput = {
  /** Liste fiyatı (KDV dahil) */
  listPrice: number;
  costPrice: number;
  commissionPct: number;
  desi?: number;
  /** Ürün sabit kargo (₺/adet) — doluysa öncelikli */
  cargoFee?: number;
  defaultCargoFee?: number;
  quantity?: number;
  /** Satıcı indirimi % (kampanya) */
  sellerDiscountPct?: number;
  /** Trendyol kupon / platform indirimi (KDV dahil, brüt düşer) */
  platformDiscount?: number;
  vatRate?: number;
  cargoTariff?: CargoTariffTier[];
  stopajRatePct?: number;
  serviceFeePerOrder?: number;
  /** Ek reklam maliyeti (sipariş başına) */
  adCostPerOrder?: number;
};

export type SimulateResult = {
  quantity: number;
  listPrice: number;
  grossSales: number;
  platformDiscount: number;
  sellerDiscount: number;
  netListPrice: number;
  commission: number;
  commissionPct: number;
  sellerRevenue: number;
  cargoFee: number;
  cargoDesi: number;
  cargoTierLabel: string;
  cargoMethod: 'fixed' | 'desi';
  cargoEstimated: boolean;
  serviceFee: number;
  stopaj: number;
  productCost: number;
  adCost: number;
  netProfit: number;
  netProfitPerUnit: number;
  marginPct: number;
  profitRatePct: number;
  salesVat: number;
  costVat: number;
  netVat: number;
  breakEvenPrice: number;
  targetPriceForMargin: (targetMarginPct: number) => number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function simulateProfit(input: SimulateInput): SimulateResult {
  const qty = Math.max(1, Number(input.quantity) || 1);
  const listPrice = Math.max(0, Number(input.listPrice) || 0);
  const costUnit = Math.max(0, Number(input.costPrice) || 0);
  const commissionPct = Math.max(0, Math.min(100, Number(input.commissionPct) || 0));
  const sellerDiscPct = Math.max(0, Math.min(100, Number(input.sellerDiscountPct) || 0));
  const platformDisc = Math.max(0, Number(input.platformDiscount) || 0);
  const vatRate = Number(input.vatRate) > 0 ? Number(input.vatRate) : 0.2;
  const stopajPct = Math.max(0, Number(input.stopajRatePct) || 0);
  const servicePerOrder = Math.max(0, Number(input.serviceFeePerOrder) || 0);
  const adPerOrder = Math.max(0, Number(input.adCostPerOrder) || 0);
  const tariff = input.cargoTariff?.length ? input.cargoTariff : DEFAULT_CARGO_TARIFF;

  const grossSales = listPrice * qty;
  const sellerDiscount = grossSales * (sellerDiscPct / 100);
  const netList = Math.max(0, grossSales - sellerDiscount - platformDisc * qty);

  const commission = netList * (commissionPct / 100);
  const sellerRevenue = netList - commission;

  const desi = Math.max(1, Number(input.desi) || 1);
  const unitCargo = Number(input.cargoFee) || 0;
  const defaultCargo = Number(input.defaultCargoFee) || 0;

  let cargoFee: number;
  let cargoDesi = 0;
  let cargoTierLabel: string;
  let cargoMethod: 'fixed' | 'desi';

  if (unitCargo > 0) {
    cargoFee = unitCargo * qty;
    cargoTierLabel = 'Sabit (ürün)';
    cargoMethod = 'fixed';
  } else if (defaultCargo > 0) {
    cargoFee = defaultCargo * qty;
    cargoTierLabel = 'Sabit (ayar varsayılanı)';
    cargoMethod = 'fixed';
  } else {
    const desiEst = estimateCargoFee(desi, tariff);
    cargoFee = desiEst.fee;
    cargoDesi = desiEst.desiUsed;
    cargoTierLabel = desiEst.tierLabel;
    cargoMethod = 'desi';
  }

  const stopaj = netList * (stopajPct / 100);
  const productCost = costUnit * qty;
  const serviceFee = servicePerOrder;
  const adCost = adPerOrder * qty;

  const netProfit =
    sellerRevenue - productCost - cargoFee - serviceFee - stopaj - adCost;

  const vat = netVatFromInclusive(netList, productCost, vatRate);

  const marginPct = netList > 0 ? (netProfit / netList) * 100 : 0;
  const profitRatePct =
    productCost + commission > 0 ? (netProfit / (productCost + commission)) * 100 : 0;

  /** Kâr = 0 için gereken minimum net liste (brüt, indirim sonrası) */
  const fixedCosts = productCost + cargoFee + serviceFee + adCost;
  const revenueFactor = 1 - commissionPct / 100 - stopajPct / 100;
  const breakEvenNetList = revenueFactor > 0 ? fixedCosts / revenueFactor : 0;
  const breakEvenPrice =
    qty > 0 && sellerDiscPct < 100
      ? (breakEvenNetList + platformDisc * qty) / (qty * (1 - sellerDiscPct / 100))
      : 0;

  const targetPriceForMargin = (targetMarginPct: number): number => {
    const m = Math.max(-99, Math.min(99, targetMarginPct)) / 100;
    const desiredProfit = m * breakEvenNetList;
    const neededNetList = (fixedCosts + desiredProfit) / (revenueFactor > 0 ? revenueFactor : 1);
    if (qty <= 0 || sellerDiscPct >= 100) return 0;
    return (neededNetList + platformDisc * qty) / (qty * (1 - sellerDiscPct / 100));
  };

  return {
    quantity: qty,
    listPrice: round2(listPrice),
    grossSales: round2(grossSales),
    platformDiscount: round2(platformDisc * qty),
    sellerDiscount: round2(sellerDiscount),
    netListPrice: round2(netList),
    commission: round2(commission),
    commissionPct,
    sellerRevenue: round2(sellerRevenue),
    cargoFee: round2(cargoFee),
    cargoDesi,
    cargoTierLabel,
    cargoMethod,
    cargoEstimated: true,
    serviceFee: round2(serviceFee),
    stopaj: round2(stopaj),
    productCost: round2(productCost),
    adCost: round2(adCost),
    netProfit: round2(netProfit),
    netProfitPerUnit: round2(netProfit / qty),
    marginPct: round2(marginPct),
    profitRatePct: round2(profitRatePct),
    salesVat: round2(vat.salesVat),
    costVat: round2(vat.costVat),
    netVat: round2(vat.netVat),
    breakEvenPrice: round2(breakEvenPrice),
    targetPriceForMargin,
  };
}
