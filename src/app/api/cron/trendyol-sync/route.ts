import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { runTrendyolOrderSync } from '@/lib/trendyol-order-ingest';
import { syncTrendyolFinance } from '@/lib/trendyol-finance';
import {
  getTrendyolAutoSyncIntervalMinutes,
  isTrendyolAutoSyncEnabled,
  shouldSkipTrendyolOrderPoll,
} from '@/lib/trendyol-sync-guard';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import { formatTrendyolAxiosError, getTrendyolSettings } from '@/lib/trendyol';

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

/** Vercel Cron — sunucu tarafı Trendyol sipariş + finans senkronu */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    if (!(await isTrendyolAutoSyncEnabled())) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'trendyolAutoSyncEnabled=false',
      });
    }

    try {
      await getTrendyolSettings();
    } catch {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Trendyol API ayarları eksik',
      });
    }

    const doc = await resolveSingletonSettingDocument();
    const intervalMin = await getTrendyolAutoSyncIntervalMinutes();
    const lastRun = doc.get('trendyolLastAutoSyncAt') as Date | undefined;
    if (lastRun) {
      const elapsed = Date.now() - new Date(lastRun).getTime();
      if (elapsed < intervalMin * 60_000 - 5000) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: 'interval_not_elapsed',
          intervalMinutes: intervalMin,
        });
      }
    }

    if (await shouldSkipTrendyolOrderPoll()) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'webhook_coalesce',
      });
    }

    const orders = await runTrendyolOrderSync();
    doc.set('trendyolLastAutoSyncAt', new Date());
    await doc.save();

    let finance: { upserted?: number } | null = null;
    try {
      finance = await syncTrendyolFinance({ daysBack: 7 });
    } catch (e: unknown) {
      console.warn('[Cron] Finans sync:', formatTrendyolAxiosError(e));
    }

    return NextResponse.json({
      success: true,
      orders,
      finance,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Cron hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
