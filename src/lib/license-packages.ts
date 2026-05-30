/**
 * Lisans paketleri — deneme süresi tüm modüller açık; ücretli paketlerde E-Faturam ayrımı
 */
import type { IntegrationModulesEnabled } from '@/lib/integration-modules';

export const TRIAL_DAYS = 14;

export type LicensePackageKey = 'standard' | 'efatura';
export type BillingPeriod = 'monthly' | 'yearly';

export type LicensePackageDef = {
  key: LicensePackageKey;
  name: string;
  shortName: string;
  description: string;
  includesEfaturam: boolean;
  monthlyAmount: number;
  yearlyAmount: number;
  modules: IntegrationModulesEnabled;
};

function parseAmount(raw: string | undefined, fallback: number): number {
  const n = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Deneme: tüm entegrasyonlar açık */
export function trialLicenseModules(): IntegrationModulesEnabled {
  return {
    trendyolSeller: true,
    webStoreApi: true,
    trendyolEfaturam: true,
    wordpress: true,
  };
}

export function packageModules(key: LicensePackageKey): IntegrationModulesEnabled {
  const base: IntegrationModulesEnabled = {
    trendyolSeller: true,
    webStoreApi: true,
    trendyolEfaturam: false,
    wordpress: true,
  };
  if (key === 'efatura') {
    base.trendyolEfaturam = true;
  }
  return base;
}

export function listLicensePackages(): LicensePackageDef[] {
  const standardMonthly = parseAmount(process.env.LICENSE_STANDARD_MONTHLY, 990);
  const standardYearly = parseAmount(process.env.LICENSE_STANDARD_YEARLY, 9900);
  const efaturaMonthly = parseAmount(process.env.LICENSE_EFATURA_MONTHLY, 1490);
  const efaturaYearly = parseAmount(process.env.LICENSE_EFATURA_YEARLY, 14900);

  return [
    {
      key: 'standard',
      name: 'Standart Paket',
      shortName: 'Standart',
      description:
        'Trendyol satıcı, mağaza API ve WordPress entegrasyonu. Trendyol E-Faturam dahil değildir.',
      includesEfaturam: false,
      monthlyAmount: standardMonthly,
      yearlyAmount: standardYearly,
      modules: packageModules('standard'),
    },
    {
      key: 'efatura',
      name: 'E-Faturam Paketi',
      shortName: 'E-Faturam',
      description:
        'Standart paketteki tüm özellikler + Trendyol E-Faturam (e-Arşiv / e-Fatura kesimi).',
      includesEfaturam: true,
      monthlyAmount: efaturaMonthly,
      yearlyAmount: efaturaYearly,
      modules: packageModules('efatura'),
    },
  ];
}

export function getLicensePackage(key: LicensePackageKey): LicensePackageDef | null {
  return listLicensePackages().find((p) => p.key === key) ?? null;
}

export function licenseAmountForPackage(
  packageKey: LicensePackageKey,
  period: BillingPeriod
): number {
  const pkg = getLicensePackage(packageKey);
  if (!pkg) return 0;
  return period === 'yearly' ? pkg.yearlyAmount : pkg.monthlyAmount;
}

export const LICENSE_PACKAGE_LABELS: Record<LicensePackageKey, string> = {
  standard: 'Standart Paket',
  efatura: 'E-Faturam Paketi',
};
