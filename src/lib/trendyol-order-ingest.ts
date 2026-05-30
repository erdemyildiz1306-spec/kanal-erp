import Order from '@/models/Order';
import { findProductBySkuOrBarcode, orderHasStockDeductions } from '@/lib/inventory';
import {
  applyOrderStockDeduction,
  shouldAttemptTrendyolStockDeduction,
} from '@/lib/order-stock';
import {
  applyOrderStockReserve,
  finalizeOrderStockReserve,
  hasOrderStockReserve,
  isStatusBelowStockThreshold,
  restoreOrderStockReserve,
} from '@/lib/stock-reservation';
import { restoreOrderStockIfApplied } from '@/lib/stock-reversal';
import { notifyTrendyolOrderInserted } from '@/lib/order-notify';
import {
  fetchTrendyolOrdersPaginated,
  getTrendyolSettings,
  formatTrendyolAxiosError,
} from '@/lib/trendyol';
import { syncTrendyolAcceptedClaims } from '@/lib/trendyol-claims';
import {
  coalesceTrendyolPackageFields,
  parseTrendyolWebhookPackages,
  resolveTrendyolPackageStatusFromPayload,
  resolveTrendyolCargoTrackingFromPackage,
  trendyolPackageSellerIdFromPayload,
  tyScalarToString,
  extractTrendyolPackageMeta,
} from '@/lib/trendyol-package-coalesce';
import { resolveSettingDocument } from '@/lib/erp-settings';
import { DEFAULT_TENANT_ID } from '@/lib/tenant';
import { orderByNumber } from '@/lib/tenant-query';

async function resolveTrendyolWarehouseId(tenantId?: string): Promise<string> {
  const doc = await resolveSettingDocument(tenantId);
  return String(doc.get('trendyolDefaultWarehouseId') ?? 'main').trim() || 'main';
}

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
  rawItem: Record<string, unknown>,
  _sellerId: string,
  opts?: { viaWebhook?: boolean; tenantId?: string }
): Promise<{ orderNumber: string; status: string; stockApplied: boolean; isNew: boolean }> {
  const tenantId = opts?.tenantId?.trim() || DEFAULT_TENANT_ID;
  const item = coalesceTrendyolPackageFields(rawItem);
  const orderNumber = tyScalarToString(item.orderNumber);
  const tyStatus = resolveTrendyolPackageStatusFromPayload(item);
  const mappedStatus = mapTrendyolPackageStatus(tyStatus);
  const existing = await Order.findOne({ tenantId, orderNumber }).lean();
  const prevStatus = String(existing?.status ?? '');
  const isNew = !existing;
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
    const barcode = tyScalarToString(line.barcode);
    const match = await findProductBySkuOrBarcode(sku, barcode, tenantId);
    const product = match?.product as { costPrice?: number } | undefined;
    const price = Number(line.price ?? line.lineUnitPrice) || 0;
    const qty = Number(line.quantity) || 1;
    const itemCost = product ? (product.costPrice || 0) : price * 0.4;
    orderItems.push({
      productName: String(line.productName ?? 'Ürün'),
      sku,
      barcode,
      lineId: line.lineId != null ? tyScalarToString(line.lineId) : '',
      quantity: qty,
      unitPrice: price,
      totalPrice: Number(line.amount ?? line.lineGrossAmount) || price * qty,
      costPrice: itemCost,
    });
    costAmount += itemCost * qty;
  }

  const totalAmount = Number(item.totalPrice ?? item.packageTotalPrice) || 0;
  const packageId = tyScalarToString(item.id ?? item.shipmentPackageId);
  const trendyolMeta = extractTrendyolPackageMeta(item);
  const warehouseId = await resolveTrendyolWarehouseId(tenantId);

  const updated = await Order.findOneAndUpdate(
    { tenantId, orderNumber },
    {
      $set: {
        tenantId,
        platform: 'trendyol',
        status: mappedStatus,
        customerName,
        customerAddress,
        totalAmount,
        costAmount,
        profitAmount: totalAmount - costAmount,
        items: orderItems,
        warehouseId,
        cargoCompany: String(item.cargoProviderName ?? ''),
        trackingNumber:
          resolveTrendyolCargoTrackingFromPackage(item) ||
          tyScalarToString(item.cargoTrackingNumber),
        packageId,
        platformOrderId: packageId,
        trendyolMeta,
        cargoLabelUrl: '',
      },
    },
    { upsert: true, new: true }
  );

  let stockApplied = alreadyDeducted;
  const settings = await getTrendyolSettings(tenantId);
  const hasReserve = await hasOrderStockReserve(orderNumber);
  const orderLike = {
    orderNumber,
    platform: 'trendyol' as const,
    items: orderItems,
    warehouseId,
    tenantId,
  };

  if (
    (mappedStatus === 'İptal Edildi' || mappedStatus === 'İade Edildi') &&
    !Boolean(existing?.trendyolIadeIslendi)
  ) {
    if (hasReserve && !alreadyDeducted) {
      await restoreOrderStockReserve(orderNumber, tenantId);
      stockApplied = false;
    } else if (alreadyDeducted) {
      const restored = await restoreOrderStockIfApplied(orderNumber, tenantId);
      stockApplied = restored > 0 ? false : alreadyDeducted;
    }
    if (mappedStatus !== prevStatus || stockApplied !== alreadyDeducted) {
      await Order.updateOne(orderByNumber(tenantId, orderNumber), {
        $set: { trendyolIadeIslendi: true },
      });
    }
  } else if (
    isStatusBelowStockThreshold(mappedStatus, settings.stockDeductAt) &&
    mappedStatus !== 'İptal Edildi' &&
    mappedStatus !== 'İade Edildi' &&
    !hasReserve &&
    !alreadyDeducted
  ) {
    await applyOrderStockReserve(orderLike);
    stockApplied = false;
  } else if (
    shouldAttemptTrendyolStockDeduction(prevStatus, mappedStatus, settings.stockDeductAt) &&
    mappedStatus !== 'İptal Edildi' &&
    mappedStatus !== 'İade Edildi' &&
    !alreadyDeducted
  ) {
    if (hasReserve) {
      const ok = await finalizeOrderStockReserve(orderNumber, tenantId);
      stockApplied = ok || alreadyDeducted;
    } else {
      const r = await applyOrderStockDeduction(orderLike);
      stockApplied = r.applied || alreadyDeducted;
    }
  }

  if (isNew && updated?._id) {
    await notifyTrendyolOrderInserted(String(updated._id), item, {
      viaWebhook: Boolean(opts?.viaWebhook),
      tenantId,
    });
  }

  return { orderNumber, status: mappedStatus, stockApplied, isNew };
}

export async function ingestTrendyolWebhookBody(
  body: unknown,
  opts?: { expectedSellerId?: string; tenantId?: string }
): Promise<{ count: number; rejectedSeller?: boolean }> {
  const tenantId = opts?.tenantId?.trim() || DEFAULT_TENANT_ID;
  const settings = await getTrendyolSettings(tenantId);
  const packages = parseTrendyolWebhookPackages(body).map(coalesceTrendyolPackageFields);

  let n = 0;
  let rejectedSeller = false;

  for (const pkg of packages) {
    const payloadSeller = trendyolPackageSellerIdFromPayload(pkg);
    if (
      opts?.expectedSellerId &&
      payloadSeller &&
      payloadSeller !== opts.expectedSellerId
    ) {
      rejectedSeller = true;
      continue;
    }

    if (pkg.orderNumber || pkg.id || pkg.shipmentPackageId) {
      await upsertTrendyolOrderPackage(pkg, settings.sellerId, {
        viaWebhook: true,
        tenantId,
      });
      n++;
    }
  }
  return { count: n, rejectedSeller };
}

const TERMINAL_TY_STATUSES = ['Cancelled', 'Returned', 'UnSupplied', 'UnDelivered'] as const;
const MAX_MAIN_PAGES = 100;

async function fetchAllMainTrendyolOrders(
  sellerId: string,
  apiKey: string,
  apiSecret: string
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages && page < MAX_MAIN_PAGES) {
    const res = await fetchTrendyolOrdersPaginated(sellerId, apiKey, apiSecret, {
      page,
      size: 200,
    });
    totalPages = Math.max(1, Number(res.totalPages) || 1);
    const list = res.content ?? [];
    all.push(...list);
    page++;
    if (list.length === 0) break;
  }
  return all;
}

async function syncTerminalTrendyolPackages(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  tenantId?: string,
  daysBack = 30
): Promise<{ synced: number }> {
  const startDate = Date.now() - daysBack * 86_400_000;
  let synced = 0;

  for (const status of TERMINAL_TY_STATUSES) {
    let page = 0;
    let totalPages = 1;
    while (page < totalPages && page < 20) {
      const res = await fetchTrendyolOrdersPaginated(sellerId, apiKey, apiSecret, {
        status,
        startDate,
        page,
        size: 200,
      });
      totalPages = Math.max(1, Number(res.totalPages) || 1);
      const list = res.content ?? [];
      for (const item of list) {
        await upsertTrendyolOrderPackage(item, sellerId, { tenantId });
        synced++;
      }
      page++;
      if (list.length === 0) break;
    }
  }

  return { synced };
}

/** Tam Trendyol sipariş senkronu — ana liste (paginated) + terminal + claims */
export async function runTrendyolOrderSync(opts?: {
  preloadedOrders?: Array<Record<string, unknown>>;
  skipTerminal?: boolean;
  skipClaims?: boolean;
  tenantId?: string;
}): Promise<{
  syncedCount: number;
  stockAdjusted: number;
  stockRestored: number;
  claimsReturned: number;
  terminalSynced: number;
  pagesFetched: number;
}> {
  const tenantId = opts?.tenantId?.trim() || DEFAULT_TENANT_ID;
  const settings = await getTrendyolSettings(tenantId);
  let ordersList = opts?.preloadedOrders ?? [];
  let pagesFetched = opts?.preloadedOrders ? 1 : 0;

  if (!ordersList.length) {
    ordersList = await fetchAllMainTrendyolOrders(
      settings.sellerId,
      settings.apiKey,
      settings.apiSecret
    );
    pagesFetched = Math.ceil(ordersList.length / 200) || 1;
  }

  let syncedCount = 0;
  let stockAdjusted = 0;
  let stockRestored = 0;

  for (const item of ordersList) {
    const before = await Order.findOne({
      tenantId,
      orderNumber: String(item.orderNumber ?? ''),
    })
      .select('stockApplied')
      .lean();
    const wasDeducted = Boolean(before?.stockApplied);

    const r = await upsertTrendyolOrderPackage(item, settings.sellerId, { tenantId });
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
        settings.apiSecret,
        tenantId
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
      const claims = await syncTrendyolAcceptedClaims({ daysBack: 30, tenantId });
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
    pagesFetched,
  };
}
