import connectToDatabase from '@/lib/mongodb';
import OrderEvent from '@/models/OrderEvent';
import { sendFcmToAllTokens } from '@/lib/fcm-send';

const recentKeys = new Map<string, number>();
const DEDUP_MS = 5 * 60 * 1000;

function shouldNotify(orderId: string, force: boolean): boolean {
  if (force) return true;
  const last = recentKeys.get(orderId);
  const now = Date.now();
  if (last && now - last < DEDUP_MS) return false;
  recentKeys.set(orderId, now);
  return true;
}

export function trendyolPackageIsRecentForNotify(pkg: Record<string, unknown>): boolean {
  const ts = pkg.packageLastModifiedDate ?? pkg.orderDate ?? pkg.lastModifiedDate;
  if (ts == null) return true;
  let ms: number;
  if (typeof ts === 'number') ms = ts < 1e12 ? ts * 1000 : ts;
  else ms = Date.parse(String(ts));
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms <= 48 * 60 * 60 * 1000;
}

export async function notifyTrendyolOrderInserted(
  orderId: string,
  pkg: Record<string, unknown>,
  opts?: { viaWebhook?: boolean }
): Promise<void> {
  const viaWebhook = Boolean(opts?.viaWebhook);
  if (!viaWebhook && !trendyolPackageIsRecentForNotify(pkg)) return;
  if (!shouldNotify(orderId, viaWebhook)) return;

  await connectToDatabase();
  const buyer =
    [pkg.customerFirstName, pkg.customerLastName].filter(Boolean).join(' ').trim() ||
    String(pkg.customerName ?? '').trim() ||
    'Müşteri';
  const orderNo = pkg.orderNumber != null ? String(pkg.orderNumber) : '';
  const title = 'Yeni Trendyol siparişi';
  const body = orderNo ? `${buyer} — #${orderNo}` : `${buyer} — yeni paket`;

  await OrderEvent.create({
    type: 'order-created',
    orderId,
    orderNumber: orderNo,
    title,
    body,
    source: viaWebhook ? 'trendyol-webhook' : 'trendyol-sync',
    url: `/orders?orderId=${encodeURIComponent(orderId)}`,
  });

  await sendFcmToAllTokens({
    title,
    body,
    data: { url: `/orders?orderId=${orderId}`, orderId, orderNumber: orderNo },
  }).catch(() => undefined);
}
