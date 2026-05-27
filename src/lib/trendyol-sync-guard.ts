import { resolveSingletonSettingDocument } from '@/lib/erp-settings';

const MS_MINUTE = 60_000;
const DEFAULT_COALESCE_MS = 3 * MS_MINUTE;

/** Webhook sonrası poll atlaması — referans trendyolScheduler coalesce */
export async function shouldSkipTrendyolOrderPoll(): Promise<boolean> {
  const doc = await resolveSingletonSettingDocument();
  const coalesce = doc.get('trendyolWebhookCoalesceOrders');
  if (coalesce === false) return false;

  const last = doc.get('trendyolLastWebhookAt') as Date | undefined;
  if (!last) return false;

  const ms = Number(doc.get('trendyolWebhookCoalesceSeconds') ?? 180) * 1000;
  const windowMs = Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_COALESCE_MS;
  return Date.now() - new Date(last).getTime() < windowMs;
}

export async function markTrendyolWebhookReceived(): Promise<void> {
  const doc = await resolveSingletonSettingDocument();
  doc.set('trendyolLastWebhookAt', new Date());
  await doc.save();
}

export async function isTrendyolAutoSyncEnabled(): Promise<boolean> {
  const doc = await resolveSingletonSettingDocument();
  return doc.get('trendyolAutoSyncEnabled') !== false;
}

export async function getTrendyolAutoSyncIntervalMinutes(): Promise<number> {
  const doc = await resolveSingletonSettingDocument();
  const n = Number(doc.get('trendyolAutoSyncIntervalMinutes') ?? 2);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 60) : 2;
}
