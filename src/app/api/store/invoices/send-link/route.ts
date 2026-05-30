import { NextResponse } from 'next/server';
import { notifyStoreInvoiceOnly } from '@/lib/store-invoice-flow';
import {
  assertValidStoreOrderId,
  enforceInvoiceRateLimit,
  logInvoiceActivity,
  requireStoreInvoiceSession,
  storeInvoiceErrorResponse,
} from '@/lib/store-invoice-api';
import connectToDatabase from '@/lib/mongodb';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = requireStoreInvoiceSession(request);
    if (session instanceof NextResponse) return session;
    const limited = enforceInvoiceRateLimit(session.userId);
    if (limited) return limited;

    await connectToDatabase();
    const mod = await assertIntegrationModuleEnabled('webStoreApi');
    if (!mod.ok) {
      return NextResponse.json({ success: false, error: mod.error }, { status: 403 });
    }

    const body = (await request.json()) as {
      orderId?: string;
      invoiceLink?: string;
      invoiceNumber?: string;
    };

    const orderId = assertValidStoreOrderId(body.orderId ?? '');
    const invoiceLink = String(body.invoiceLink ?? '').trim();
    if (!invoiceLink) {
      return NextResponse.json(
        { success: false, error: 'orderId ve invoiceLink zorunlu.' },
        { status: 400 }
      );
    }

    const result = await notifyStoreInvoiceOnly({
      orderId,
      invoiceLink,
      invoiceNumber: body.invoiceNumber,
    });

    await logInvoiceActivity(session, {
      platform: 'web',
      action: 'send_link',
      orderNumber: result.orderNumber,
      invoiceNumber: body.invoiceNumber,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return storeInvoiceErrorResponse(error);
  }
}
