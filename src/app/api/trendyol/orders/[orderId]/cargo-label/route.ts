import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { fetchTrendyolCommonLabel } from '@/lib/trendyol-common-label';

export async function GET(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    const { orderId } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const skipFlow = searchParams.get('skipFlow') === '1';

    const result = await fetchTrendyolCommonLabel(orderId, {
      userId: session.userId,
      userName: session.name,
      runFulfillment: !skipFlow,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
