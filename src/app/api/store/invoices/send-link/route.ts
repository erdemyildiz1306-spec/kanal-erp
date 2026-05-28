import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { notifyStoreInvoiceOnly } from '@/lib/store-invoice-flow';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    const body = (await request.json()) as {
      orderId?: string;
      invoiceLink?: string;
      invoiceNumber?: string;
    };

    const orderId = String(body.orderId ?? '').trim();
    const invoiceLink = String(body.invoiceLink ?? '').trim();
    if (!orderId || !invoiceLink) {
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

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
