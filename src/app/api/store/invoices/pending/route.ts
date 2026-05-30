import { NextResponse } from 'next/server';
import { listPendingStoreInvoices } from '@/lib/store-invoice-flow';
import {
  requireStoreInvoiceSession,
  storeInvoiceErrorResponse,
} from '@/lib/store-invoice-api';
import connectToDatabase from '@/lib/mongodb';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';
import { tenantScope } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = requireStoreInvoiceSession(request);
    if (session instanceof NextResponse) return session;

    const { tenantId } = tenantScope(session);
    await connectToDatabase();
    const mod = await assertIntegrationModuleEnabled('webStoreApi', tenantId);
    if (!mod.ok) {
      return NextResponse.json({ success: false, error: mod.error }, { status: 403 });
    }

    const orders = await listPendingStoreInvoices(150, tenantId);
    return NextResponse.json({ success: true, orders });
  } catch (error: unknown) {
    return storeInvoiceErrorResponse(error);
  }
}
