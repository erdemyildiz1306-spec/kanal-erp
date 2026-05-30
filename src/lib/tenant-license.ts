import connectToDatabase from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import {
  DEFAULT_INTEGRATION_MODULES,
  normalizeIntegrationModules,
  type IntegrationModulesEnabled,
  type IntegrationModuleKey,
} from '@/lib/integration-modules';
import {
  TRIAL_DAYS,
  trialLicenseModules,
  packageModules,
  type LicensePackageKey,
} from '@/lib/license-packages';
import { DEFAULT_TENANT_ID, normalizeTenantId, createTenantRecord } from '@/lib/tenant';
import { resolveSettingDocument } from '@/lib/erp-settings';

export type LicensePlan = 'trial' | 'monthly' | 'yearly' | 'custom';
export type LicensePackageKeyStored = 'trial' | LicensePackageKey;

export type TenantLicense = {
  plan: LicensePlan;
  packageKey: LicensePackageKeyStored;
  expiresAt: Date | null;
  modules: IntegrationModulesEnabled;
  suspended: boolean;
  notes: string;
};

const DEFAULT_LICENSE: TenantLicense = {
  plan: 'trial',
  packageKey: 'trial',
  expiresAt: null,
  modules: { ...DEFAULT_INTEGRATION_MODULES },
  suspended: false,
  notes: '',
};

function readLicenseFromDoc(doc: Record<string, unknown> | null | undefined): TenantLicense {
  const raw = doc?.license as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_LICENSE, modules: { ...DEFAULT_INTEGRATION_MODULES } };
  }
  const plan = String(raw.plan ?? 'trial') as LicensePlan;
  const expiresAt = raw.expiresAt ? new Date(String(raw.expiresAt)) : null;
  const pkgRaw = String(raw.packageKey ?? 'trial');
  const packageKey: LicensePackageKeyStored =
    pkgRaw === 'standard' || pkgRaw === 'efatura' ? pkgRaw : 'trial';

  let modules = normalizeIntegrationModules(raw.modules);
  if (plan === 'trial' && !raw.modules) {
    modules = trialLicenseModules();
  }

  return {
    plan: ['trial', 'monthly', 'yearly', 'custom'].includes(plan) ? plan : 'trial',
    packageKey,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    modules,
    suspended: Boolean(raw.suspended),
    notes: String(raw.notes ?? ''),
  };
}

export async function getTenantLicense(tenantId?: string): Promise<TenantLicense> {
  await connectToDatabase();
  const tid = normalizeTenantId(tenantId);
  const row = await Tenant.findOne({ tenantId: tid }).lean();
  return readLicenseFromDoc(row as Record<string, unknown> | null);
}

export function isLicenseExpired(license: TenantLicense): boolean {
  if (!license.expiresAt) return false;
  return license.expiresAt.getTime() < Date.now();
}

export function isTrialLicense(license: TenantLicense): boolean {
  return license.plan === 'trial' || license.packageKey === 'trial';
}

export function trialDaysRemaining(license: TenantLicense): number | null {
  if (!license.expiresAt || !isTrialLicense(license)) return null;
  const ms = license.expiresAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** Yeni kuruluşa 14 günlük deneme lisansı */
export function buildTrialLicensePayload(): {
  plan: 'trial';
  packageKey: 'trial';
  expiresAt: Date;
  modules: IntegrationModulesEnabled;
  suspended: boolean;
} {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TRIAL_DAYS);
  return {
    plan: 'trial',
    packageKey: 'trial',
    expiresAt,
    modules: trialLicenseModules(),
    suspended: false,
  };
}

export async function applyTrialToTenant(tenantId: string): Promise<void> {
  await connectToDatabase();
  const trial = buildTrialLicensePayload();
  await Tenant.updateOne(
    { tenantId: normalizeTenantId(tenantId) },
    {
      $set: {
        license: {
          ...trial,
          notes: `${TRIAL_DAYS} günlük deneme — tüm modüller açık`,
        },
      },
    }
  );
}

/** Kayıt: yeni kuruluş + deneme lisansı + ayar belgesi */
export async function provisionNewTenantWithTrial(orgName: string): Promise<{
  tenantId: string;
  slug: string;
  name: string;
}> {
  const created = await createTenantRecord({ name: orgName });
  await applyTrialToTenant(created.tenantId);
  await resolveSettingDocument(created.tenantId);
  return created;
}

/** Lisans + kuruluş aktif mi */
export async function assertTenantOperational(
  tenantId?: string
): Promise<{ ok: true; license: TenantLicense } | { ok: false; error: string }> {
  await connectToDatabase();
  const tid = normalizeTenantId(tenantId);
  const row = await Tenant.findOne({ tenantId: tid }).lean();
  if (!row) {
    return { ok: false, error: 'Kuruluş bulunamadı.' };
  }
  if (row.active === false) {
    return { ok: false, error: 'Kuruluş hesabı pasif.' };
  }
  const license = readLicenseFromDoc(row as Record<string, unknown>);
  if (license.suspended) {
    return { ok: false, error: 'Kuruluş lisansı askıya alındı.' };
  }
  if (isLicenseExpired(license)) {
    const msg = isTrialLicense(license)
      ? '14 günlük deneme süreniz doldu. Ayarlar → Lisans bölümünden paket seçip ödeme bildirimi gönderin.'
      : 'Lisans süreniz doldu. Ayarlar → Lisans bölümünden paket yenileyin veya ödeme bildirimi gönderin.';
    return { ok: false, error: msg };
  }
  return { ok: true, license };
}

/** Ayar modülleri ∩ lisans modülleri */
export function mergeModulesWithLicense(
  settingsModules: IntegrationModulesEnabled,
  license: TenantLicense
): IntegrationModulesEnabled {
  const out = { ...settingsModules };
  for (const key of Object.keys(DEFAULT_INTEGRATION_MODULES) as IntegrationModuleKey[]) {
    if (!license.modules[key]) {
      out[key] = false;
    }
  }
  return out;
}

/** Ödeme onayı / root: lisans süresini uzat */
export function extendLicenseExpiry(current: Date | null, plan: LicensePlan): Date {
  const base = current && current.getTime() > Date.now() ? current : new Date();
  const next = new Date(base);
  if (plan === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else if (plan === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else if (plan === 'trial') {
    next.setDate(next.getDate() + TRIAL_DAYS);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

/** Root / ödeme onayı: paket modüllerini uygula */
export function buildPaidLicenseUpdate(
  packageKey: LicensePackageKey,
  period: 'monthly' | 'yearly',
  currentExpiresAt: Date | null
): {
  plan: 'monthly' | 'yearly';
  packageKey: LicensePackageKey;
  expiresAt: Date;
  modules: IntegrationModulesEnabled;
  suspended: boolean;
} {
  return {
    plan: period,
    packageKey,
    expiresAt: extendLicenseExpiry(currentExpiresAt, period),
    modules: packageModules(packageKey),
    suspended: false,
  };
}

export { DEFAULT_TENANT_ID };
