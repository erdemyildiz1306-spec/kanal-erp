import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { listPendingTrendyolInvoices } from '@/lib/trendyol-invoice-flow';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }
    const orders = await listPendingTrendyolInvoices(150);
    return NextResponse.json({ success: true, orders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
