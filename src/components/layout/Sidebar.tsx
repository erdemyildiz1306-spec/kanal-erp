"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  ScanBarcode,
  Warehouse,
  Receipt,
  Users,
  ClipboardList,
  Wallet,
  UserCircle,
} from "lucide-react";

const menuItems = [
  { name: "Özet", icon: LayoutDashboard, href: "/" },
  { name: "Ürünler & Stok", icon: Package, href: "/products" },
  { name: "Depo", icon: Warehouse, href: "/warehouse" },
  { name: "Siparişler", icon: ShoppingCart, href: "/orders" },
  { name: "Müşteriler", icon: UserCircle, href: "/customers" },
  { name: "Fatura & KDV", icon: Receipt, href: "/invoices" },
  { name: "Cari & Kasa", icon: Wallet, href: "/cari" },
  { name: "Barkod Okuyucu", icon: ScanBarcode, href: "/scanner" },
  { name: "Raporlar", icon: BarChart3, href: "/reports" },
  { name: "İşlem Günlüğü", icon: ClipboardList, href: "/activity-log" },
  { name: "Kullanıcılar", icon: Users, href: "/users" },
  { name: "Ayarlar", icon: Settings, href: "/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[var(--erp-sidebar)] text-[#e8e4df] border-r border-[#2f3832]">
      <div className="flex shrink-0 items-center justify-center h-[4.25rem] border-b border-[#323d36] px-3">
        <div className="text-center select-none">
          <h1 className="text-lg font-semibold tracking-wide text-[#f7f5f3]">
            Kanal<span className="text-[#c4d4c8] font-bold">ERP</span>
          </h1>
          <p className="text-[11px] text-[#98a099] mt-0.5">Trendyol · Mağaza</p>
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-0.5">
          {menuItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition-colors ${
                    active
                      ? "bg-[#49564d] text-white shadow-inner"
                      : "text-[#c9c5c0] hover:bg-[#464f48] hover:text-white"
                  }`}
                >
                  <item.icon size={18} strokeWidth={1.75} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="shrink-0 p-4 border-t border-[#323d36] text-[11px] text-center text-[#7e877f] leading-relaxed">
        Yumuşak kontrast · Stok tek depo
      </div>
    </div>
  );
}
