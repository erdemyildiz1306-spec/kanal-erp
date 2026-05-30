import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import Order from '@/models/Order';
import Product from '@/models/Product';
import { requireRootSession } from '@/lib/root-auth';
import { getSessionFromRequest } from '@/lib/auth';
import { ensureDefaultTenant } from '@/lib/tenant';
import { isLicenseExpired } from '@/lib/tenant-license';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = requireRootSession(request, getSessionFromRequest);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    await ensureDefaultTenant();

    const [tenantCount, userCount, orderCount, productCount, tenants] = await Promise.all([
      Tenant.countDocuments({}),
      User.countDocuments({}),
      Order.countDocuments({}),
      Product.countDocuments({}),
      Tenant.find({}).select('tenantId name active license').lean(),
    ]);

    let expiredLicenses = 0;
    let suspendedLicenses = 0;
    for (const t of tenants) {
      const lic = t.license ?? {};
      const expiresAt = lic.expiresAt ? new Date(lic.expiresAt) : null;
      if (lic.suspended) suspendedLicenses++;
      else if (
        isLicenseExpired({
          plan: String(lic.plan ?? 'trial') as 'trial',
          packageKey: String(lic.packageKey ?? 'trial') as 'trial',
          expiresAt,
          modules: lic.modules ?? {},
          suspended: false,
          notes: '',
        })
      ) {
        expiredLicenses++;
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        tenantCount,
        userCount,
        orderCount,
        productCount,
        expiredLicenses,
        suspendedLicenses,
        activeTenants: tenants.filter((t) => t.active !== false).length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
