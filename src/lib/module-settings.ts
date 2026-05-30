import type { NavItem } from "@/lib/navigation";

export type ModuleKey =
  | "dashboard"
  | "products"
  | "scanner"
  | "warehouse"
  | "orders"
  | "finans"
  | "customers"
  | "invoices"
  | "trendyolInvoice"
  | "storeInvoice"
  | "cari"
  | "reports"
  | "activityLog"
  | "users";

export type ModulesEnabled = Record<ModuleKey, boolean>;

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Özet paneli",
  products: "Ürünler & stok",
  scanner: "Barkod okuyucu",
  warehouse: "Depo",
  orders: "Siparişler",
  finans: "Finans & kâr",
  customers: "Müşteriler",
  invoices: "Fatura & KDV",
  trendyolInvoice: "Trendyol fatura",
  storeInvoice: "Mağaza fatura",
  cari: "Cari & kasa",
  reports: "Raporlar",
  activityLog: "İşlem günlüğü",
  users: "Kullanıcılar",
};

export const DEFAULT_MODULES_ENABLED: ModulesEnabled = {
  dashboard: true,
  products: true,
  scanner: true,
  warehouse: true,
  orders: true,
  finans: true,
  customers: true,
  invoices: true,
  trendyolInvoice: true,
  storeInvoice: true,
  cari: true,
  reports: true,
  activityLog: true,
  users: true,
};

export function normalizeModulesEnabled(raw: unknown): ModulesEnabled {
  const out = { ...DEFAULT_MODULES_ENABLED };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(DEFAULT_MODULES_ENABLED) as ModuleKey[]) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

export function isModuleEnabled(
  modules: ModulesEnabled,
  key: ModuleKey | undefined
): boolean {
  if (!key) return true;
  return modules[key] !== false;
}

export function filterNavByModules<T extends NavItem>(
  items: T[],
  modules: ModulesEnabled
): T[] {
  return items.filter((item) => isModuleEnabled(modules, item.moduleKey));
}
