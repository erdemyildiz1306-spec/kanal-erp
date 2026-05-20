import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ScanBarcode,
  Warehouse,
  Settings,
  BarChart3,
  Receipt,
  Users,
  ClipboardList,
  Wallet,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  shortLabel?: string;
};

export const primaryNav: NavItem[] = [
  { name: "Özet", shortLabel: "Ana", href: "/", icon: LayoutDashboard },
  { name: "Ürünler", shortLabel: "Ürün", href: "/products", icon: Package },
  { name: "Barkod", shortLabel: "Barkod", href: "/scanner", icon: ScanBarcode },
  { name: "Depo", shortLabel: "Depo", href: "/warehouse", icon: Warehouse },
  { name: "Siparişler", shortLabel: "Sipariş", href: "/orders", icon: ShoppingCart },
];

export const secondaryNav: NavItem[] = [
  { name: "Müşteriler", href: "/customers", icon: UserCircle },
  { name: "Fatura & KDV", href: "/invoices", icon: Receipt },
  { name: "Cari & Kasa", href: "/cari", icon: Wallet },
  { name: "Raporlar", href: "/reports", icon: BarChart3 },
  { name: "İşlem Günlüğü", href: "/activity-log", icon: ClipboardList },
  { name: "Kullanıcılar", href: "/users", icon: Users },
  { name: "Ayarlar", href: "/settings", icon: Settings },
];

export const allNav: NavItem[] = [...primaryNav, ...secondaryNav];

export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
