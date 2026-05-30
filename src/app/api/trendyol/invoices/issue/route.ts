import { NextResponse } from 'next/server';
import { issueTrendyolInvoiceForOrder } from '@/lib/trendyol-invoice-flow';
import { formatTrendyolAxiosError } from '@/lib/trendyol';
import {
  assertValidStoreOrderId,
  enforceInvoiceRateLimit,
  logInvoiceActivity,
  requireInvoiceSession,
  storeInvoiceErrorResponse,
} from '@/lib/store-invoice-api';
import connectToDatabase from '@/lib/mongodb';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = requireInvoiceSession(request);
    if (session instanceof NextResponse) return session;
    const limited = enforceInvoiceRateLimit(session.userId);
    if (limited) return limited;

    await connectToDatabase();
    const mod = await assertIntegrationModuleEnabled('trendyolEfaturam');
    if (!mod.ok) {
      return NextResponse.json({ success: false, error: mod.error }, { status: 403 });
    }

    const body = (await request.json()) as {
      orderId?: string;
      mode?: 'efaturam' | 'link' | 'file';
      invoiceLink?: string;
      invoiceNumber?: string;
      markInvoiced?: boolean;
    };

    const orderId = assertValidStoreOrderId(body.orderId ?? '');
    const mode = body.mode ?? 'efaturam';

    const result = await issueTrendyolInvoiceForOrder({
      orderId,
      mode,
      invoiceLink: body.invoiceLink,
      invoiceNumber: body.invoiceNumber,
      markInvoiced: body.markInvoiced,
    });

    await logInvoiceActivity(session, {
      platform: 'trendyol',
      action: 'issue',
      orderNumber: result.orderNumber,
      invoiceNumber: result.invoiceNumber,
      mode,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? formatTrendyolAxiosError(error) || error.message : 'Sunucu hatası';
    return storeInvoiceErrorResponse(error instanceof Error ? error : new Error(message));
  }
}
