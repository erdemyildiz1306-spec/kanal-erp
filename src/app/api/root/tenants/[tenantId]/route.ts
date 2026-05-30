import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireRootSession } from '@/lib/root-auth';
import { getSessionFromRequest } from '@/lib/auth';
import {
  extendLicenseExpiry,
  type LicensePlan,
} from '@/lib/tenant-license';
import {
  normalizeIntegrationModules,
} from '@/lib/integration-modules';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = requireRootSession(request, getSessionFromRequest);
    if (session instanceof NextResponse) return session;

    const { tenantId } = await context.params;
    const tid = decodeURIComponent(tenantId);
    const body = (await request.json()) as {
      name?: string;
      active?: boolean;
      notes?: string;
      license?: {
        plan?: LicensePlan;
        extend?: boolean;
        expiresAt?: string | null;
        suspended?: boolean;
        notes?: string;
        modules?: Record<string, boolean>;
      };
    };

    await connectToDatabase();
    const row = await Tenant.findOne({ tenantId: tid });
    if (!row) {
      return NextResponse.json({ success: false, error: 'Kuruluş bulunamadı.' }, { status: 404 });
    }

    if (body.name !== undefined) row.name = String(body.name).trim();
    if (body.active !== undefined) row.active = Boolean(body.active);
    if (body.notes !== undefined) row.notes = String(body.notes ?? '');

    const lic = body.license;
    if (lic) {
      const current = row.license ?? {};
      if (lic.plan) current.plan = lic.plan;
      if (lic.suspended !== undefined) current.suspended = Boolean(lic.suspended);
      if (lic.notes !== undefined) current.notes = String(lic.notes ?? '');

      if (lic.extend && lic.plan) {
        const base = current.expiresAt ? new Date(current.expiresAt) : null;
        current.expiresAt = extendLicenseExpiry(base, lic.plan);
        current.suspended = false;
      } else if (lic.expiresAt !== undefined) {
        current.expiresAt = lic.expiresAt ? new Date(lic.expiresAt) : null;
      }

      if (lic.modules && typeof lic.modules === 'object') {
        const existing = normalizeIntegrationModules(
          (current.modules as Record<string, unknown> | undefined) ?? {}
        );
        const normalized = normalizeIntegrationModules({ ...existing, ...lic.modules });
        current.modules = normalized;
      }

      row.license = current;
      row.markModified('license');
    }

    await row.save();
    return NextResponse.json({ success: true, tenant: row.toObject() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Güncelleme hatası';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = requireRootSession(request, getSessionFromRequest);
    if (session instanceof NextResponse) return session;

    const { tenantId } = await context.params;
    const tid = decodeURIComponent(tenantId);
    if (tid === 'default') {
      return NextResponse.json(
        { success: false, error: 'Varsayılan kuruluş silinemez.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const row = await Tenant.findOneAndDelete({ tenantId: tid });
    if (!row) {
      return NextResponse.json({ success: false, error: 'Kuruluş bulunamadı.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Silme hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
