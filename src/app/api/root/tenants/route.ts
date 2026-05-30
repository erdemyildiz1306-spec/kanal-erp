import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { requireRootSession } from '@/lib/root-auth';
import { getSessionFromRequest } from '@/lib/auth';
import { ensureDefaultTenant, createTenantRecord } from '@/lib/tenant';
import { resolveSettingDocument } from '@/lib/erp-settings';
import { isLicenseExpired, applyTrialToTenant } from '@/lib/tenant-license';
import { normalizeIntegrationModules } from '@/lib/integration-modules';

export const dynamic = 'force-dynamic';

function serializeTenant(row: Record<string, unknown>) {
  const licenseRaw = (row.license ?? {}) as Record<string, unknown>;
  const modules = normalizeIntegrationModules(licenseRaw.modules);
  const expiresAt = licenseRaw.expiresAt ? new Date(String(licenseRaw.expiresAt)) : null;
  const license = {
    plan: String(licenseRaw.plan ?? 'trial'),
    packageKey: String(licenseRaw.packageKey ?? 'trial'),
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : null,
    modules,
    suspended: Boolean(licenseRaw.suspended),
    notes: String(licenseRaw.notes ?? ''),
  };
  return {
    tenantId: String(row.tenantId),
    name: String(row.name),
    slug: String(row.slug),
    active: row.active !== false,
    notes: String(row.notes ?? ''),
    license,
    licenseExpired: isLicenseExpired({
      plan: license.plan as 'trial',
      packageKey: license.packageKey as 'trial',
      expiresAt,
      modules,
      suspended: license.suspended,
      notes: license.notes,
    }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  try {
    const session = requireRootSession(request, getSessionFromRequest);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    await ensureDefaultTenant();
    const rows = await Tenant.find({}).sort({ name: 1 }).lean();
    const tenantIds = rows.map((r) => String(r.tenantId));
    const userCounts = await User.aggregate<{ _id: string; count: number }>([
      { $match: { tenantId: { $in: tenantIds } } },
      { $group: { _id: '$tenantId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(userCounts.map((u) => [u._id, u.count]));

    return NextResponse.json({
      success: true,
      tenants: rows.map((r) => ({
        ...serializeTenant(r as Record<string, unknown>),
        userCount: countMap.get(String(r.tenantId)) ?? 0,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requireRootSession(request, getSessionFromRequest);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      plan?: string;
    };
    const created = await createTenantRecord({
      name: String(body.name ?? ''),
      slug: body.slug,
    });
    await resolveSettingDocument(created.tenantId);
    await applyTrialToTenant(created.tenantId);

    const row = await Tenant.findOne({ tenantId: created.tenantId }).lean();
    return NextResponse.json({
      success: true,
      tenant: row ? serializeTenant(row as Record<string, unknown>) : created,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Kuruluş oluşturulamadı';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
