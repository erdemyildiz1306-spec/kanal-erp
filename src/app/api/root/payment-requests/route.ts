import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import LicensePaymentRequest from '@/models/LicensePaymentRequest';
import Tenant from '@/models/Tenant';
import { requireRootSession } from '@/lib/root-auth';
import { getSessionFromRequest } from '@/lib/auth';
import { buildPaidLicenseUpdate } from '@/lib/tenant-license';
import { getPlatformBankInfo } from '@/lib/platform-billing';
import { LICENSE_PACKAGE_LABELS, type LicensePackageKey } from '@/lib/license-packages';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = requireRootSession(request, getSessionFromRequest);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const status = new URL(request.url).searchParams.get('status') ?? 'pending';
    const filter = status === 'all' ? {} : { status };
    const requests = await LicensePaymentRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const tenantIds = [...new Set(requests.map((r) => String(r.tenantId)))];
    const tenants = await Tenant.find({ tenantId: { $in: tenantIds } })
      .select('tenantId name')
      .lean();
    const nameMap = new Map(tenants.map((t) => [String(t.tenantId), String(t.name)]));

    return NextResponse.json({
      success: true,
      bank: getPlatformBankInfo(),
      requests: requests.map((r) => ({
        ...r,
        tenantName: nameMap.get(String(r.tenantId)) ?? r.tenantId,
        packageLabel:
          LICENSE_PACKAGE_LABELS[r.packageKey as LicensePackageKey] ?? r.packageKey,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = requireRootSession(request, getSessionFromRequest);
    if (session instanceof NextResponse) return session;

    const body = (await request.json()) as {
      id?: string;
      action?: 'approve' | 'reject';
      reviewNote?: string;
    };
    const id = String(body.id ?? '').trim();
    const action = body.action;
    if (!id || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json(
        { success: false, error: 'id ve action (approve|reject) zorunlu.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const row = await LicensePaymentRequest.findById(id);
    if (!row) {
      return NextResponse.json({ success: false, error: 'Kayıt bulunamadı.' }, { status: 404 });
    }
    if (row.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Bu bildirim zaten işlenmiş.' },
        { status: 409 }
      );
    }

    if (action === 'reject') {
      row.status = 'rejected';
      row.reviewedByUserId = session.userId;
      row.reviewedAt = new Date();
      row.reviewNote = String(body.reviewNote ?? '').trim();
      await row.save();
      return NextResponse.json({ success: true, request: row });
    }

    const tenant = await Tenant.findOne({ tenantId: row.tenantId });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Kuruluş bulunamadı.' }, { status: 404 });
    }

    const plan = row.plan as 'monthly' | 'yearly';
    const packageKey = (row.packageKey === 'efatura' ? 'efatura' : 'standard') as LicensePackageKey;
    const current = tenant.license?.expiresAt ? new Date(tenant.license.expiresAt) : null;
    const paid = buildPaidLicenseUpdate(packageKey, plan, current);
    tenant.license = {
      ...(tenant.license?.toObject?.() ?? tenant.license ?? {}),
      ...paid,
      notes: `${LICENSE_PACKAGE_LABELS[packageKey]} — ${plan === 'yearly' ? 'yıllık' : 'aylık'}`,
    };
    tenant.markModified('license');
    await tenant.save();

    row.status = 'approved';
    row.reviewedByUserId = session.userId;
    row.reviewedAt = new Date();
    row.reviewNote = String(body.reviewNote ?? '').trim();
    await row.save();

    return NextResponse.json({ success: true, request: row, tenant: tenant.toObject() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'İşlem hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
