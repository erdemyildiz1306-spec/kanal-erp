/** Trendyol / GelirUP tarzı KDV özeti (KDV dahil tutarlardan) */

export const DEFAULT_VAT_RATE = 0.2;

export function vatFromInclusive(amountInclVat: number, rate = DEFAULT_VAT_RATE): number {
  const n = Number(amountInclVat) || 0;
  if (n <= 0) return 0;
  return n - n / (1 + rate);
}

export function netVatFromInclusive(
  salesIncl: number,
  costIncl: number,
  rate = DEFAULT_VAT_RATE
): { salesVat: number; costVat: number; netVat: number } {
  const salesVat = vatFromInclusive(salesIncl, rate);
  const costVat = vatFromInclusive(costIncl, rate);
  return { salesVat, costVat, netVat: salesVat - costVat };
}
