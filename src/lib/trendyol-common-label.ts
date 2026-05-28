import axios from 'axios';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import {
  coalesceTrendyolPackageFields,
  extractTrendyolPackageMeta,
  isTrendyolCommonLabelCarrier,
  resolveCommonLabelQueryId,
  resolveTrendyolCargoTrackingFromPackage,
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

type CommonLabelResponse = { data?: Array<{ format?: string; label?: string }> };

const LABEL_POLL_DELAYS_MS = [1500, 2000, 3000, 4000];

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
  const tracking =
    resolveTrendyolCargoTrackingFromPackage(coalesced) ||
    tyScalarToString(coalesced.cargoTrackingNumber);
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

function commonLabelHeaders(apiKey: string, apiSecret: string, sellerId: string) {
  return getTrendyolAuthHeader(apiKey, apiSecret, sellerId);
}

/** Trendyol: önce createCommonLabel (POST), sonra getCommonLabel (GET path). */
async function createTrendyolCommonLabel(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  cargoTrackingNumber: string
): Promise<void> {
  const headers = commonLabelHeaders(apiKey, apiSecret, sellerId);
  try {
    await axios.post(
      TrendyolEndpoints.commonLabelByTracking(sellerId, cargoTrackingNumber),
      { format: 'ZPL', boxQuantity: 1 },
      { headers, timeout: 90_000 }
    );
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : 0;
    const msg = formatTrendyolAxiosError(err).toLocaleLowerCase('tr-TR');
    if (status === 409 || msg.includes('already') || msg.includes('mevcut')) return;
    if (status === 400 && (msg.includes('not_found') || msg.includes('cargotracking'))) {
      throw err;
    }
    /* Diğer 4xx/5xx: etiket zaten oluşturulmuş olabilir — GET ile dene */
  }
}

async function getTrendyolCommonLabelByPath(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  cargoTrackingNumber: string
): Promise<CommonLabelResponse> {
  const headers = commonLabelHeaders(apiKey, apiSecret, sellerId);
  const { data } = await axios.get(
    TrendyolEndpoints.commonLabelByTracking(sellerId, cargoTrackingNumber),
    { headers, timeout: 90_000 }
  );
  return data as CommonLabelResponse;
}

async function getTrendyolCommonLabelByQuery(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  cargoTrackingNumber: string
): Promise<CommonLabelResponse> {
  const headers = commonLabelHeaders(apiKey, apiSecret, sellerId);
  const { data } = await axios.get(TrendyolEndpoints.commonLabelQuery(sellerId), {
    headers,
    params: { id: cargoTrackingNumber },
    timeout: 90_000,
  });
  return data as CommonLabelResponse;
}

function hasLabelPayload(data: CommonLabelResponse | undefined): boolean {
  return Boolean(data?.data?.[0]?.label);
}

async function fetchCommonLabelWithCreateFlow(
  orderId: string,
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  cargoTrackingNumber: string
): Promise<CommonLabelResponse> {
  await createTrendyolCommonLabel(sellerId, apiKey, apiSecret, cargoTrackingNumber);

  let lastErr: unknown;
  for (let i = 0; i <= LABEL_POLL_DELAYS_MS.length; i++) {
    try {
      const data = await getTrendyolCommonLabelByPath(
        sellerId,
        apiKey,
        apiSecret,
        cargoTrackingNumber
      );
      if (hasLabelPayload(data)) return data;
    } catch (err: unknown) {
      lastErr = err;
      const msg = formatTrendyolAxiosError(err).toLocaleLowerCase('tr-TR');
      const retryable =
        msg.includes('not_found') ||
        msg.includes('cargotracking') ||
        msg.includes('400') ||
        msg.includes('takip');
      if (!retryable) throw err;
    }

    if (i < LABEL_POLL_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, LABEL_POLL_DELAYS_MS[i]));
      if (i === 1) await refreshTrendyolOrderCargoFields(orderId);
    }
  }

  try {
    const queryData = await getTrendyolCommonLabelByQuery(
      sellerId,
      apiKey,
      apiSecret,
      cargoTrackingNumber
    );
    if (hasLabelPayload(queryData)) return queryData;
  } catch (queryErr: unknown) {
    lastErr = queryErr;
  }

  throw lastErr ?? new Error('Trendyol ortak etiket yanıtında etiket bulunamadı.');
}

function formatCommonLabelFailure(
  err: unknown,
  cargoCompany: string,
  cargoTrackingNumber: string
): string {
  const base = formatTrendyolAxiosError(err);
  const lower = base.toLocaleLowerCase('tr-TR');

  if (!isTrendyolCommonLabelCarrier(cargoCompany)) {
    return `${base} — Ortak etiket yalnızca Trendyol anlaşmalı kargo (TEX/Aras) için geçerlidir. «Paket çıktısı (PDF)» veya kargo firmanızın panelini kullanın.`;
  }

  if (lower.includes('not_found') || lower.includes('cargotracking')) {
    return `${base} — Takip no: ${cargoTrackingNumber}. Sipariş «Hazırlanıyor» (Picking) olmalı; «Trendyol'dan Çek» ile yenileyip birkaç dakika bekleyin veya «Paket çıktısı (PDF)» kullanın.`;
  }

  return `${base} — Sayısal cargoTrackingNumber için siparişi yeniden senkronize edin veya yerel paket çıktısı kullanın.`;
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

  const cargoCompany = String(fresh?.cargoCompany ?? meta.cargoProviderName ?? '');
  if (!isTrendyolCommonLabelCarrier(cargoCompany)) {
    throw new Error(
      `Ortak etiket yalnızca Trendyol anlaşmalı kargo (TEX/Aras) için kullanılabilir. Bu sipariş: «${cargoCompany || 'bilinmiyor'}». «Paket çıktısı (PDF)» veya kargo panelinizi kullanın.`
    );
  }

  const settings = await getTrendyolSettings();

  let data: CommonLabelResponse;
  try {
    data = await fetchCommonLabelWithCreateFlow(
      orderId,
      settings.sellerId,
      settings.apiKey,
      settings.apiSecret,
      qid.id
    );
  } catch (firstErr: unknown) {
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
      data = await fetchCommonLabelWithCreateFlow(
        orderId,
        settings.sellerId,
        settings.apiKey,
        settings.apiSecret,
        qid.id
      );
    } catch (secondErr: unknown) {
      throw new Error(formatCommonLabelFailure(secondErr, cargoCompany, qid.id));
    }
  }

  const first = data?.data?.[0];
  const labelPayload = first?.label;
  const format = first?.format || 'PDF';
  if (!labelPayload) {
    throw new Error(
      'Trendyol etiket yanıtında PDF/ZPL bulunamadı. Paket henüz kargo sistemine düşmemiş olabilir; birkaç dakika sonra tekrar deneyin veya «Paket çıktısı (PDF)» kullanın.'
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
