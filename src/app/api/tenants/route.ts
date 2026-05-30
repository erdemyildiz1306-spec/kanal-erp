import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireSession } from '@/lib/auth';
import {
  createTenantRecord,
  ensureDefaultTenant,
  tenantScope,
} from '@/lib/tenant';
import { resolveSettingDocument } from '@/lib/erp-settings';
import { applyTrialToTenant } from '@/lib/tenant-license';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin']);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    await ensureDefaultTenant();
    const { tenantId } = tenantScope(session);

    if (session.role === 'root') {
      const tenants = await Tenant.find({}).sort({ name: 1 }).lean();
      return NextResponse.json({
        success: true,
        isRoot: true,
        tenants,
        currentTenantId: tenantId,
      });
    }

    const current = await Tenant.findOne({ tenantId }).lean();
    return NextResponse.json({
      success: true,
      isRoot: false,
      tenants: current ? [current] : [],
      currentTenantId: tenantId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin']);
    if (session instanceof NextResponse) return session;

    if (session.role !== 'root') {
      return NextResponse.json(
        { success: false, error: 'Yeni kuruluş oluşturma yalnızca platform yöneticisine açıktır.' },
        { status: 403 }
      );
    }

    await connectToDatabase();
    const body = (await request.json()) as { name?: string; slug?: string };
    const created = await createTenantRecord({
      name: String(body.name ?? ''),
      slug: body.slug,
    });
    await resolveSettingDocument(created.tenantId);
    await applyTrialToTenant(created.tenantId);
    return NextResponse.json({ success: true, tenant: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Kuruluş oluşturulamadı';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
