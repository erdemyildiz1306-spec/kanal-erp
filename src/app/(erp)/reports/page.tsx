"use client";

import { useEffect, useState } from "react";
import { TrendingUp, ShoppingBag, DollarSign, Store, Globe, Package } from "lucide-react";

function fmt(n: number) {
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReportsPage() {
  const [timeRange, setTimeRange] = useState("Bu Ay");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    totalRevenue: 0,
    totalProfit: 0,
    orderCount: 0,
    trendyolRevenue: 0,
    webRevenue: 0,
    trendyolShare: 0,
    webShare: 0,
  });
  const [topProducts, setTopProducts] = useState<
    Array<{ name: string; sales: number; revenue: number; stock: number }>
  >([]);
  const [lowStock, setLowStock] = useState<
    Array<{ name: string; sku: string; stock: number; safetyStock: number }>
  >([]);

  useEffect(() => {
    setLoading(true);
    void fetch(`/api/reports?range=${encodeURIComponent(timeRange)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setKpis(d.kpis);
          setTopProducts(d.topProducts ?? []);
          setLowStock(d.lowStock ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [timeRange]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Raporlar & Analiz</h2>
          <p className="text-sm text-slate-500 mt-1">Canlı sipariş ve stok verileri.</p>
        </div>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium outline-none"
        >
          <option>Bugün</option>
          <option>Bu Hafta</option>
          <option>Bu Ay</option>
          <option>Son 3 Ay</option>
          <option>Bu Yıl</option>
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500">Yükleniyor…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Toplam Ciro</p>
                <p className="text-2xl font-bold text-slate-800">{fmt(kpis.totalRevenue)}</p>
              </div>
              <DollarSign className="text-blue-600" size={24} />
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Sipariş</p>
                <p className="text-2xl font-bold text-slate-800">{kpis.orderCount}</p>
              </div>
              <ShoppingBag className="text-green-600" size={24} />
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Trendyol</p>
                <p className="text-2xl font-bold text-orange-600">{fmt(kpis.trendyolRevenue)}</p>
                <p className="text-xs text-slate-400">%{kpis.trendyolShare}</p>
              </div>
              <Store className="text-orange-500" size={24} />
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Web</p>
                <p className="text-2xl font-bold text-blue-600">{fmt(kpis.webRevenue)}</p>
                <p className="text-xs text-slate-400">%{kpis.webShare}</p>
              </div>
              <Globe className="text-blue-500" size={24} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <TrendingUp size={18} /> En çok satan ürünler
              </h3>
              {topProducts.length === 0 ? (
                <p className="text-sm text-slate-500">Bu dönemde satış yok.</p>
              ) : (
                <ul className="space-y-3">
                  {topProducts.map((p, i) => (
                    <li key={i} className="flex justify-between text-sm border-b border-slate-50 pb-2">
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className="text-slate-600">{p.sales} ad · {fmt(p.revenue)} · stok {p.stock}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Package size={18} /> Kritik stok
              </h3>
              {lowStock.length === 0 ? (
                <p className="text-sm text-slate-500">Kritik stok yok.</p>
              ) : (
                <ul className="space-y-3">
                  {lowStock.map((p) => (
                    <li key={p.sku} className="flex justify-between text-sm border-b border-slate-50 pb-2">
                      <span>{p.name}</span>
                      <span className="text-red-600 font-medium">{p.stock} / eşik {p.safetyStock}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <p className="text-sm text-slate-600">
              Tahmini brüt kâr (maliyet düşülmüş): <strong>{fmt(kpis.totalProfit)}</strong>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
