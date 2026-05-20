"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  User,
  LogOut,
  MessageCircle,
} from "lucide-react";

const nav = [
  { href: "/portal", label: "Özet", icon: LayoutDashboard },
  { href: "/portal/orders", label: "Siparişler", icon: ShoppingCart },
  { href: "/portal/payments", label: "Ödemeler", icon: Wallet },
  { href: "/portal/profile", label: "Profil", icon: User },
];

const bottomNav = [
  { href: "/portal", label: "Ana", icon: LayoutDashboard },
  { href: "/portal/orders", label: "Sipariş", icon: ShoppingCart },
  { href: "/portal/payments", label: "Ödeme", icon: Wallet },
  { href: "/portal/contact", label: "Destek", icon: MessageCircle },
  { href: "/portal/profile", label: "Profil", icon: User },
];

function isActive(pathname: string, href: string) {
  if (href === "/portal") return pathname === "/portal";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  return (
    <div
      className="min-h-[100dvh] bg-[var(--erp-bg)] text-[var(--erp-text)] pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6"
    >
      <header className="sticky top-0 z-40 border-b border-[var(--erp-border)] bg-[var(--erp-header)] backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--erp-accent)]">
              Müşteri Portalı
            </p>
            <h1 className="text-lg font-bold text-[var(--erp-text)]">KanalERP</h1>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="erp-btn erp-btn-ghost text-sm px-3 py-2 min-h-0"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Çıkış</span>
          </button>
        </div>
      </header>

      <nav className="hidden sm:flex max-w-5xl mx-auto px-4 py-3 gap-2 overflow-x-auto">
        {[...nav, { href: "/portal/contact", label: "Destek", icon: MessageCircle }].map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                active
                  ? "bg-[var(--erp-accent)] text-white dark:text-[#0f1210]"
                  : "bg-[var(--erp-surface)] text-[var(--erp-text-muted)] border border-[var(--erp-border)] hover:text-[var(--erp-text)]"
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-5 erp-page">{children}</main>

      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-[var(--erp-border)] bg-[var(--erp-nav)] backdrop-blur-xl"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex justify-around py-2">
          {bottomNav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 min-w-[3rem] text-[10px] font-semibold ${
                  active ? "text-[var(--erp-accent)]" : "text-[var(--erp-text-muted)]"
                }`}
              >
                <item.icon size={20} strokeWidth={active ? 2.25 : 1.75} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
