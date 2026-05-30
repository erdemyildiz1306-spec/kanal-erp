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
  LineChart,
  FileText,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "@/lib/module-settings";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  shortLabel?: string;
  /** Ayarlardan kapatılabilir; tanımsız = her zaman görünür */
  moduleKey?: ModuleKey;
};

export const primaryNav: NavItem[] = [
  { name: "Özet", shortLabel: "Ana", href: "/", icon: LayoutDashboard, moduleKey: "dashboard" },
  { name: "Ürünler", shortLabel: "Ürün", href: "/products", icon: Package, moduleKey: "products" },
  { name: "Barkod", shortLabel: "Barkod", href: "/scanner", icon: ScanBarcode, moduleKey: "scanner" },
  { name: "Depo", shortLabel: "Depo", href: "/warehouse", icon: Warehouse, moduleKey: "warehouse" },
  { name: "Siparişler", shortLabel: "Sipariş", href: "/orders", icon: ShoppingCart, moduleKey: "orders" },
];

export const secondaryNav: NavItem[] = [
  { name: "Finans & Kâr", href: "/finans", icon: LineChart, moduleKey: "finans" },
  { name: "Müşteriler", href: "/customers", icon: UserCircle, moduleKey: "customers" },
  { name: "Fatura & KDV", href: "/invoices", icon: Receipt, moduleKey: "invoices" },
  { name: "Trendyol Fatura", href: "/invoices/trendyol", icon: FileText, moduleKey: "trendyolInvoice" },
  { name: "Mağaza Fatura", href: "/invoices/store", icon: Store, moduleKey: "storeInvoice" },
  { name: "Cari & Kasa", href: "/cari", icon: Wallet, moduleKey: "cari" },
  { name: "Raporlar", href: "/reports", icon: BarChart3, moduleKey: "reports" },
  { name: "İşlem Günlüğü", href: "/activity-log", icon: ClipboardList, moduleKey: "activityLog" },
  { name: "Kullanıcılar", href: "/users", icon: Users, moduleKey: "users" },
  { name: "Ayarlar", href: "/settings", icon: Settings },
];

export const allNav: NavItem[] = [...primaryNav, ...secondaryNav];

export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
