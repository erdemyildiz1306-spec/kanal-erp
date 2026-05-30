import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Setting from '@/models/Setting';
import { ingestTrendyolWebhookBody } from '@/lib/trendyol-order-ingest';
import { logActivity } from '@/lib/activity-log';
import { getTrendyolSettings } from '@/lib/trendyol';
import { markTrendyolWebhookReceived } from '@/lib/trendyol-sync-guard';
import { secureCompareStrings } from '@/lib/secure-compare';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';
import { DEFAULT_TENANT_ID, normalizeTenantId } from '@/lib/tenant';

async function findSettingByWebhookToken(token: string) {
  const rows = await Setting.find({
    trendyolWebhookSecret: { $exists: true, $nin: ['', null] },
  });
  for (const row of rows) {
    const expected = String(row.get('trendyolWebhookSecret') ?? '').trim();
    if (expected && secureCompareStrings(token, expected)) return row;
  }
  return null;
}

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

    const doc = await findSettingByWebhookToken(String(token ?? '').trim());
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Geçersiz webhook token' }, { status: 401 });
    }

    const tenantId = normalizeTenantId(doc.get('tenantId'));

    const mod = await assertIntegrationModuleEnabled('trendyolSeller', tenantId);
    if (!mod.ok) {
      return NextResponse.json({ success: false, error: mod.error }, { status: 403 });
    }

    const settings = await getTrendyolSettings(tenantId);
    const body = await request.json();
    const result = await ingestTrendyolWebhookBody(body, {
      expectedSellerId: settings.sellerId,
      tenantId,
    });

    if (result.rejectedSeller) {
      return NextResponse.json(
        { success: false, error: 'Webhook sellerId eşleşmedi' },
        { status: 403 }
      );
    }

    await markTrendyolWebhookReceived(tenantId);

    await logActivity({
      action: 'trendyol_webhook',
      module: 'orders',
      detail: `${result.count} paket işlendi (${tenantId})`,
    });

    return NextResponse.json({ success: true, count: result.count, tenantId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Webhook hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
