import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { isLicenseExpired } from '@/lib/tenant-license';

export const dynamic = 'force-dynamic';

/** Süresi dolmuş lisansları askıya al (cron) */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get('authorization') ?? '';
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 });
  }

  await connectToDatabase();
  const rows = await Tenant.find({
    active: { $ne: false },
    'license.suspended': { $ne: true },
    'license.expiresAt': { $ne: null },
  }).lean();

  let suspended = 0;
  for (const row of rows) {
    const lic = row.license ?? {};
    const expiresAt = lic.expiresAt ? new Date(lic.expiresAt) : null;
    if (
      isLicenseExpired({
        plan: String(lic.plan ?? 'trial') as 'trial',
        packageKey: String(lic.packageKey ?? 'trial') as 'trial',
        expiresAt,
        modules: lic.modules ?? {},
        suspended: false,
        notes: '',
      })
    ) {
      await Tenant.updateOne(
        { tenantId: row.tenantId },
        { $set: { 'license.suspended': true } }
      );
      suspended++;
    }
  }

  return NextResponse.json({ success: true, suspended });
}
