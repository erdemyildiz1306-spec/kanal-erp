import { NextResponse } from 'next/server';
import { syncTrendyolFinance } from '@/lib/trendyol-finance';
import { formatTrendyolAxiosError } from '@/lib/trendyol';

export async function POST(request: Request) {
  try {
    let daysBack = 30;
    try {
      const body = await request.json();
      if (body?.daysBack != null) daysBack = Number(body.daysBack);
    } catch {
      /* empty body ok */
    }

    const result = await syncTrendyolFinance({ daysBack });
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message =
      formatTrendyolAxiosError(error) ||
      (error instanceof Error ? error.message : 'Finans senkronu başarısız');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
