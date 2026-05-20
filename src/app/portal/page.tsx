"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, ShoppingCart, Wallet, User, MessageCircle, ChevronRight } from "lucide-react";
import { fmtMoney, portalStatusBadge } from "@/lib/portal-ui";

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
        <div className="erp-card h-48" />
        <div className="grid grid-cols-2 gap-3">
          <div className="erp-card h-20" />
          <div className="erp-card h-20" />
        </div>
      </div>
    );
  }

  const quickLinks = [
    { href: "/portal/orders", label: "Sipariş Ver", icon: ShoppingCart, primary: true },
    { href: "/portal/orders", label: "Siparişlerim", icon: LayoutDashboard },
    { href: "/portal/payments", label: "Ödemeler", icon: Wallet },
    { href: "/portal/contact", label: "Destek", icon: MessageCircle },
    { href: "/portal/profile", label: "Profil", icon: User },
  ];

  return (
    <div className="space-y-5">
      <section className="erp-card p-5 bg-gradient-to-br from-[var(--erp-accent-soft)] to-[var(--erp-surface)]">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--erp-accent)]">Hoş geldiniz</p>
        <h2 className="text-2xl font-bold text-[var(--erp-text)] mt-1">{data?.customer?.name ?? "Müşteri"}</h2>
        {data?.customer?.companyName ? (
          <p className="text-sm erp-muted mt-0.5">{data.customer.companyName}</p>
        ) : null}
        <p className="text-3xl font-black mt-4 tabular-nums text-[var(--erp-text)]">
          {fmtMoney(summary?.balance ?? 0)}
        </p>
        <p className="text-sm erp-muted mt-1">Güncel borç bakiyeniz</p>
        <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-[var(--erp-border)] text-center">
          <div>
            <p className="text-[10px] uppercase tracking-widest erp-muted">Toplam ödeme</p>
            <p className="text-lg font-bold tabular-nums">{fmtMoney(summary?.totalPayments ?? 0)}</p>
          </div>
          <div className="border-l border-[var(--erp-border)]">
            <p className="text-[10px] uppercase tracking-widest erp-muted">Sipariş</p>
            <p className="text-lg font-bold">{summary?.orderCount ?? 0}</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold erp-muted uppercase tracking-wide mb-2 px-0.5">Hızlı işlem</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {quickLinks.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={`erp-card flex flex-col items-center justify-center gap-2 p-4 min-h-[5rem] active:scale-[0.98] transition-transform text-center ${
                item.primary
                  ? "bg-[var(--erp-accent)] text-white dark:text-[#0f1210] border-transparent"
                  : ""
              }`}
            >
              <item.icon size={22} />
              <span className="font-bold text-sm leading-tight">{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {pending.length > 0 && (
        <section className="erp-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold flex items-center gap-2 text-[var(--erp-text)]">
              <LayoutDashboard size={16} /> Açık siparişler
            </h3>
            <Link href="/portal/orders" className="text-xs font-semibold text-[var(--erp-accent)] flex items-center gap-0.5">
              Tümü <ChevronRight size={14} />
            </Link>
          </div>
          <ul className="space-y-2">
            {pending.slice(0, 5).map((o) => (
              <li
                key={o.orderNumber}
                className="flex items-center justify-between gap-3 rounded-xl bg-[var(--erp-surface-2)] border border-[var(--erp-border)] px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="font-semibold text-[var(--erp-text)]">{o.orderNumber}</p>
                  {o.createdAt ? (
                    <p className="text-xs erp-muted">{new Date(o.createdAt).toLocaleDateString("tr-TR")}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg border ${portalStatusBadge(o.status)}`}
                  >
                    {o.status}
                  </span>
                  <p className="font-bold mt-1 tabular-nums">{fmtMoney(Number(o.totalAmount) || 0)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
