import Order from '@/models/Order';
import { findProductBySkuOrBarcode, orderHasStockDeductions } from '@/lib/inventory';
import { applyOrderStockDeduction, statusRequiresStockDeduction } from '@/lib/order-stock';
import { restoreOrderStockIfApplied } from '@/lib/stock-reversal';
import {
  fetchTrendyolOrdersPaginated,
  getTrendyolSettings,
  formatTrendyolAxiosError,
} from '@/lib/trendyol';
import { syncTrendyolAcceptedClaims } from '@/lib/trendyol-claims';

export function mapTrendyolPackageStatus(ty: string): string {
  const raw = String(ty ?? '').trim();
  const s = raw.toLowerCase();

  if (/cancel|unsupplied|iptal|un.?supplied/.test(s)) return 'İptal Edildi';
  if (/return|iade|claim.?accept|undelivered/.test(s)) return 'İade Edildi';
  if (/deliver/.test(s)) return 'Teslim Edildi';
  if (/ship/.test(s)) return 'Kargolandı';
  if (/pick|invoice|await|process|hazir/.test(s)) return 'Hazırlanıyor';
  if (/creat|new|bekle/.test(s)) return 'Beklemede';

  switch (raw) {
    case 'Created':
      return 'Beklemede';
    case 'Awaiting':
    case 'Picking':
    case 'Invoiced':
      return 'Hazırlanıyor';
    case 'Shipped':
      return 'Kargolandı';
    case 'Delivered':
      return 'Teslim Edildi';
    case 'Cancelled':
    case 'UnSupplied':
      return 'İptal Edildi';
    case 'Returned':
    case 'UnDelivered':
      return 'İade Edildi';
    default:
      return 'Beklemede';
  }
}

export async function upsertTrendyolOrderPackage(
  item: Record<string, unknown>,
  sellerId: string
): Promise<{ orderNumber: string; status: string; stockApplied: boolean }> {
  const orderNumber = String(item.orderNumber ?? '');
  const mappedStatus = mapTrendyolPackageStatus(String(item.status ?? ''));
  const existing = await Order.findOne({ orderNumber }).lean();
  const alreadyDeducted =
    Boolean((existing as { stockApplied?: boolean } | null)?.stockApplied) ||
    (existing ? await orderHasStockDeductions(orderNumber) : false);

  const addr = (item.shipmentAddress ?? {}) as Record<string, string>;
  const customerName = `${addr.firstName ?? ''} ${addr.lastName ?? ''}`.trim();
  const customerAddress = `${addr.address1 ?? ''} ${addr.address2 ?? ''} ${addr.district ?? ''} / ${addr.city ?? ''}`.trim();

  let costAmount = 0;
  const orderItems = [];
  for (const line of (item.lines as Array<Record<string, unknown>>) ?? []) {
    const sku = String(line.merchantSku ?? line.stockCode ?? line.sku ?? '');
    const barcode = String(line.barcode ?? '');
    const match = await findProductBySkuOrBarcode(sku, barcode);
    const product = match?.product as { costPrice?: number } | undefined;
    const price = Number(line.price ?? line.lineUnitPrice) || 0;
    const qty = Number(line.quantity) || 1;
    const itemCost = product ? (product.costPrice || 0) : price * 0.4;
    orderItems.push({
      productName: String(line.productName ?? 'Ürün'),
      sku,
      barcode,
      lineId: line.lineId != null ? String(line.lineId) : '',
      quantity: qty,
      unitPrice: price,
      totalPrice: Number(line.amount ?? line.lineGrossAmount) || price * qty,
      costPrice: itemCost,
    });
    costAmount += itemCost * qty;
  }

  const totalAmount = Number(item.totalPrice ?? item.packageTotalPrice) || 0;
  const packageId = String(item.id ?? item.shipmentPackageId ?? '');

  await Order.findOneAndUpdate(
    { orderNumber },
    {
      $set: {
        platform: 'trendyol',
        status: mappedStatus,
        customerName,
        customerAddress,
        totalAmount,
        costAmount,
        profitAmount: totalAmount - costAmount,
        items: orderItems,
        cargoCompany: String(item.cargoProviderName ?? ''),
        trackingNumber: String(item.cargoTrackingNumber ?? ''),
        packageId,
        platformOrderId: packageId,
        cargoLabelUrl: sellerId
          ? `https://api.trendyol.com/sapigw/suppliers/${encodeURIComponent(sellerId)}/shipment-packages/${packageId}/cargo-label`
          : '',
      },
    },
    { upsert: true, new: true }
  );

  let stockApplied = alreadyDeducted;
  const settings = await getTrendyolSettings();
  if (
    statusRequiresStockDeduction(mappedStatus, settings.stockDeductAt) &&
    mappedStatus !== 'İptal Edildi' &&
    !alreadyDeducted
  ) {
    const r = await applyOrderStockDeduction({
      orderNumber,
      platform: 'trendyol',
      items: orderItems,
    });
    stockApplied = r.applied || alreadyDeducted;
  } else if (
    (mappedStatus === 'İptal Edildi' || mappedStatus === 'İade Edildi') &&
    alreadyDeducted
  ) {
    const restored = await restoreOrderStockIfApplied(orderNumber);
    stockApplied = restored > 0 ? false : alreadyDeducted;
  }

  return { orderNumber, status: mappedStatus, stockApplied };
}

export async function ingestTrendyolWebhookBody(body: unknown): Promise<number> {
  const settings = await getTrendyolSettings();
  let packages: Array<Record<string, unknown>> = [];
  if (Array.isArray(body)) packages = body as Array<Record<string, unknown>>;
  else if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.content)) packages = o.content as Array<Record<string, unknown>>;
    else packages = [o];
  }
  let n = 0;
  for (const pkg of packages) {
    if (pkg.orderNumber || pkg.id) {
      await upsertTrendyolOrderPackage(pkg, settings.sellerId);
      n++;
    }
  }
  return n;
}

const TERMINAL_TY_STATUSES = ['Cancelled', 'Returned', 'UnSupplied', 'UnDelivered'] as const;

async function syncTerminalTrendyolPackages(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  daysBack = 30
): Promise<{ synced: number }> {
  const startDate = Date.now() - daysBack * 86_400_000;
  let synced = 0;

  for (const status of TERMINAL_TY_STATUSES) {
    let page = 0;
    let totalPages = 1;
    while (page < totalPages && page < 20) {
      const res = await fetchTrendyolOrdersPaginated(
        sellerId,
        apiKey,
        apiSecret,
        { status, startDate, page, size: 200 }
      );
      totalPages = Math.max(1, Number(res.totalPages) || 1);
      const list = res.content ?? [];
      for (const item of list) {
        await upsertTrendyolOrderPackage(item, sellerId);
        synced++;
      }
      page++;
      if (list.length === 0) break;
    }
  }

  return { synced };
}

/** Tam Trendyol sipariş senkronu — ana liste + terminal durumlar + claims */
export async function runTrendyolOrderSync(opts?: {
  preloadedOrders?: Array<Record<string, unknown>>;
  skipTerminal?: boolean;
  skipClaims?: boolean;
}): Promise<{
  syncedCount: number;
  stockAdjusted: number;
  stockRestored: number;
  claimsReturned: number;
  terminalSynced: number;
}> {
  const settings = await getTrendyolSettings();
  let ordersList = opts?.preloadedOrders ?? [];

  if (!ordersList.length) {
    const res = await fetchTrendyolOrdersPaginated(
      settings.sellerId,
      settings.apiKey,
      settings.apiSecret,
      { page: 0, size: 200 }
    );
    ordersList = res.content ?? [];
  }

  let syncedCount = 0;
  let stockAdjusted = 0;
  let stockRestored = 0;

  for (const item of ordersList) {
    const before = await Order.findOne({
      orderNumber: String(item.orderNumber ?? ''),
    })
      .select('stockApplied')
      .lean();
    const wasDeducted = Boolean(before?.stockApplied);

    const r = await upsertTrendyolOrderPackage(item, settings.sellerId);
    syncedCount++;

    if (r.stockApplied && !wasDeducted) stockAdjusted++;
    if (
      (r.status === 'İptal Edildi' || r.status === 'İade Edildi') &&
      wasDeducted &&
      !r.stockApplied
    ) {
      stockRestored++;
    }
  }

  let terminalSynced = 0;
  if (!opts?.skipTerminal) {
    try {
      const terminal = await syncTerminalTrendyolPackages(
        settings.sellerId,
        settings.apiKey,
        settings.apiSecret
      );
      terminalSynced = terminal.synced;
    } catch (e: unknown) {
      console.warn(
        '[Trendyol] Terminal durum senkronu:',
        e instanceof Error ? e.message : e
      );
    }
  }

  let claimsReturned = 0;
  if (!opts?.skipClaims) {
    try {
      const claims = await syncTrendyolAcceptedClaims({ daysBack: 30 });
      claimsReturned = claims.returned;
      stockRestored += claims.returned;
    } catch (e: unknown) {
      console.warn(
        '[Trendyol] Claims senkronu:',
        formatTrendyolAxiosError(e) || (e instanceof Error ? e.message : e)
      );
    }
  }

  return {
    syncedCount,
    stockAdjusted,
    stockRestored,
    claimsReturned,
    terminalSynced,
  };
}
