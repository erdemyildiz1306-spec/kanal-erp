import { NextResponse } from 'next/server';
import { listPendingTrendyolInvoices } from '@/lib/trendyol-invoice-flow';
import {
  requireInvoiceSession,
  storeInvoiceErrorResponse,
} from '@/lib/store-invoice-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = requireInvoiceSession(request);
    if (session instanceof NextResponse) return session;

    const orders = await listPendingTrendyolInvoices(150);
    return NextResponse.json({ success: true, orders });
  } catch (error: unknown) {
    return storeInvoiceErrorResponse(error);
  }
}
