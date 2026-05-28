import { NextResponse } from 'next/server';
import { issueStoreInvoiceForOrder } from '@/lib/store-invoice-flow';
import {
  assertValidStoreOrderId,
  enforceInvoiceRateLimit,
  logInvoiceActivity,
  requireStoreInvoiceSession,
  storeInvoiceErrorResponse,
} from '@/lib/store-invoice-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = requireStoreInvoiceSession(request);
    if (session instanceof NextResponse) return session;
    const limited = enforceInvoiceRateLimit(session.userId);
    if (limited) return limited;

    const body = (await request.json()) as {
      orderId?: string;
      mode?: 'efaturam' | 'link' | 'file';
      invoiceLink?: string;
      invoiceNumber?: string;
      markInvoiced?: boolean;
    };

    const orderId = assertValidStoreOrderId(body.orderId ?? '');
    const mode = body.mode ?? 'efaturam';

    const result = await issueStoreInvoiceForOrder({
      orderId,
      mode,
      invoiceLink: body.invoiceLink,
      invoiceNumber: body.invoiceNumber,
      markInvoiced: body.markInvoiced,
    });

    await logInvoiceActivity(session, {
      platform: 'web',
      action: 'issue',
      orderNumber: result.orderNumber,
      invoiceNumber: result.invoiceNumber,
      mode,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    return storeInvoiceErrorResponse(error);
  }
}
