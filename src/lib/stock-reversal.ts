import Order from '@/models/Order';
import {
  adjustProductStock,
  findProductBySkuOrBarcode,
  orderHasStockDeductions,
  orderLineStockAlreadyRestored,
  resolveVariantMatch,
} from '@/lib/inventory';
import { logActivity } from '@/lib/activity-log';
import { pushStockAfterOrder } from '@/lib/channel-sync';
import { hasOrderStockReserve, restoreOrderStockReserve } from '@/lib/stock-reservation';
import { resolveOrderWarehouseId } from '@/lib/order-warehouse';
import { orderByNumber } from '@/lib/tenant-query';

async function orderStockFullyRestored(
  orderNumber: string,
  tenantId?: string
): Promise<boolean> {
  const ref = String(orderNumber ?? '').trim();
  if (!ref) return false;
  const order = await Order.findOne(orderByNumber(tenantId, ref)).lean();
  if (!order?.items?.length) return false;

  for (const line of order.items) {
    const restored = await orderLineStockAlreadyRestored({
      reference: ref,
      sku: line.sku,
      barcode: line.barcode,
      productName: line.productName,
      tenantId: order.tenantId,
    });
    if (!restored) return false;
  }
  return true;
}

/** İptal / iade siparişinde stok geri yükle (satır bazlı idempotent). */
export async function restoreOrderStockIfApplied(
  orderNumber: string,
  tenantId?: string
): Promise<number> {
  const ref = String(orderNumber ?? '').trim();
  if (!ref) return 0;

  const order = await Order.findOne(orderByNumber(tenantId, ref)).lean();
  if (!order) return 0;

  const orderTenantId = order.tenantId ?? tenantId;

  if (order.stockReserved || (await hasOrderStockReserve(ref))) {
    const restored = await restoreOrderStockReserve(ref, orderTenantId);
    if (restored > 0) {
      await logActivity({
        action: 'stock_restore',
        module: 'orders',
        detail: `${ref}: ${restored} adet rezerv stok geri yüklendi`,
      });
    }
    return restored;
  }

  const hadDeduction =
    Boolean(order.stockApplied) || (await orderHasStockDeductions(ref));
  if (!hadDeduction) return 0;

  if (await orderStockFullyRestored(ref, orderTenantId)) {
    await Order.updateOne(orderByNumber(orderTenantId, ref), {
      $set: { stockApplied: false },
    });
    return 0;
  }

  let restored = 0;
  const missed: string[] = [];
  const touched = new Set<string>();
  const warehouseId = await resolveOrderWarehouseId({
    warehouseId: order.warehouseId,
    orderNumber: ref,
    tenantId: order.tenantId,
  });

  for (const line of order.items ?? []) {
    const already = await orderLineStockAlreadyRestored({
      reference: ref,
      sku: line.sku,
      barcode: line.barcode,
      productName: line.productName,
      tenantId: orderTenantId,
    });
    if (already) continue;

    const raw = await findProductBySkuOrBarcode(line.sku, line.barcode, orderTenantId);
    if (!raw) {
      missed.push(String(line.sku || line.barcode || 'satır'));
      continue;
    }
    const match = resolveVariantMatch(raw, line.sku, line.barcode, line.productName);
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const updated = await adjustProductStock({
      match,
      delta: qty,
      reason: 'return',
      reference: `${ref}:restore`,
      sku: line.sku,
      barcode: line.barcode,
      productName: line.productName,
      warehouseId,
    });
    restored += qty;
    const pid = String(updated._id);
    if (!touched.has(pid)) {
      touched.add(pid);
      await pushStockAfterOrder(
        updated as Parameters<typeof pushStockAfterOrder>[0],
        String(order.platform ?? 'trendyol')
      );
    }
  }

  if (restored > 0 || (await orderStockFullyRestored(ref, orderTenantId))) {
    await Order.updateOne(orderByNumber(orderTenantId, ref), {
      $set: { stockApplied: false, trendyolIadeIslendi: true },
    });
    if (restored > 0) {
      await logActivity({
        action: 'stock_restore',
        module: 'orders',
        detail: `${ref}: ${restored} adet stok iade edildi${missed.length ? ` (${missed.length} eşleşmeyen kalem)` : ''}`,
      });
    }
  }

  return restored;
}

/** İptal — durum güncelle + stok geri yükle */
export async function processTrendyolOrderCancel(
  orderNumber: string,
  tenantId?: string
): Promise<{ restored: number; statusUpdated: boolean }> {
  const ref = String(orderNumber ?? '').trim();
  if (!ref) return { restored: 0, statusUpdated: false };

  const restored = await restoreOrderStockIfApplied(ref, tenantId);
  const upd = await Order.updateOne(
    { ...orderByNumber(tenantId, ref), status: { $nin: ['İptal Edildi'] } },
    { $set: { status: 'İptal Edildi' } }
  );
  return { restored, statusUpdated: (upd.modifiedCount ?? 0) > 0 };
}

/** İade — durum güncelle + stok geri yükle */
export async function processTrendyolOrderReturn(
  orderNumber: string,
  tenantId?: string
): Promise<{ restored: number; statusUpdated: boolean }> {
  const ref = String(orderNumber ?? '').trim();
  if (!ref) return { restored: 0, statusUpdated: false };

  const restored = await restoreOrderStockIfApplied(ref, tenantId);
  const upd = await Order.updateOne(
    {
      ...orderByNumber(tenantId, ref),
      status: { $nin: ['İade Edildi', 'İptal Edildi'] },
    },
    { $set: { status: 'İade Edildi' } }
  );
  return { restored, statusUpdated: (upd.modifiedCount ?? 0) > 0 };
}
