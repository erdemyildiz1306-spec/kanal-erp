import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import { ingestTrendyolWebhookBody } from '@/lib/trendyol-order-ingest';
import { logActivity } from '@/lib/activity-log';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;
    await connectToDatabase();
    const doc = await resolveSingletonSettingDocument();
    const expected = String(doc.get('trendyolWebhookSecret') ?? '').trim();
    if (!expected || token !== expected) {
      return NextResponse.json({ success: false, error: 'Geçersiz webhook token' }, { status: 401 });
    }

    const body = await request.json();
    const count = await ingestTrendyolWebhookBody(body);
    await logActivity({
      action: 'trendyol_webhook',
      module: 'orders',
      detail: `${count} paket işlendi`,
    });

    return NextResponse.json({ success: true, count });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Webhook hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
