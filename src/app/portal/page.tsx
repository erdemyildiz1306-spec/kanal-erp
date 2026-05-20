"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, ShoppingCart, Wallet, User, Package, Search } from "lucide-react";

function fmt(n: number) {
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const statusStyle: Record<string, string> = {
  Beklemede: "bg-amber-500/20 text-amber-200",
  Yeni: "bg-sky-500/20 text-sky-200",
  Hazırlanıyor: "bg-violet-500/20 text-violet-200",
  Kargoda: "bg-blue-500/20 text-blue-200",
  Teslim: "bg-emerald-500/20 text-emerald-200",
  İptal: "bg-red-500/20 text-red-200",
};

export default function PortalHomePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    summary?: { balance: number; totalPayments: number; orderCount: number };
    customer?: { name: string; companyName?: string };
    orders?: Array<{ orderNumber: string; status: string; totalAmount: number; createdAt?: string }>;
  } | null>(null);

  useEffect(() => {
    void fetch("/api/portal/summary")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d);
      })
      .finally(() => setLoading(false));
  }, []);

  const summary = data?.summary;
  const pending = (data?.orders ?? []).filter((o) =>
    ["Beklemede", "Yeni", "Hazırlanıyor", "Kargoda"].includes(o.status)
  );

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-48 rounded-3xl bg-white/10" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 rounded-2xl bg-white/10" />
          <div className="h-20 rounded-2xl bg-white/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-white/15 to-white/5 border border-violet-400/30 p-6 backdrop-blur-md shadow-xl shadow-violet-950/30">
        <p className="text-violet-200 text-xs font-bold uppercase tracking-wider">Hoş geldiniz</p>
        <h2 className="text-2xl font-black mt-1">{data?.customer?.name ?? "Müşteri"}</h2>
        {data?.customer?.companyName ? (
          <p className="text-violet-300 text-sm mt-0.5">{data.customer.companyName}</p>
        ) : null}
        <p className="text-4xl font-black mt-5 tabular-nums">{fmt(summary?.balance ?? 0)}</p>
        <p className="text-violet-200 text-sm mt-1">Güncel borç bakiyeniz</p>
        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/15 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-violet-300">Toplam ödeme</p>
            <p className="text-lg font-bold tabular-nums">{fmt(summary?.totalPayments ?? 0)}</p>
          </div>
          <div className="border-l border-white/15">
            <p className="text-[10px] uppercase tracking-widest text-violet-300">Sipariş</p>
            <p className="text-lg font-bold">{summary?.orderCount ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/portal/orders"
          className="rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 p-4 text-center font-bold shadow-lg hover:scale-[1.02] transition-transform col-span-2 sm:col-span-1"
        >
          <ShoppingCart size={20} className="mx-auto mb-1 opacity-90" />
          Sipariş Ver
        </Link>
        <Link
          href="/portal/orders"
          className="rounded-2xl bg-gradient-to-br from-orange-400/80 to-rose-500/80 p-4 text-center font-bold shadow-lg hover:scale-[1.02] transition-transform"
        >
          <ShoppingCart size={20} className="mx-auto mb-1 opacity-90" />
          Siparişlerim
        </Link>
        <Link
          href="/portal/payments"
          className="rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 p-4 text-center font-bold shadow-lg hover:scale-[1.02] transition-transform"
        >
          <Wallet size={20} className="mx-auto mb-1 opacity-90" />
          Ödemeler
        </Link>
        <Link
          href="/portal/contact"
          className="rounded-2xl bg-gradient-to-br from-purple-400 to-pink-500 p-4 text-center font-bold shadow-lg hover:scale-[1.02] transition-transform"
        >
          <Package size={20} className="mx-auto mb-1 opacity-90" />
          Destek
        </Link>
        <Link
          href="/portal/profile"
          className="rounded-2xl bg-gradient-to-br from-violet-400 to-purple-500 p-4 text-center font-bold shadow-lg hover:scale-[1.02] transition-transform"
        >
          <User size={20} className="mx-auto mb-1 opacity-90" />
          Profil
        </Link>
      </div>

      {pending.length > 0 && (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold flex items-center gap-2">
              <LayoutDashboard size={16} /> Açık siparişler
            </h3>
            <Link href="/portal/orders" className="text-xs text-violet-300 hover:text-white">
              Tümü →
            </Link>
          </div>
          <ul className="space-y-2">
            {pending.slice(0, 5).map((o) => (
              <li
                key={o.orderNumber}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="font-semibold">{o.orderNumber}</p>
                  {o.createdAt ? (
                    <p className="text-xs text-violet-300">
                      {new Date(o.createdAt).toLocaleDateString("tr-TR")}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${
                      statusStyle[o.status] ?? "bg-white/10 text-violet-200"
                    }`}
                  >
                    {o.status}
                  </span>
                  <p className="font-bold mt-1 tabular-nums">{fmt(Number(o.totalAmount) || 0)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
