import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { runTrendyolOrderSync } from '@/lib/trendyol-order-ingest';
import { syncTrendyolFinance } from '@/lib/trendyol-finance';
import {
  getTrendyolAutoSyncIntervalMinutes,
  isTrendyolAutoSyncEnabled,
  shouldSkipTrendyolOrderPoll,
} from '@/lib/trendyol-sync-guard';
import { resolveSettingDocument } from '@/lib/erp-settings';
import { formatTrendyolAxiosError, getTrendyolSettings } from '@/lib/trendyol';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';
import { listActiveTenantIds } from '@/lib/tenant';

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

/** Vercel Cron — tüm aktif kuruluşlar için Trendyol sipariş + finans senkronu */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const tenantIds = await listActiveTenantIds();
    const results: Array<Record<string, unknown>> = [];

    for (const tenantId of tenantIds) {
      const mod = await assertIntegrationModuleEnabled('trendyolSeller', tenantId);
      if (!mod.ok) {
        results.push({ tenantId, skipped: true, reason: mod.error });
        continue;
      }

      if (!(await isTrendyolAutoSyncEnabled(tenantId))) {
        results.push({ tenantId, skipped: true, reason: 'trendyolAutoSyncEnabled=false' });
        continue;
      }

      try {
        await getTrendyolSettings(tenantId);
      } catch {
        results.push({ tenantId, skipped: true, reason: 'Trendyol API ayarları eksik' });
        continue;
      }

      const doc = await resolveSettingDocument(tenantId);
      const intervalMin = await getTrendyolAutoSyncIntervalMinutes(tenantId);
      const lastRun = doc.get('trendyolLastAutoSyncAt') as Date | undefined;
      if (lastRun) {
        const elapsed = Date.now() - new Date(lastRun).getTime();
        if (elapsed < intervalMin * 60_000 - 5000) {
          results.push({
            tenantId,
            skipped: true,
            reason: 'interval_not_elapsed',
            intervalMinutes: intervalMin,
          });
          continue;
        }
      }

      if (await shouldSkipTrendyolOrderPoll(tenantId)) {
        results.push({ tenantId, skipped: true, reason: 'webhook_coalesce' });
        continue;
      }

      const orders = await runTrendyolOrderSync({ tenantId });
      doc.set('trendyolLastAutoSyncAt', new Date());
      await doc.save();

      let finance: { upserted?: number } | null = null;
      try {
        finance = await syncTrendyolFinance({ daysBack: 7, tenantId });
      } catch (e: unknown) {
        console.warn(`[Cron ${tenantId}] Finans sync:`, formatTrendyolAxiosError(e));
      }

      results.push({ tenantId, success: true, orders, finance });
    }

    return NextResponse.json({
      success: true,
      tenants: results.length,
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Cron hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
