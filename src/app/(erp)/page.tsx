"use client";

import { useEffect, useState } from "react";
import { Package, ShoppingCart, TrendingUp, AlertTriangle } from "lucide-react";
import { Bar, Doughnut } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const C = {
  sageDeep: "rgba(90, 115, 95, 0.75)",
  stoneDeep: "rgba(100, 98, 90, 0.65)",
  mist: "#fbfaf7",
};

function fmtMoney(n: number) {
  return `₺${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalProfit: 0,
    totalCost: 0,
    pendingOrders: 0,
    productCount: 0,
    criticalStock: 0,
  });
  const [bar, setBar] = useState({ labels: [] as string[], trendyol: [] as number[], web: [] as number[] });
  const [doughnut, setDoughnut] = useState({ values: [0, 0], amounts: [0, 0] });
  const [recentOrders, setRecentOrders] = useState<
    Array<{ orderNumber: string; platform: string; customerName: string; totalAmount: number; status: string }>
  >([]);

  useEffect(() => {
    const refresh = async () => {
      try {
        const [dashRes, ordRes] = await Promise.all([
          fetch("/api/dashboard"),
          fetch("/api/orders"),
        ]);
        const dash = await dashRes.json();
        const ord = await ordRes.json();
        if (dash.success) {
          setStats(dash.stats);
          setBar(dash.charts.bar);
          setDoughnut(dash.charts.doughnut);
        }
        if (ord.success && Array.isArray(ord.orders)) {
          setRecentOrders(
            ord.orders.slice(0, 5).map((o: Record<string, unknown>) => ({
              orderNumber: String(o.orderNumber ?? ""),
              platform: String(o.platform ?? ""),
              customerName: String(o.customerName ?? ""),
              totalAmount: Number(o.totalAmount) || 0,
              status: String(o.status ?? ""),
            }))
          );
        }
      } finally {
        setLoading(false);
      }
    };

    void refresh();
    const onSync = () => void refresh();
    window.addEventListener("erp-orders-synced", onSync);
    return () => window.removeEventListener("erp-orders-synced", onSync);
  }, []);

  const statCards = [
    { title: "Toplam Satış (7 gün)", value: fmtMoney(stats.totalSales), icon: TrendingUp, color: "text-[#5a6f55]", bg: "bg-[#e8ede4]" },
    { title: "Net Kâr (7 gün)", value: fmtMoney(stats.totalProfit), icon: TrendingUp, color: "text-[#3d6b4f]", bg: "bg-[#dceee3]" },
    { title: "Bekleyen Sipariş", value: String(stats.pendingOrders), icon: ShoppingCart, color: "text-[#5c6470]", bg: "bg-[#e4e8ec]" },
    { title: "Toplam Ürün", value: stats.productCount.toLocaleString("tr-TR"), icon: Package, color: "text-[#6a5f72]", bg: "bg-[#eae6ee]" },
    { title: "Kritik Stok", value: String(stats.criticalStock), icon: AlertTriangle, color: "text-[#8b5348]", bg: "bg-[#f0e4e2]" },
  ];

  const barData = {
    labels: bar.labels,
    datasets: [
      { label: "Trendyol Satışları (₺)", data: bar.trendyol, backgroundColor: C.sageDeep, borderRadius: 6 },
      { label: "Web Satışları (₺)", data: bar.web, backgroundColor: C.stoneDeep, borderRadius: 6 },
    ],
  };

  const doughnutData = {
    labels: ["Trendyol", "Web Sitesi"],
    datasets: [{ data: doughnut.values, backgroundColor: [C.sageDeep, C.stoneDeep], borderWidth: 0 }],
  };

  const chartOpts: ChartOptions<"bar"> = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: { legend: { labels: { color: "#5c584f", font: { size: 12 } } } },
    scales: {
      x: { ticks: { color: "#7a766c" }, grid: { color: "rgba(0,0,0,0.04)" } },
      y: { ticks: { color: "#7a766c" }, grid: { color: "rgba(0,0,0,0.05)" } },
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-stone-800">Dashboard</h2>
        <div className="text-sm text-stone-500 text-right">
          <div>{loading ? "Yükleniyor…" : "Canlı veri"}</div>
          <div className="text-xs text-stone-400 mt-0.5">
            Trendyol siparişleri ~90 sn&apos;de bir otomatik çekilir
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {statCards.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-[#eae6e0]/90 flex items-center space-x-4">
            <div className={`p-4 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500">{stat.title}</p>
              <h3 className="text-2xl font-bold text-stone-800">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-[#eae6e0]/90 lg:col-span-2 shadow-sm overflow-hidden" style={{ background: C.mist }}>
          <div className="p-6">
            <h3 className="text-lg font-bold text-stone-800 mb-4">Haftalık Satış Grafiği</h3>
            <div className="h-72">
              <Bar data={barData} options={chartOpts} />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[#eae6e0]/90 shadow-sm overflow-hidden" style={{ background: C.mist }}>
          <div className="p-6">
            <h3 className="text-lg font-bold text-stone-800 mb-4">Platform Dağılımı</h3>
            <div className="h-64 flex flex-col items-center justify-center gap-2">
              <Doughnut data={doughnutData} options={{ maintainAspectRatio: false }} />
              <p className="text-xs text-stone-500">
                TY {fmtMoney(doughnut.amounts[0] ?? 0)} · Web {fmtMoney(doughnut.amounts[1] ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#eae6e0]/90 shadow-sm bg-white p-6">
        <h3 className="text-lg font-bold text-stone-800 mb-4">Son Siparişler</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-100 text-sm text-stone-500">
                <th className="py-3 font-medium">Sipariş No</th>
                <th className="py-3 font-medium">Platform</th>
                <th className="py-3 font-medium">Müşteri</th>
                <th className="py-3 font-medium">Tutar</th>
                <th className="py-3 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-stone-500 text-sm">Henüz sipariş yok.</td></tr>
              ) : recentOrders.map((o) => (
                <tr key={o.orderNumber} className="border-b border-stone-50 last:border-0 text-sm">
                  <td className="py-3 font-medium text-stone-800">{o.orderNumber}</td>
                  <td className="py-3 capitalize">{o.platform}</td>
                  <td className="py-3 text-stone-600">{o.customerName}</td>
                  <td className="py-3 font-medium text-stone-800">{fmtMoney(o.totalAmount)}</td>
                  <td className="py-3">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
