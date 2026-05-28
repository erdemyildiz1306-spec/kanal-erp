import axios from 'axios';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import {
  coalesceTrendyolPackageFields,
  extractTrendyolPackageMeta,
  resolveCommonLabelQueryId,
  tyScalarToString,
} from '@/lib/trendyol-package-coalesce';
import {
  getTrendyolSettings,
  getTrendyolAuthHeader,
  fetchTrendyolShipmentPackages,
  formatTrendyolAxiosError,
} from '@/lib/trendyol';
import { TrendyolEndpoints } from '@/lib/trendyol-endpoints';
import { processOrderForFulfillment } from '@/lib/order-stock';

async function refreshTrendyolOrderCargoFields(orderId: string): Promise<void> {
  const order = await Order.findById(orderId).lean();
  if (!order || order.platform !== 'trendyol') return;

  const settings = await getTrendyolSettings();
  let packages: Array<Record<string, unknown>> = [];

  try {
    packages = await fetchTrendyolShipmentPackages(
      settings.sellerId,
      settings.apiKey,
      settings.apiSecret,
      {
        orderNumber: String(order.orderNumber ?? ''),
        shipmentPackageIds: order.packageId ? [String(order.packageId)] : undefined,
        size: 10,
      }
    );
  } catch {
    /* TY yanıt vermezse mevcut alanlarla devam */
    return;
  }

  if (!packages.length) return;

  const orderNo = String(order.orderNumber ?? '').trim();
  const pkgId = String(order.packageId ?? '').trim();
  const match =
    packages.find((p) => tyScalarToString(p.orderNumber) === orderNo) ??
    packages.find(
      (p) => tyScalarToString(p.id ?? p.shipmentPackageId) === pkgId
    ) ??
    packages[0];

  const coalesced = coalesceTrendyolPackageFields(match);
  const meta = extractTrendyolPackageMeta(coalesced);
  const tracking = tyScalarToString(coalesced.cargoTrackingNumber);
  const newPackageId = tyScalarToString(coalesced.shipmentPackageId ?? coalesced.id);

  await Order.updateOne(
    { _id: orderId },
    {
      $set: {
        ...(tracking ? { trackingNumber: tracking } : {}),
        ...(newPackageId ? { packageId: newPackageId, platformOrderId: newPackageId } : {}),
        trendyolMeta: meta,
        cargoCompany: String(coalesced.cargoProviderName ?? order.cargoCompany ?? ''),
      },
    }
  );
}

async function requestCommonLabelFromTrendyol(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  queryId: string
) {
  const headers = getTrendyolAuthHeader(apiKey, apiSecret, sellerId);
  const { data } = await axios.get(TrendyolEndpoints.commonLabelQuery(sellerId), {
    headers,
    params: { id: queryId },
    timeout: 90_000,
  });
  return data as { data?: Array<{ format?: string; label?: string }> };
}

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

  await refreshTrendyolOrderCargoFields(orderId);

  let fresh = await Order.findById(orderId).lean();
  let meta = (fresh?.trendyolMeta ?? {}) as Record<string, unknown>;
  let qid = resolveCommonLabelQueryId(fresh?.trackingNumber, meta);
  if (!qid.ok) {
    throw new Error(qid.error);
  }

  const settings = await getTrendyolSettings();

  let data: { data?: Array<{ format?: string; label?: string }> };
  try {
    data = await requestCommonLabelFromTrendyol(
      settings.sellerId,
      settings.apiKey,
      settings.apiSecret,
      qid.id
    );
  } catch (firstErr: unknown) {
    const msg = formatTrendyolAxiosError(firstErr).toLocaleLowerCase('tr-TR');
    const retryable =
      msg.includes('cargotracking') ||
      msg.includes('kargo') ||
      msg.includes('400') ||
      msg.includes('takip');

    if (!retryable) {
      throw new Error(formatTrendyolAxiosError(firstErr));
    }

    await new Promise((r) => setTimeout(r, 1500));
    await refreshTrendyolOrderCargoFields(orderId);
    fresh = await Order.findById(orderId).lean();
    meta = (fresh?.trendyolMeta ?? {}) as Record<string, unknown>;
    qid = resolveCommonLabelQueryId(fresh?.trackingNumber, meta);
    if (!qid.ok) {
      throw new Error(
        `${qid.error} (Trendyol işleme alındıktan sonra birkaç dakika bekleyip «Trendyol'dan Çek» ile yenileyin.)`
      );
    }

    try {
      data = await requestCommonLabelFromTrendyol(
        settings.sellerId,
        settings.apiKey,
        settings.apiSecret,
        qid.id
      );
    } catch (secondErr: unknown) {
      throw new Error(
        `${formatTrendyolAxiosError(secondErr)} — Sayısal cargoTrackingNumber için siparişi yeniden senkronize edin veya yerel paket çıktısı kullanın.`
      );
    }
  }

  const first = data?.data?.[0];
  const labelPayload = first?.label;
  const format = first?.format || 'PDF';
  if (!labelPayload) {
    throw new Error(
      'Trendyol etiket yanıtında PDF/ZPL bulunamadı. Paket henüz kargo sistemine düşmemiş olabilir; birkaç dakika sonra tekrar deneyin.'
    );
  }

  const labelFlow =
    opts?.runFulfillment !== false
      ? {
          stockApplied: Boolean(fresh?.stockApplied),
          trendyolSynced:
            fresh?.status === 'Hazırlanıyor' || fresh?.status === 'Beklemede',
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
