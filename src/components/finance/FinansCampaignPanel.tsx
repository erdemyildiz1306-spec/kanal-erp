"use client";

import { Megaphone } from "lucide-react";

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
  source: string;
};

function fmt(n: number) {
  return `₺${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number) {
  return `%${n.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
}

export default function FinansCampaignPanel({
  rows,
  loading,
}: {
  rows: CampaignProfitRow[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="erp-card p-8 text-center erp-muted text-sm">
        Kampanya verileri yükleniyor…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="erp-card p-8 text-center space-y-2">
        <Megaphone size={32} className="mx-auto erp-muted opacity-50" />
        <p className="font-medium">Henüz reklam / kampanya harcaması yok</p>
        <p className="text-sm erp-muted max-w-md mx-auto">
          Manuel reklam girişi yapın veya «Trendyol Finans Çek» ile ekstreden otomatik
          çekilsin. Kampanya adı girerseniz kârlılık o kampanyaya göre hesaplanır.
        </p>
      </div>
    );
  }

  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  const totalProfit = rows.reduce((a, r) => a + r.profitAfterSpend, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="erp-card p-4">
          <p className="text-xs erp-muted">Toplam reklam</p>
          <p className="text-xl font-bold">{fmt(totalSpend)}</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-xs erp-muted">Kampanya sayısı</p>
          <p className="text-xl font-bold">{rows.length}</p>
        </div>
        <div className="erp-card p-4 col-span-2 md:col-span-1">
          <p className="text-xs erp-muted">Reklam sonrası net kâr</p>
          <p
            className={`text-xl font-bold ${
              totalProfit >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {fmt(totalProfit)}
          </p>
        </div>
      </div>

      <div className="erp-card p-5 overflow-x-auto">
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <Megaphone size={18} />
          Kampanya bazlı kârlılık
        </h3>
        <p className="text-xs erp-muted mb-4">
          Aynı gün içindeki sipariş kârı, o günün reklam harcamasına kampanya payına göre
          dağıtılır. Gerçek fatura + desi kargo + hakediş kullanılır.
        </p>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left erp-muted border-b">
              <th className="py-2 pr-3">Kampanya</th>
              <th className="py-2 pr-3">Harcama</th>
              <th className="py-2 pr-3">Atfedilen ciro</th>
              <th className="py-2 pr-3">ROAS</th>
              <th className="py-2 pr-3">ROI</th>
              <th className="py-2 text-right">Reklam sonrası kâr</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.campaign} className="border-b border-slate-50">
                <td className="py-3 pr-3">
                  <div className="font-medium">{r.campaign}</div>
                  <div className="text-[10px] erp-muted">
                    {r.spendDays} gün · {r.orderCount} sip. · {r.source}
                  </div>
                </td>
                <td className="py-3 pr-3">{fmt(r.spend)}</td>
                <td className="py-3 pr-3">{fmt(r.attributedGross)}</td>
                <td className="py-3 pr-3">{r.roas.toFixed(2)}x</td>
                <td className="py-3 pr-3">{fmtPct(r.roiPct)}</td>
                <td
                  className={`py-3 text-right font-semibold ${
                    r.profitAfterSpend >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {fmt(r.profitAfterSpend)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
