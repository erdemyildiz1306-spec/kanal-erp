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

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-violet-900 to-slate-950 text-white pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
              Müşteri Portalı
            </p>
            <h1 className="text-lg font-bold">KanalERP</h1>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-2 text-sm text-violet-200 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Çıkış</span>
          </button>
        </div>
      </header>

      <nav className="hidden sm:flex max-w-5xl mx-auto px-4 py-3 gap-2 overflow-x-auto">
        {[...nav, { href: "/portal/contact", label: "Destek", icon: MessageCircle }].map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                active ? "bg-white text-violet-900" : "bg-white/10 text-violet-100 hover:bg-white/15"
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-white/10 bg-slate-950/95 backdrop-blur-md" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-around py-2">
          {bottomNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-semibold ${
                  active ? "text-white" : "text-violet-400"
                }`}
              >
                <item.icon size={20} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
