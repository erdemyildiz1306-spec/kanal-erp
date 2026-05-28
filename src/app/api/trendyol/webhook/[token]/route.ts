import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import { ingestTrendyolWebhookBody } from '@/lib/trendyol-order-ingest';
import { logActivity } from '@/lib/activity-log';
import { getTrendyolSettings } from '@/lib/trendyol';
import { markTrendyolWebhookReceived } from '@/lib/trendyol-sync-guard';
import { secureCompareStrings } from '@/lib/secure-compare';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const ip = clientIp(request);
    const rl = checkRateLimit(`webhook:trendyol:${ip}`, { limit: 120, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ success: false, error: 'Webhook rate limit aşıldı.' }, { status: 429 });
    }

    const { token } = await ctx.params;
    await connectToDatabase();
    const doc = await resolveSingletonSettingDocument();
    const expected = String(doc.get('trendyolWebhookSecret') ?? '').trim();
    if (!expected || !secureCompareStrings(token, expected)) {
      return NextResponse.json({ success: false, error: 'Geçersiz webhook token' }, { status: 401 });
    }

    const settings = await getTrendyolSettings();
    const body = await request.json();
    const result = await ingestTrendyolWebhookBody(body, {
      expectedSellerId: settings.sellerId,
    });

    if (result.rejectedSeller) {
      return NextResponse.json(
        { success: false, error: 'Webhook sellerId eşleşmedi' },
        { status: 403 }
      );
    }

    await markTrendyolWebhookReceived();

    await logActivity({
      action: 'trendyol_webhook',
      module: 'orders',
      detail: `${result.count} paket işlendi`,
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Webhook hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
