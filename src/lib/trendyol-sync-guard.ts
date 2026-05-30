import { resolveSettingDocument } from '@/lib/erp-settings';

const MS_MINUTE = 60_000;
const DEFAULT_COALESCE_MS = 3 * MS_MINUTE;

/** Webhook sonrası poll atlaması — referans trendyolScheduler coalesce */
export async function shouldSkipTrendyolOrderPoll(tenantId?: string): Promise<boolean> {
  const doc = await resolveSettingDocument(tenantId);
  const coalesce = doc.get('trendyolWebhookCoalesceOrders');
  if (coalesce === false) return false;

  const last = doc.get('trendyolLastWebhookAt') as Date | undefined;
  if (!last) return false;

  const ms = Number(doc.get('trendyolWebhookCoalesceSeconds') ?? 180) * 1000;
  const windowMs = Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_COALESCE_MS;
  return Date.now() - new Date(last).getTime() < windowMs;
}

export async function markTrendyolWebhookReceived(tenantId?: string): Promise<void> {
  const doc = await resolveSettingDocument(tenantId);
  doc.set('trendyolLastWebhookAt', new Date());
  await doc.save();
}

export async function isTrendyolAutoSyncEnabled(tenantId?: string): Promise<boolean> {
  const doc = await resolveSettingDocument(tenantId);
  return doc.get('trendyolAutoSyncEnabled') !== false;
}

export async function getTrendyolAutoSyncIntervalMinutes(tenantId?: string): Promise<number> {
  const doc = await resolveSettingDocument(tenantId);
  const n = Number(doc.get('trendyolAutoSyncIntervalMinutes') ?? 2);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 60) : 2;
}
