import { NextResponse } from 'next/server';
import {
  computeFinanceAnalytics,
  type FinanceRange,
} from '@/lib/profit-analytics';
import { requireSession } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';

const RANGES: FinanceRange[] = ['7g', '30g', 'bu-ay', 'bu-yil'];

export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator', 'accountant']);
    if (session instanceof NextResponse) return session;

    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('range') ?? '30g';
    const range: FinanceRange = RANGES.includes(raw as FinanceRange)
      ? (raw as FinanceRange)
      : '30g';

    const data = await computeFinanceAnalytics(range, tenantScope(session).tenantId);
    return NextResponse.json({ success: true, ...data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Analiz hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
