import Order from '@/models/Order';
import {
  decrementForOrderItemIfNotApplied,
  orderHasStockDeductions,
} from '@/lib/inventory';
import { pushStockAfterOrder } from '@/lib/channel-sync';
import {
  getTrendyolSettings,
  updateTrendyolPackageStatus,
  formatTrendyolAxiosError,
} from '@/lib/trendyol';

/** Stok düşümü bu durumlarda yapılır (Trendyol: etiket / işleme alındı sonrası). */
export const STOCK_DEDUCT_STATUSES = new Set([
  'Beklemede',
  'Hazırlanıyor',
  'Kargolandı',
  'Teslim Edildi',
]);

export type TrendyolStockDeductAt = 'pending' | 'processing' | 'shipped';

export function statusesForStockDeductAt(
  stockDeductAt: string = 'processing'
): Set<string> {
  switch (stockDeductAt as TrendyolStockDeductAt) {
    case 'pending':
      return new Set(['Beklemede', 'Hazırlanıyor', 'Kargolandı', 'Teslim Edildi']);
    case 'shipped':
      return new Set(['Kargolandı', 'Teslim Edildi']);
    case 'processing':
    default:
      return new Set(['Hazırlanıyor', 'Kargolandı', 'Teslim Edildi']);
  }
}

export function statusRequiresStockDeduction(
  status: string,
  stockDeductAt: string = 'processing'
): boolean {
  return statusesForStockDeductAt(stockDeductAt).has(status);
}

type OrderLike = {
  orderNumber: string;
  platform?: string;
  status?: string;
  stockApplied?: boolean;
  packageId?: string;
  items?: Array<{
    sku?: string;
    barcode?: string;
    productName?: string;
    quantity?: number;
    lineId?: string;
  }>;
};

export async function applyOrderStockDeduction(
  order: OrderLike,
  opts?: { userId?: string; userName?: string }
): Promise<{ applied: boolean; adjustedLines: number }> {
  const orderNumber = String(order.orderNumber ?? '');
  if (!orderNumber) return { applied: false, adjustedLines: 0 };

  const already =
    Boolean(order.stockApplied) ||
    (await orderHasStockDeductions(orderNumber));
  if (already) return { applied: false, adjustedLines: 0 };

  const items = order.items ?? [];
  if (items.length === 0) return { applied: false, adjustedLines: 0 };

  const touched = new Set<string>();
  let adjustedLines = 0;

  for (const line of items) {
    const { product: updated, skipped } = await decrementForOrderItemIfNotApplied({
      sku: line.sku,
      barcode: line.barcode,
      productName: line.productName,
      quantity: Number(line.quantity) || 1,
      reason: 'order',
      reference: orderNumber,
      userId: opts?.userId,
      userName: opts?.userName,
    });
    if (!skipped) adjustedLines++;
    if (updated && !touched.has(String(updated._id))) {
      touched.add(String(updated._id));
      await pushStockAfterOrder(
        updated as Parameters<typeof pushStockAfterOrder>[0],
        String(order.platform ?? 'retail')
      );
    }
  }

  if (adjustedLines > 0) {
    await Order.updateOne({ orderNumber }, { $set: { stockApplied: true } });
  }
  return { applied: adjustedLines > 0, adjustedLines };
}

/** Trendyol satıcı panelinde «İşleme alındı» (Picking) bildirimi. */
export async function notifyTrendyolOrderPicking(order: OrderLike): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
}> {
  if (order.platform !== 'trendyol') {
    return { ok: true, skipped: true };
  }

  const packageId = String(order.packageId ?? '').trim();
  if (!packageId) {
    return { ok: false, error: 'Trendyol paket ID eksik; önce siparişi senkronize edin.' };
  }

  const lines = (order.items ?? [])
    .map((item) => ({
      lineId: Number(item.lineId),
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
    }))
    .filter((l) => Number.isFinite(l.lineId) && l.lineId > 0);

  if (lines.length === 0) {
    return {
      ok: false,
      error:
        'Trendyol satır ID (lineId) eksik. «Trendyol\'dan Çek» ile siparişi yenileyin.',
    };
  }

  try {
    const settings = await getTrendyolSettings();
    await updateTrendyolPackageStatus({
      sellerId: settings.sellerId,
      apiKey: settings.apiKey,
      apiSecret: settings.apiSecret,
      packageId,
      status: 'Picking',
      lines,
    });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: formatTrendyolAxiosError(err) };
  }
}

/** Etiket / işleme al: Hazırlanıyor + stok + Trendyol Picking. */
export async function processOrderForFulfillment(
  order: OrderLike,
  opts?: { userId?: string; userName?: string }
): Promise<{
  success: boolean;
  stockApplied: boolean;
  trendyolSynced: boolean;
  error?: string;
  warning?: string;
}> {
  const prevStatus = String(order.status ?? '');

  if (prevStatus === 'Hazırlanıyor' && order.stockApplied) {
    return { success: true, stockApplied: true, trendyolSynced: true };
  }

  if (order.platform === 'trendyol' && prevStatus === 'Beklemede') {
    const ty = await notifyTrendyolOrderPicking(order);
    if (!ty.ok && !ty.skipped) {
      return {
        success: false,
        stockApplied: false,
        trendyolSynced: false,
        error: ty.error,
      };
    }
  }

  const stock = await applyOrderStockDeduction(order, opts);
  const stockApplied = stock.applied || Boolean(order.stockApplied);

  await Order.updateOne(
    { orderNumber: order.orderNumber },
    { $set: { status: 'Hazırlanıyor', stockApplied } }
  );

  return {
    success: true,
    stockApplied,
    trendyolSynced: order.platform === 'trendyol' ? prevStatus === 'Beklemede' || prevStatus === 'Hazırlanıyor' : false,
  };
}
