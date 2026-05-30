import { resolveSettingDocument } from '@/lib/erp-settings';
import {
  normalizeIntegrationModules,
  isIntegrationModuleEnabled,
  type IntegrationModuleKey,
  type IntegrationModulesEnabled,
  INTEGRATION_MODULE_LABELS,
} from '@/lib/integration-modules';
import {
  assertTenantOperational,
  getTenantLicense,
  mergeModulesWithLicense,
} from '@/lib/tenant-license';
import { isRootSession } from '@/lib/root-auth';
import type { SessionUser } from '@/lib/auth';

export async function loadIntegrationModulesEnabled(
  tenantId?: string,
  opts?: { skipLicenseCheck?: boolean }
): Promise<IntegrationModulesEnabled> {
  const doc = await resolveSettingDocument(tenantId);
  const nested = doc.get('integrationModulesEnabled');
  let settingsModules: IntegrationModulesEnabled;
  if (nested && typeof nested === 'object') {
    settingsModules = normalizeIntegrationModules(
      typeof (nested as { toObject?: () => unknown }).toObject === 'function'
        ? (nested as { toObject: () => unknown }).toObject()
        : nested
    );
  } else {
    const legacy: IntegrationModulesEnabled = {
      trendyolSeller: true,
      webStoreApi: true,
      trendyolEfaturam: Boolean(doc.get('efaturamEnabled')),
      wordpress: false,
    };
    settingsModules = normalizeIntegrationModules(legacy);
  }

  if (opts?.skipLicenseCheck) return settingsModules;

  const license = await getTenantLicense(tenantId);
  return mergeModulesWithLicense(settingsModules, license);
}

export async function assertIntegrationModuleEnabled(
  key: IntegrationModuleKey,
  tenantId?: string,
  session?: SessionUser | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isRootSession(session)) {
    const op = await assertTenantOperational(tenantId);
    if (!op.ok) return op;
  }

  const modules = await loadIntegrationModulesEnabled(tenantId);
  if (!isIntegrationModuleEnabled(modules, key)) {
    return {
      ok: false,
      error: `${INTEGRATION_MODULE_LABELS[key]} modülü kapalı veya lisans kapsamında değil.`,
    };
  }
  return { ok: true };
}
