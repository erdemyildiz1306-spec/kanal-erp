/** Ayarlar sekmelerindeki entegrasyon modülleri (menü «Modüller»den ayrı) */
export type IntegrationModuleKey =
  | 'trendyolSeller'
  | 'webStoreApi'
  | 'trendyolEfaturam'
  | 'wordpress';

export type IntegrationModulesEnabled = Record<IntegrationModuleKey, boolean>;

export const INTEGRATION_MODULE_LABELS: Record<IntegrationModuleKey, string> = {
  trendyolSeller: 'Trendyol Satıcı API',
  webStoreApi: 'Next.js Mağaza API',
  trendyolEfaturam: 'Trendyol E-Faturam',
  wordpress: 'WordPress WooCommerce',
};

export const DEFAULT_INTEGRATION_MODULES: IntegrationModulesEnabled = {
  trendyolSeller: true,
  webStoreApi: true,
  trendyolEfaturam: false,
  wordpress: false,
};

export function normalizeIntegrationModules(raw: unknown): IntegrationModulesEnabled {
  const out = { ...DEFAULT_INTEGRATION_MODULES };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(DEFAULT_INTEGRATION_MODULES) as IntegrationModuleKey[]) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

export function isIntegrationModuleEnabled(
  modules: IntegrationModulesEnabled,
  key: IntegrationModuleKey
): boolean {
  return modules[key] !== false;
}

/** Trendyol ürün satırından liste durumu */
export function parseTrendyolListingActive(item: Record<string, unknown>): boolean {
  if (item.archived === true || item.blacklisted === true || item.rejected === true) {
    return false;
  }
  if (item.locked === true) return false;
  if (item.onSale === false) return false;
  if (item.saleStatus === false) return false;
  const status = String(item.status ?? item.productStatus ?? '').toLowerCase();
  if (/archiv|reject|passiv|inactive|blacklist|lock/.test(status)) return false;
  return true;
}
