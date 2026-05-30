import { NextResponse } from 'next/server';
import { syncTrendyolFinance } from '@/lib/trendyol-finance';
import { formatTrendyolAxiosError } from '@/lib/trendyol';
import { requireSession } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';

export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator', 'accountant']);
    if (session instanceof NextResponse) return session;

    const { tenantId } = tenantScope(session);
    const mod = await assertIntegrationModuleEnabled('trendyolSeller', tenantId, session);
    if (!mod.ok) {
      return NextResponse.json({ success: false, error: mod.error }, { status: 403 });
    }

    let daysBack = 30;
    try {
      const body = await request.json();
      if (body?.daysBack != null) daysBack = Number(body.daysBack);
    } catch {
      /* empty body ok */
    }

    const result = await syncTrendyolFinance({ daysBack, tenantId });
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message =
      formatTrendyolAxiosError(error) ||
      (error instanceof Error ? error.message : 'Finans senkronu başarısız');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
