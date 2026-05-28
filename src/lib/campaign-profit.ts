/**
 * Kampanya bazlı reklam kârlılığı — günlük sipariş kârını harcamaya orantılar.
 */

import AdSpendEntry from '@/models/AdSpendEntry';
import Order from '@/models/Order';
import { computeDetailedProfits } from '@/lib/profit-detail';

export type CampaignProfitRow = {
  campaign: string;
  spend: number;
  spendDays: number;
  attributedGross: number;
  attributedNetProfit: number;
  orderCount: number;
  roas: number;
  roiPct: number;
  profitAfterSpend: number;
  source: 'manual' | 'trendyol_finance' | 'mixed';
};

function campaignLabel(row: { campaign?: string; note?: string }): string {
  const c = String(row.campaign ?? '').trim();
  if (c) return c;
  const n = String(row.note ?? '').trim();
  if (n) return n.slice(0, 80);
  return 'Genel reklam';
}

export async function computeCampaignProfitability(input: {
  since: Date;
  until: Date;
  totalServiceFee: number;
  totalStopaj: number;
}): Promise<CampaignProfitRow[]> {
  const { since, until, totalServiceFee, totalStopaj } = input;

  const adRows = await AdSpendEntry.find({
    spendDate: { $gte: since, $lte: until },
  }).lean();

  if (!adRows.length) return [];

  const detailed = await computeDetailedProfits({
    since,
    until,
    totalServiceFee,
    totalStopaj,
  });

  const grossByDay = new Map<string, number>();
  const profitByDay = new Map<string, number>();
  const ordersByDay = new Map<string, number>();

  const orders = await Order.find({
    platform: 'trendyol',
    createdAt: { $gte: since, $lte: until },
    status: { $nin: ['İptal Edildi'] },
  })
    .select('orderNumber createdAt totalAmount')
    .lean();

  const profitByOrder = new Map(
    detailed.orderRows.map((r) => [r.orderNumber, r])
  );

  for (const o of orders) {
    const day = new Date(o.createdAt).toISOString().slice(0, 10);
    const row = profitByOrder.get(o.orderNumber);
    const gross = (row?.grossSales ?? Number(o.totalAmount)) || 0;
    const profit = row?.netProfit ?? 0;
    grossByDay.set(day, (grossByDay.get(day) ?? 0) + gross);
    profitByDay.set(day, (profitByDay.get(day) ?? 0) + profit);
    ordersByDay.set(day, (ordersByDay.get(day) ?? 0) + 1);
  }

  type CampAgg = {
    campaign: string;
    spend: number;
    spendDays: Set<string>;
    attributedGross: number;
    attributedNetProfit: number;
    orderCount: number;
    sources: Set<string>;
  };

  const spendByDayCampaign = new Map<string, Map<string, { amount: number; source: string }>>();

  for (const row of adRows) {
    const day = new Date(row.spendDate).toISOString().slice(0, 10);
    const camp = campaignLabel(row);
    const amt = Number(row.amount) || 0;
    const src = String(row.source ?? 'manual');
    const dayMap = spendByDayCampaign.get(day) ?? new Map();
    const prev = dayMap.get(camp) ?? { amount: 0, source: src };
    prev.amount += amt;
    if (prev.source !== src && src) prev.source = 'mixed';
    dayMap.set(camp, prev);
    spendByDayCampaign.set(day, dayMap);
  }

  const campAgg = new Map<string, CampAgg>();

  for (const [day, campaigns] of spendByDayCampaign) {
    const daySpendTotal = [...campaigns.values()].reduce((a, c) => a + c.amount, 0);
    const dayGross = grossByDay.get(day) ?? 0;
    const dayProfit = profitByDay.get(day) ?? 0;
    const dayOrders = ordersByDay.get(day) ?? 0;

    for (const [camp, { amount, source }] of campaigns) {
      const share = daySpendTotal > 0 ? amount / daySpendTotal : 1;
      const prev = campAgg.get(camp) ?? {
        campaign: camp,
        spend: 0,
        spendDays: new Set<string>(),
        attributedGross: 0,
        attributedNetProfit: 0,
        orderCount: 0,
        sources: new Set<string>(),
      };
      prev.spend += amount;
      prev.spendDays.add(day);
      prev.attributedGross += dayGross * share;
      prev.attributedNetProfit += dayProfit * share;
      prev.orderCount += Math.round(dayOrders * share);
      prev.sources.add(source);
      campAgg.set(camp, prev);
    }
  }

  return [...campAgg.values()]
    .map((c) => {
      const profitAfterSpend = c.attributedNetProfit - c.spend;
      const roas = c.spend > 0 ? c.attributedGross / c.spend : 0;
      const roiPct = c.spend > 0 ? (profitAfterSpend / c.spend) * 100 : 0;
      let source: CampaignProfitRow['source'] = 'manual';
      if (c.sources.has('trendyol_finance') && c.sources.has('manual')) source = 'mixed';
      else if (c.sources.has('trendyol_finance')) source = 'trendyol_finance';

      return {
        campaign: c.campaign,
        spend: Math.round(c.spend * 100) / 100,
        spendDays: c.spendDays.size,
        attributedGross: Math.round(c.attributedGross * 100) / 100,
        attributedNetProfit: Math.round(c.attributedNetProfit * 100) / 100,
        orderCount: c.orderCount,
        roas: Math.round(roas * 100) / 100,
        roiPct: Math.round(roiPct * 100) / 100,
        profitAfterSpend: Math.round(profitAfterSpend * 100) / 100,
        source,
      };
    })
    .sort((a, b) => b.profitAfterSpend - a.profitAfterSpend);
}
