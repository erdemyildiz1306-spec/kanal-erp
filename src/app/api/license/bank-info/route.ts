import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';
import { getPlatformBankInfo } from '@/lib/platform-billing';
import { listLicensePackages } from '@/lib/license-packages';
import {
  getTenantLicense,
  isLicenseExpired,
  isTrialLicense,
  trialDaysRemaining,
} from '@/lib/tenant-license';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { tenantId } = tenantScope(session);
    const bank = getPlatformBankInfo(tenantId);
    const license = await getTenantLicense(tenantId);
    const packages = listLicensePackages().map((p) => ({
      key: p.key,
      name: p.name,
      shortName: p.shortName,
      description: p.description,
      includesEfaturam: p.includesEfaturam,
      monthlyAmount: p.monthlyAmount,
      yearlyAmount: p.yearlyAmount,
    }));

    return NextResponse.json({
      success: true,
      bank,
      packages,
      trialDays: 14,
      license: {
        plan: license.plan,
        packageKey: license.packageKey,
        expiresAt: license.expiresAt?.toISOString() ?? null,
        suspended: license.suspended,
        expired: isLicenseExpired(license),
        isTrial: isTrialLicense(license),
        trialDaysRemaining: trialDaysRemaining(license),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
