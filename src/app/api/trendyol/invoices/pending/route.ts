import { NextResponse } from 'next/server';
import { listPendingTrendyolInvoices } from '@/lib/trendyol-invoice-flow';
import {
  requireInvoiceSession,
  storeInvoiceErrorResponse,
} from '@/lib/store-invoice-api';
import connectToDatabase from '@/lib/mongodb';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';
import { tenantScope } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = requireInvoiceSession(request);
    if (session instanceof NextResponse) return session;

    const { tenantId } = tenantScope(session);
    await connectToDatabase();
    const mod = await assertIntegrationModuleEnabled('trendyolEfaturam', tenantId);
    if (!mod.ok) {
      return NextResponse.json({ success: false, error: mod.error }, { status: 403 });
    }

    const orders = await listPendingTrendyolInvoices(150, tenantId);
    return NextResponse.json({ success: true, orders });
  } catch (error: unknown) {
    return storeInvoiceErrorResponse(error);
  }
}
