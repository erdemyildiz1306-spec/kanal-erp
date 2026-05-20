"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Package,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  ScanBarcode,
  Search,
  Warehouse,
  Plus,
  ChevronRight,
  Bell,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Spinner from "@/components/ui/Spinner";
import MobileListCard from "@/components/ui/MobileListCard";

const DashboardCharts = dynamic(() => import("@/components/dashboard/DashboardCharts"), {
  ssr: false,
  loading: () => (
    <div className="erp-card p-8 text-center erp-muted text-sm">Grafikler yükleniyor…</div>
  ),
});

const quickActions = [
  { href: "/scanner", label: "Barkod", desc: "Tara & stok", icon: ScanBarcode, tone: "bg-emerald-600 text-white" },
  { href: "/products", label: "Ürün", desc: "Ara & düzenle", icon: Search, tone: "bg-blue-600 text-white" },
  { href: "/warehouse", label: "Depo", desc: "Stok düzelt", icon: Warehouse, tone: "bg-violet-600 text-white" },
  { href: "/products?new=1", label: "Ekle", desc: "Yeni ürün", icon: Plus, tone: "bg-[var(--erp-accent)] text-white dark:text-[#0f1210]" },
];

function fmtMoney(n: number) {
  return `₺${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalProfit: 0,
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
        const [dashRes, ordRes] = await Promise.all([fetch("/api/dashboard"), fetch("/api/orders")]);
        const dash = await dashRes.json();
        const ord = await ordRes.json();
        if (dash.success) {
          setStats(dash.stats);
          setBar(dash.charts.bar);
          setDoughnut(dash.charts.doughnut);
        }
        if (ord.success && Array.isArray(ord.orders)) {
          setRecentOrders(
            ord.orders.slice(0, 6).map((o: Record<string, unknown>) => ({
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

  if (loading) return <Spinner label="Özet yükleniyor…" />;

  const kpis = [
    { label: "Satış (7g)", value: fmtMoney(stats.totalSales), icon: TrendingUp, href: "/reports" },
    { label: "Net Kâr", value: fmtMoney(stats.totalProfit), icon: TrendingUp, href: "/reports" },
    { label: "Bekleyen", value: String(stats.pendingOrders), icon: ShoppingCart, href: "/orders", alert: stats.pendingOrders > 0 },
    { label: "Kritik Stok", value: String(stats.criticalStock), icon: AlertTriangle, href: "/products", alert: stats.criticalStock > 0 },
  ];

  return (
    <div className="erp-page max-w-7xl mx-auto pb-2">
      {/* Mobil hero */}
      <section className="erp-card p-4 md:p-5 bg-gradient-to-br from-[var(--erp-accent-soft)] to-[var(--erp-surface)] lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--erp-accent)]">KanalERP</p>
            <h2 className="text-xl font-bold text-[var(--erp-text)] mt-1">Günaydın 👋</h2>
            <p className="text-sm erp-muted mt-1">
              {stats.pendingOrders > 0
                ? `${stats.pendingOrders} bekleyen sipariş var`
                : `${stats.productCount} ürün · canlı veri`}
            </p>
          </div>
          <Link
            href="/orders"
            className="touch-target-sm rounded-xl bg-[var(--erp-accent)] text-white dark:text-[#0f1210] flex items-center justify-center relative"
          >
            <Bell size={22} />
            {stats.pendingOrders > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-0.5 flex items-center justify-center text-[10px] font-bold bg-red-600 text-white rounded-full">
                {stats.pendingOrders > 9 ? "9+" : stats.pendingOrders}
              </span>
            ) : null}
          </Link>
        </div>
      </section>

      <PageHeader
        title="Özet"
        subtitle="Trendyol siparişleri ~90 sn'de bir otomatik çekilir"
        className="hidden lg:flex"
      />

      {/* Hızlı işlemler */}
      <section>
        <h3 className="text-sm font-bold erp-muted uppercase tracking-wide mb-2 px-0.5 lg:hidden">
          Hızlı işlem
        </h3>
        <div className="grid grid-cols-4 gap-2 lg:grid-cols-4 lg:gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`erp-card flex flex-col items-center justify-center gap-1.5 p-3 min-h-[5.5rem] active:scale-[0.97] transition-transform ${action.tone}`}
            >
              <action.icon size={24} />
              <span className="font-bold text-sm leading-none">{action.label}</span>
              <span className="text-[10px] opacity-80 hidden sm:block">{action.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className={`erp-card p-4 flex items-center gap-3 active:scale-[0.98] transition-transform ${
              kpi.alert ? "ring-2 ring-amber-500/40" : ""
            }`}
          >
            <div className={`p-2.5 rounded-xl bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]`}>
              <kpi.icon size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs erp-muted font-medium truncate">{kpi.label}</p>
              <p className="text-lg font-bold text-[var(--erp-text)]">{kpi.value}</p>
            </div>
          </Link>
        ))}
        <Link href="/products" className="erp-card p-4 flex items-center gap-3 col-span-2 lg:col-span-1 active:scale-[0.98] transition-transform">
          <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600">
            <Package size={20} />
          </div>
          <div>
            <p className="text-xs erp-muted">Toplam Ürün</p>
            <p className="text-lg font-bold">{stats.productCount.toLocaleString("tr-TR")}</p>
          </div>
          <ChevronRight size={18} className="ml-auto erp-muted" />
        </Link>
      </section>

      <DashboardCharts bar={bar} doughnut={doughnut} />

      {/* Son siparişler */}
      <section className="erp-card p-4 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[var(--erp-text)]">Son Siparişler</h3>
          <Link href="/orders" className="text-sm font-semibold text-[var(--erp-accent)] flex items-center gap-1">
            Tümü <ChevronRight size={16} />
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-sm erp-muted py-6 text-center">Henüz sipariş yok.</p>
        ) : (
          <>
            <div className="md:hidden space-y-2">
              {recentOrders.map((o) => (
                <MobileListCard
                  key={o.orderNumber}
                  title={o.orderNumber}
                  subtitle={o.customerName}
                  badge={
                    <span className="text-sm font-bold text-[var(--erp-text)]">
                      {fmtMoney(o.totalAmount)}
                    </span>
                  }
                  meta={
                    <>
                      <span className="px-2 py-0.5 rounded-md bg-[var(--erp-accent-soft)] text-[var(--erp-accent)] capitalize">
                        {o.platform}
                      </span>
                      <span className="erp-muted">{o.status}</span>
                    </>
                  }
                />
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--erp-border)] erp-muted">
                    <th className="py-3 font-medium">Sipariş</th>
                    <th className="py-3 font-medium">Platform</th>
                    <th className="py-3 font-medium">Müşteri</th>
                    <th className="py-3 font-medium">Tutar</th>
                    <th className="py-3 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.orderNumber} className="border-b border-[var(--erp-border)] last:border-0">
                      <td className="py-3 font-medium">{o.orderNumber}</td>
                      <td className="py-3 capitalize">{o.platform}</td>
                      <td className="py-3">{o.customerName}</td>
                      <td className="py-3 font-medium">{fmtMoney(o.totalAmount)}</td>
                      <td className="py-3">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
