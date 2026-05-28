import { NextResponse } from 'next/server';
import { listPendingStoreInvoices } from '@/lib/store-invoice-flow';
import {
  requireStoreInvoiceSession,
  storeInvoiceErrorResponse,
} from '@/lib/store-invoice-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = requireStoreInvoiceSession(request);
    if (session instanceof NextResponse) return session;

    const orders = await listPendingStoreInvoices(150);
    return NextResponse.json({ success: true, orders });
  } catch (error: unknown) {
    return storeInvoiceErrorResponse(error);
  }
}
