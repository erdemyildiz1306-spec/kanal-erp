import axios from 'axios';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { resolveCommonLabelQueryId } from '@/lib/trendyol-package-coalesce';
import { getTrendyolSettings, getTrendyolAuthHeader } from '@/lib/trendyol';
import { TrendyolEndpoints } from '@/lib/trendyol-endpoints';
import { processOrderForFulfillment } from '@/lib/order-stock';

export async function fetchTrendyolCommonLabel(
  orderId: string,
  opts?: { userId?: string; userName?: string; runFulfillment?: boolean }
): Promise<{
  format: string;
  pdfUrl?: string | null;
  zpl?: string | null;
  raw?: string;
  labelFlow?: { stockApplied: boolean; trendyolSynced: boolean };
}> {
  await connectToDatabase();
  const order = await Order.findById(orderId).lean();
  if (!order || order.platform !== 'trendyol') {
    throw new Error('Trendyol siparişi bulunamadı');
  }

  if (opts?.runFulfillment !== false && order.status === 'Beklemede') {
    const flow = await processOrderForFulfillment(
      order as Parameters<typeof processOrderForFulfillment>[0],
      { userId: opts?.userId, userName: opts?.userName }
    );
    if (!flow.success) {
      throw new Error(flow.error || 'Sipariş işleme alınamadı');
    }
  }

  const fresh = await Order.findById(orderId).lean();
  const meta = (fresh?.trendyolMeta ?? {}) as Record<string, unknown>;
  const qid = resolveCommonLabelQueryId(fresh?.trackingNumber, meta);
  if (!qid.ok) throw new Error(qid.error);

  const settings = await getTrendyolSettings();
  const headers = getTrendyolAuthHeader(
    settings.apiKey,
    settings.apiSecret,
    settings.sellerId
  );

  const { data } = await axios.get(
    TrendyolEndpoints.commonLabelQuery(settings.sellerId),
    { headers, params: { id: qid.id }, timeout: 90_000 }
  );

  const first = (data as { data?: Array<{ format?: string; label?: string }> })?.data?.[0];
  const labelPayload = first?.label;
  const format = first?.format || 'PDF';
  if (!labelPayload) throw new Error('Trendyol etiket yanıtında PDF/ZPL bulunamadı');

  const labelFlow =
    opts?.runFulfillment !== false
      ? {
          stockApplied: Boolean(fresh?.stockApplied),
          trendyolSynced: fresh?.status === 'Hazırlanıyor' || fresh?.status === 'Beklemede',
        }
      : undefined;

  if (format === 'PDF' && /^https?:\/\//i.test(labelPayload)) {
    return { format: 'PDF', pdfUrl: labelPayload, labelFlow };
  }
  return {
    format,
    pdfUrl: format === 'PDF' ? labelPayload : null,
    zpl: format === 'ZPL' ? labelPayload : null,
    raw: labelPayload,
    labelFlow,
  };
}
