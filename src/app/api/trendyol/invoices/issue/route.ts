import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { issueTrendyolInvoiceForOrder } from '@/lib/trendyol-invoice-flow';
import { formatTrendyolAxiosError } from '@/lib/trendyol';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    const body = (await request.json()) as {
      orderId?: string;
      mode?: 'efaturam' | 'link' | 'file';
      invoiceLink?: string;
      invoiceNumber?: string;
      markInvoiced?: boolean;
    };

    const orderId = String(body.orderId ?? '').trim();
    const mode = body.mode ?? 'efaturam';
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId zorunlu.' }, { status: 400 });
    }

    const result = await issueTrendyolInvoiceForOrder({
      orderId,
      mode,
      invoiceLink: body.invoiceLink,
      invoiceNumber: body.invoiceNumber,
      markInvoiced: body.markInvoiced,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? formatTrendyolAxiosError(error) || error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
