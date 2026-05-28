"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TrendingUp,
  RefreshCw,
  PieChart,
  ShoppingBag,
  MessageCircle,
  Send,
  Megaphone,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Spinner from "@/components/ui/Spinner";
import FinansSimulatorPanel from "@/components/finance/FinansSimulatorPanel";
import FinansCampaignPanel, {
  type CampaignProfitRow,
} from "@/components/finance/FinansCampaignPanel";
import { Calculator } from "lucide-react";

type FinanceRange = "7g" | "30g" | "bu-ay" | "bu-yil";

type Analytics = {
  hasFinanceData: boolean;
  kpis: {
    grossSales: number;
    netProfit: number;
    marginPct: number;
    profitRatePct: number;
    commission: number;
    sellerRevenue: number;
    cargoFee: number;
    serviceFee: number;
    stopaj: number;
    discount: number;
    productCost: number;
    returns: number;
    adSpend: number;
    adSpendFromFinance: number;
    manualAdSpend: number;
    roas: number;
    adRoiPct: number;
    netProfitBeforeAds: number;
    salesVat: number;
    costVat: number;
    netVat: number;
  };
  orderSummary: {
    total: number;
    delivered: number;
    returned: number;
    cancelled: number;
    netSales: number;
  };
  expenseBreakdown: Array<{ key: string; label: string; amount: number; pct: number }>;
  topBySales: Array<{ name: string; barcode: string; sales: number; revenue: number }>;
  topByProfit: Array<{ name: string; barcode: string; profit: number; marginPct: number }>;
  transactionCount: number;
  adSpendEntries?: Array<{
    id: string;
    spendDate: string;
    amount: number;
    campaign: string;
    note: string;
    source: string;
  }>;
  dailySeries?: Array<{ date: string; grossSales: number; netProfit: number; orderCount: number }>;
  orderProfits?: Array<{
    orderNumber: string;
    status: string;
    customerName: string;
    grossSales: number;
    netProfit: number;
    cargoFee: number;
    marginPct: number;
  }>;
  productProfits?: Array<{
    barcode: string;
    name: string;
    sales: number;
    netProfit: number;
    marginPct: number;
    cargoFee: number;
  }>;
  lossOrders?: Array<{ orderNumber: string; netProfit: number; customerName: string }>;
  lossProducts?: Array<{ barcode: string; name: string; netProfit: number }>;
  estimatedCargoCount?: number;
  campaignProfits?: CampaignProfitRow[];
};

type Question = {
  id: number;
  text: string;
  status: string;
  productName?: string;
  imageUrl?: string;
  creationDate?: number;
  answer?: { text?: string };
};

function fmt(n: number) {
  return `₺${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number) {
  return `%${n.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
}

export default function FinansPage() {
  const [tab, setTab] = useState<
    "analiz" | "simulator" | "kampanya" | "sorular"
  >("analiz");
  const [range, setRange] = useState<FinanceRange>("30g");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Analytics | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [qLoading, setQLoading] = useState(false);
  const [qStatus, setQStatus] = useState<"WAITING_FOR_ANSWER" | "ANSWERED">(
    "WAITING_FOR_ANSWER"
  );
  const [answerDraft, setAnswerDraft] = useState<Record<number, string>>({});
  const [answeringId, setAnsweringId] = useState<number | null>(null);
  const [adAmount, setAdAmount] = useState("");
  const [adCampaign, setAdCampaign] = useState("");
  const [adSaving, setAdSaving] = useState(false);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/analytics?range=${range}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Analiz alınamadı");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  const loadQuestions = useCallback(async () => {
    setQLoading(true);
    try {
      const res = await fetch(
        `/api/trendyol/questions?status=${qStatus}&page=0`
      );
      const json = await res.json();
      if (json.success) setQuestions(json.content ?? []);
    } finally {
      setQLoading(false);
    }
  }, [qStatus]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    if (tab === "sorular") void loadQuestions();
  }, [tab, loadQuestions]);

  const syncFinance = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/trendyol/sync-finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daysBack: range === "bu-yil" ? 90 : range === "7g" ? 14 : 30,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Senkron başarısız");
      await loadAnalytics();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Senkron hatası");
    } finally {
      setSyncing(false);
    }
  };

  const submitAnswer = async (questionId: number) => {
    const text = String(answerDraft[questionId] ?? "").trim();
    if (!text) return;
    setAnsweringId(questionId);
    try {
      const res = await fetch("/api/trendyol/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, text }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await loadQuestions();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gönderilemedi");
    } finally {
      setAnsweringId(null);
    }
  };

  const addAdSpend = async () => {
    const amount = Number(adAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Geçerli bir reklam tutarı girin");
      return;
    }
    setAdSaving(true);
    try {
      const res = await fetch("/api/finance/ad-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, campaign: adCampaign }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Kaydedilemedi");
      setAdAmount("");
      setAdCampaign("");
      await loadAnalytics();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Kayıt hatası");
    } finally {
      setAdSaving(false);
    }
  };

  return (
    <div className="erp-page max-w-7xl mx-auto">
      <PageHeader
        title="Finans & Kâr Analizi"
        subtitle="Trendyol settlement verisi — komisyon, kargo, stopaj dahil gerçek net kâr"
        action={
          <div className="flex flex-wrap gap-2">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as FinanceRange)}
              className="erp-input text-sm py-2 max-w-[9rem]"
            >
              <option value="7g">Son 7 gün</option>
              <option value="30g">Son 30 gün</option>
              <option value="bu-ay">Bu ay</option>
              <option value="bu-yil">Bu yıl</option>
            </select>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void syncFinance()}
              className="erp-btn erp-btn-primary text-sm py-2 gap-2"
            >
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Çekiliyor…" : "Trendyol Finans Çek"}
            </button>
          </div>
        }
      />

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {(
          [
            { id: "analiz" as const, label: "Kâr Analizi", icon: TrendingUp },
            { id: "simulator" as const, label: "Fiyat Simülatörü", icon: Calculator },
            { id: "kampanya" as const, label: "Kampanya Kârı", icon: Megaphone },
            { id: "sorular" as const, label: "Müşteri Soruları", icon: MessageCircle },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border shrink-0 whitespace-nowrap ${
              tab === id
                ? "bg-[var(--erp-accent)] text-white border-[var(--erp-accent)]"
                : "bg-[var(--erp-surface)] border-[var(--erp-border)] erp-muted"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm p-4 mb-4">
          {error}
        </div>
      ) : null}

      {tab === "analiz" ? (
        loading ? (
          <Spinner label="Finans analizi yükleniyor…" />
        ) : !data?.hasFinanceData ? (
          <div className="erp-card p-8 text-center space-y-3">
            <p className="font-medium text-[var(--erp-text)]">
              Henüz Trendyol finans verisi yok
            </p>
            <p className="text-sm erp-muted max-w-md mx-auto">
              «Trendyol Finans Çek» ile son 30 günün settlement kayıtları
              (satış, komisyon, stopaj, hizmet bedeli) çekilir. Trendyol API
              ayarlarınızın kayıtlı olması gerekir.
            </p>
            <button
              type="button"
              onClick={() => void syncFinance()}
              className="erp-btn erp-btn-primary mx-auto"
            >
              İlk senkronu başlat
            </button>
            <p className="text-xs erp-muted pt-2">
              Finans verisi olmadan da{" "}
              <button type="button" className="underline text-[var(--erp-accent)]" onClick={() => setTab("simulator")}>
                Fiyat Simülatörü
              </button>{" "}
              ve{" "}
              <button type="button" className="underline text-[var(--erp-accent)]" onClick={() => setTab("kampanya")}>
                Kampanya Kârı
              </button>{" "}
              sekmelerini kullanabilirsiniz.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="erp-card p-4">
                <p className="text-xs erp-muted">Net Kâr</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">
                  {fmt(data.kpis.netProfit)}
                </p>
                {data.kpis.adSpend > 0 ? (
                  <p className="text-xs erp-muted mt-1">
                    Reklam öncesi {fmt(data.kpis.netProfitBeforeAds)}
                  </p>
                ) : null}
              </div>
              <div className="erp-card p-4">
                <p className="text-xs erp-muted">Kâr Marjı</p>
                <p className="text-2xl font-bold text-[var(--erp-text)] mt-1">
                  {fmtPct(data.kpis.marginPct)}
                </p>
              </div>
              <div className="erp-card p-4">
                <p className="text-xs erp-muted">Toplam Ciro</p>
                <p className="text-2xl font-bold text-[var(--erp-text)] mt-1">
                  {fmt(data.kpis.grossSales)}
                </p>
              </div>
              <div className="erp-card p-4">
                <p className="text-xs erp-muted">Reklam ROI</p>
                <p className="text-2xl font-bold text-violet-600 mt-1">
                  {data.kpis.adSpend > 0 ? fmtPct(data.kpis.adRoiPct) : "—"}
                </p>
                {data.kpis.adSpend > 0 ? (
                  <p className="text-xs erp-muted mt-1">
                    ROAS {data.kpis.roas.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}x
                  </p>
                ) : null}
              </div>
            </div>

            <div className="erp-card p-5">
              <h3 className="font-bold text-[var(--erp-text)] flex items-center gap-2 mb-4">
                <Megaphone size={18} />
                Reklam harcaması & ROI
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs erp-muted">Toplam reklam</p>
                  <p className="text-xl font-bold">{fmt(data.kpis.adSpend)}</p>
                  <p className="text-xs erp-muted mt-1">
                    Finans ekstresi {fmt(data.kpis.adSpendFromFinance)} + manuel{" "}
                    {fmt(data.kpis.manualAdSpend)}
                  </p>
                </div>
                <div>
                  <p className="text-xs erp-muted">ROAS (ciro / reklam)</p>
                  <p className="text-xl font-bold">
                    {data.kpis.adSpend > 0
                      ? `${data.kpis.roas.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}x`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs erp-muted">Reklam sonrası net kâr</p>
                  <p className="text-xl font-bold text-emerald-700">
                    {fmt(data.kpis.netProfit)}
                  </p>
                </div>
              </div>
              <p className="text-xs erp-muted mb-3">
                Trendyol public API&apos;de ayrı bir reklam uç noktası yok; reklam
                kalemleri cari hesap ekstresinden (DeductionInvoices) otomatik
                algılanır veya aşağıdan manuel eklenebilir.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Reklam tutarı (₺)"
                  value={adAmount}
                  onChange={(e) => setAdAmount(e.target.value)}
                  className="erp-input text-sm py-2 max-w-[10rem]"
                />
                <input
                  type="text"
                  placeholder="Kampanya adı (opsiyonel)"
                  value={adCampaign}
                  onChange={(e) => setAdCampaign(e.target.value)}
                  className="erp-input text-sm py-2 flex-1 min-w-[12rem]"
                />
                <button
                  type="button"
                  disabled={adSaving}
                  onClick={() => void addAdSpend()}
                  className="erp-btn erp-btn-primary text-sm py-2"
                >
                  {adSaving ? "Kaydediliyor…" : "Manuel reklam ekle"}
                </button>
              </div>
              {(data.adSpendEntries?.length ?? 0) > 0 ? (
                <ul className="space-y-2 text-sm max-h-48 overflow-y-auto">
                  {data.adSpendEntries?.map((e) => (
                    <li
                      key={e.id}
                      className="flex justify-between gap-2 border-b border-slate-100 pb-2"
                    >
                      <span className="truncate">
                        {new Date(e.spendDate).toLocaleDateString("tr-TR")}{" "}
                        {e.campaign || e.note || "Reklam"}
                        <span className="text-xs erp-muted ml-1">
                          ({e.source === "manual" ? "manuel" : "finans"})
                        </span>
                      </span>
                      <span className="font-medium shrink-0">{fmt(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="erp-card p-5">
                <h3 className="font-bold text-[var(--erp-text)] flex items-center gap-2 mb-4">
                  <PieChart size={18} />
                  Gider dağılımı
                </h3>
                <div className="space-y-2">
                  {data.expenseBreakdown.map((e) => (
                    <div key={e.key} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="truncate">{e.label}</span>
                          <span className="font-medium shrink-0">{fmt(e.amount)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-[var(--erp-accent)] rounded-full"
                            style={{ width: `${Math.min(100, e.pct)}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs erp-muted w-10 text-right">
                        {fmtPct(e.pct)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="erp-card p-5">
                <h3 className="font-bold text-[var(--erp-text)] flex items-center gap-2 mb-4">
                  <ShoppingBag size={18} />
                  Sipariş özeti
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="erp-muted">Toplam sipariş</dt>
                    <dd className="font-bold text-lg">{data.orderSummary.total}</dd>
                  </div>
                  <div>
                    <dt className="erp-muted">Teslim edilen</dt>
                    <dd className="font-bold text-lg text-emerald-600">
                      {data.orderSummary.delivered}
                    </dd>
                  </div>
                  <div>
                    <dt className="erp-muted">İade</dt>
                    <dd className="font-bold text-lg text-amber-600">
                      {data.orderSummary.returned}
                    </dd>
                  </div>
                  <div>
                    <dt className="erp-muted">İptal</dt>
                    <dd className="font-bold text-lg text-red-600">
                      {data.orderSummary.cancelled}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs erp-muted mt-4">
                  {data.transactionCount} finans kaydı işlendi (settlements +
                  otherfinancials)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="erp-card p-5">
                <h3 className="font-bold mb-3">Top 10 — En çok satan</h3>
                <ul className="space-y-2 text-sm">
                  {data.topBySales.length === 0 ? (
                    <li className="erp-muted">Veri yok</li>
                  ) : (
                    data.topBySales.map((p, i) => (
                      <li
                        key={p.barcode}
                        className="flex justify-between gap-2 border-b border-slate-100 pb-2"
                      >
                        <span className="truncate">
                          {i + 1}. {p.name}
                        </span>
                        <span className="shrink-0 font-medium">{p.sales} ad.</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="erp-card p-5">
                <h3 className="font-bold mb-3">Top 10 — En kârlı (hakediş)</h3>
                <ul className="space-y-2 text-sm">
                  {data.topByProfit.length === 0 ? (
                    <li className="erp-muted">Veri yok</li>
                  ) : (
                    data.topByProfit.map((p, i) => (
                      <li
                        key={p.barcode}
                        className="flex justify-between gap-2 border-b border-slate-100 pb-2"
                      >
                        <span className="truncate">
                          {i + 1}. {p.name}
                        </span>
                        <span className="shrink-0 font-medium text-emerald-700">
                          {fmt(p.profit)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            {(data.dailySeries?.length ?? 0) > 0 ? (
              <div className="erp-card p-5">
                <h3 className="font-bold text-[var(--erp-text)] mb-4">Günlük ciro & net kâr</h3>
                <div className="flex items-end gap-1 h-32 overflow-x-auto pb-2">
                  {data.dailySeries!.map((d) => {
                    const max = Math.max(
                      ...data.dailySeries!.map((x) => x.grossSales),
                      1
                    );
                    const h = Math.max(8, (d.grossSales / max) * 100);
                    return (
                      <div
                        key={d.date}
                        className="flex flex-col items-center min-w-[2.5rem]"
                        title={`${d.date}: ${fmt(d.grossSales)} / kâr ${fmt(d.netProfit)}`}
                      >
                        <div
                          className="w-6 rounded-t bg-[var(--erp-accent)]/80"
                          style={{ height: `${h}%` }}
                        />
                        <span className="text-[9px] erp-muted mt-1 rotate-[-45deg] origin-top-left">
                          {d.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {(data.lossProducts?.length ?? 0) > 0 ? (
              <div className="erp-card p-5 border border-red-100">
                <h3 className="font-bold text-red-800 mb-3">Zarar eden ürünler</h3>
                <ul className="space-y-2 text-sm">
                  {data.lossProducts!.map((p) => (
                    <li
                      key={p.barcode}
                      className="flex justify-between gap-2 border-b border-red-50 pb-2"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="font-semibold text-red-700 shrink-0">{fmt(p.netProfit)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {(data.orderProfits?.length ?? 0) > 0 ? (
                <div className="erp-card p-5 overflow-x-auto">
                  <h3 className="font-bold mb-3">Sipariş bazlı net kâr</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left erp-muted border-b">
                        <th className="py-2 pr-2">Sipariş</th>
                        <th className="py-2 pr-2">Kargo</th>
                        <th className="py-2 text-right">Net kâr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orderProfits!.slice(0, 15).map((o) => (
                        <tr key={o.orderNumber} className="border-b border-slate-50">
                          <td className="py-2 pr-2">
                            <div className="font-medium">{o.orderNumber}</div>
                            <div className="text-xs erp-muted truncate">{o.customerName}</div>
                          </td>
                          <td className="py-2 pr-2">{fmt(o.cargoFee)}</td>
                          <td
                            className={`py-2 text-right font-semibold ${
                              o.netProfit >= 0 ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {fmt(o.netProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {(data.productProfits?.length ?? 0) > 0 ? (
                <div className="erp-card p-5 overflow-x-auto">
                  <h3 className="font-bold mb-3">Ürün bazlı net kâr (kargo dahil)</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left erp-muted border-b">
                        <th className="py-2 pr-2">Ürün</th>
                        <th className="py-2 pr-2">Adet</th>
                        <th className="py-2 text-right">Net kâr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.productProfits!.slice(0, 15).map((p) => (
                        <tr key={p.barcode} className="border-b border-slate-50">
                          <td className="py-2 pr-2 truncate max-w-[12rem]">{p.name}</td>
                          <td className="py-2 pr-2">{p.sales}</td>
                          <td
                            className={`py-2 text-right font-semibold ${
                              p.netProfit >= 0 ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {fmt(p.netProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4 text-sm text-blue-900">
              <strong>Maliyet özeti:</strong> Brüt satış {fmt(data.kpis.grossSales)} − komisyon{" "}
              {fmt(data.kpis.commission)} = hakediş {fmt(data.kpis.sellerRevenue)}. Hakediş −
              ürün maliyeti {fmt(data.kpis.productCost)} − kargo {fmt(data.kpis.cargoFee)} −
              hizmet {fmt(data.kpis.serviceFee)} − stopaj {fmt(data.kpis.stopaj)}
              {data.kpis.salesVat > 0 ? (
                <> − KDV (net) {fmt(data.kpis.netVat)}</>
              ) : null}
              {data.kpis.discount > 0 ? (
                <> − indirim {fmt(data.kpis.discount)}</>
              ) : null}
              {data.kpis.adSpend > 0 ? <> − reklam {fmt(data.kpis.adSpend)}</> : null} ={" "}
              <strong>net kâr {fmt(data.kpis.netProfit)}</strong>
              {data.kpis.cargoFee === 0 ? (
                <span className="block text-xs mt-2 text-blue-800/80">
                  Kargo ₺0 ise «Trendyol Finans Çek» ile yeniden senkronize edin; kargo faturaları
                  ayrı API ile çekilir.
                </span>
              ) : null}
              {(data.estimatedCargoCount ?? 0) > 0 ? (
                <span className="block text-xs mt-2 text-amber-800/90">
                  {data.estimatedCargoCount} siparişte kargo desi tahmini kullanıldı (fatura henüz
                  kesilmemiş). Ürün desi alanını doldurun; fatura gelince otomatik güncellenir.
                </span>
              ) : null}
            </div>
          </div>
        )
      ) : tab === "simulator" ? (
        <FinansSimulatorPanel />
      ) : tab === "kampanya" ? (
        loading ? (
          <Spinner label="Kampanya analizi yükleniyor…" />
        ) : (
          <FinansCampaignPanel rows={data?.campaignProfits ?? []} />
        )
      ) : qLoading ? (
        <Spinner label="Sorular yükleniyor…" />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setQStatus("WAITING_FOR_ANSWER")}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                qStatus === "WAITING_FOR_ANSWER"
                  ? "bg-amber-100 text-amber-900 font-medium"
                  : "bg-slate-100"
              }`}
            >
              Cevap bekleyen
            </button>
            <button
              type="button"
              onClick={() => setQStatus("ANSWERED")}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                qStatus === "ANSWERED"
                  ? "bg-emerald-100 text-emerald-900 font-medium"
                  : "bg-slate-100"
              }`}
            >
              Cevaplanan
            </button>
          </div>
          {questions.length === 0 ? (
            <p className="erp-muted text-sm">Soru bulunamadı.</p>
          ) : (
            questions.map((q) => (
              <article key={q.id} className="erp-card p-4 space-y-3">
                <div className="flex gap-3">
                  {q.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={q.imageUrl}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover border"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs erp-muted">{q.productName}</p>
                    <p className="font-medium mt-1">{q.text}</p>
                    {q.answer?.text ? (
                      <p className="text-sm text-emerald-700 mt-2 bg-emerald-50 rounded-lg p-2">
                        {q.answer.text}
                      </p>
                    ) : null}
                  </div>
                </div>
                {qStatus === "WAITING_FOR_ANSWER" ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Cevabınız…"
                      value={answerDraft[q.id] ?? ""}
                      onChange={(e) =>
                        setAnswerDraft((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      className="erp-input flex-1 text-sm py-2"
                    />
                    <button
                      type="button"
                      disabled={answeringId === q.id}
                      onClick={() => void submitAnswer(q.id)}
                      className="erp-btn erp-btn-primary px-4 py-2"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}
