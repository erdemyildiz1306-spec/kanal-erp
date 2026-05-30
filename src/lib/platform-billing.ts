/**
 * Platform lisans ödemesi — IBAN / havale (sanal POS yok)
 */
import {
  listLicensePackages,
  licenseAmountForPackage,
  type LicensePackageKey,
  type BillingPeriod,
} from '@/lib/license-packages';

export type { LicensePackageKey, BillingPeriod };
export { listLicensePackages, licenseAmountForPackage };

export type PlatformBankInfo = {
  bankName: string;
  accountHolder: string;
  iban: string;
  description: string;
  configured: boolean;
};

export function getPlatformBankInfo(tenantId?: string): PlatformBankInfo {
  const bankName = String(process.env.PLATFORM_BANK_NAME ?? '').trim();
  const accountHolder = String(process.env.PLATFORM_ACCOUNT_HOLDER ?? '').trim();
  const iban = String(process.env.PLATFORM_IBAN ?? '').replace(/\s+/g, '').trim();
  const tid = String(tenantId ?? '').trim() || 'default';
  const descriptionTemplate =
    String(process.env.PLATFORM_PAYMENT_DESCRIPTION ?? '').trim() ||
    'Kanal ERP lisans — {tenantId}';
  const description = descriptionTemplate.replace(/\{tenantId\}/g, tid);

  return {
    bankName,
    accountHolder,
    iban,
    description,
    configured: Boolean(bankName && accountHolder && iban),
  };
}

/** @deprecated licenseAmountForPackage kullanın */
export function licenseAmountForPlan(
  period: BillingPeriod,
  packageKey: LicensePackageKey = 'standard'
): number {
  return licenseAmountForPackage(packageKey, period);
}
