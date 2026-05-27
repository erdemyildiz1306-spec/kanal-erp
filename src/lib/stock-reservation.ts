/**
 * İki aşamalı Trendyol stok: order_reserve → order (finalize)
 * Referans: sipariş/backend/src/services/stockReservation.ts
 */

import Order from '@/models/Order';
import StockMovement from '@/models/StockMovement';
import {
  decrementForOrderItemIfNotApplied,
  orderHasStockDeductions,
} from '@/lib/inventory';
import { pushStockAfterOrder } from '@/lib/channel-sync';
import { deductThresholdRank, orderStatusRank } from '@/lib/order-stock';

export function isStatusBelowStockThreshold(
  status: string,
  stockDeductAt: string
): boolean {
  const r = orderStatusRank(status);
  if (r < 0) return false;
  return r < deductThresholdRank(stockDeductAt);
}

export async function hasOrderStockReserve(orderNumber: string): Promise<boolean> {
  const ref = String(orderNumber ?? '').trim();
  if (!ref) return false;
  const hit = await StockMovement.exists({
    reference: ref,
    reason: 'order_reserve',
    delta: { $lt: 0 },
  });
  return Boolean(hit);
}

export async function applyOrderStockReserve(
  order: {
    orderNumber: string;
    platform?: string;
    items?: Array<{
      sku?: string;
      barcode?: string;
      productName?: string;
      quantity?: number;
    }>;
  },
  opts?: { userId?: string; userName?: string }
): Promise<{ applied: boolean; adjustedLines: number }> {
  const orderNumber = String(order.orderNumber ?? '');
  if (!orderNumber) return { applied: false, adjustedLines: 0 };

  const already =
    (await hasOrderStockReserve(orderNumber)) ||
    (await orderHasStockDeductions(orderNumber));
  if (already) return { applied: false, adjustedLines: 0 };

  let adjustedLines = 0;
  const touched = new Set<string>();

  for (const line of order.items ?? []) {
    const { product: updated, skipped } = await decrementForOrderItemIfNotApplied({
      sku: line.sku,
      barcode: line.barcode,
      productName: line.productName,
      quantity: Number(line.quantity) || 1,
      reason: 'order_reserve',
      reference: orderNumber,
      userId: opts?.userId,
      userName: opts?.userName,
    });
    if (!skipped) adjustedLines++;
    if (updated && !touched.has(String(updated._id))) {
      touched.add(String(updated._id));
      await pushStockAfterOrder(
        updated as Parameters<typeof pushStockAfterOrder>[0],
        String(order.platform ?? 'trendyol')
      );
    }
  }

  if (adjustedLines > 0) {
    await Order.updateOne(
      { orderNumber },
      { $set: { stockReserved: true, stockApplied: false } }
    );
  }
  return { applied: adjustedLines > 0, adjustedLines };
}

/** Rezerv hareketlerini kesin düşüme çevir — stok miktarı değişmez */
export async function finalizeOrderStockReserve(orderNumber: string): Promise<boolean> {
  const ref = String(orderNumber ?? '').trim();
  if (!ref) return false;

  const reserveCount = await StockMovement.countDocuments({
    reference: ref,
    reason: 'order_reserve',
    delta: { $lt: 0 },
  });
  if (reserveCount === 0) return false;

  await StockMovement.updateMany(
    { reference: ref, reason: 'order_reserve' },
    { $set: { reason: 'order' } }
  );
  await Order.updateOne(
    { orderNumber: ref },
    { $set: { stockApplied: true, stockReserved: false } }
  );
  return true;
}

/** İptal öncesi rezerv geri yükle */
export async function restoreOrderStockReserve(orderNumber: string): Promise<number> {
  const ref = String(orderNumber ?? '').trim();
  if (!ref) return 0;

  const movements = await StockMovement.find({
    reference: ref,
    reason: 'order_reserve',
    delta: { $lt: 0 },
  }).lean();

  if (!movements.length) return 0;

  const order = await Order.findOne({ orderNumber: ref }).lean();
  if (!order) return 0;

  let restored = 0;
  const { adjustProductStock, findProductBySkuOrBarcode, resolveVariantMatch } =
    await import('@/lib/inventory');

  for (const mv of movements) {
    const qty = Math.abs(Number(mv.delta) || 0);
    if (qty <= 0) continue;
    const raw = await findProductBySkuOrBarcode(mv.sku, mv.barcode);
    if (!raw) continue;
    const match = resolveVariantMatch(raw, mv.sku, mv.barcode, '');
    await adjustProductStock({
      match,
      delta: qty,
      reason: 'return',
      reference: `${ref}:reserve-restore`,
      sku: mv.sku,
      barcode: mv.barcode,
    });
    restored += qty;
  }

  await StockMovement.deleteMany({ reference: ref, reason: 'order_reserve' });
  await Order.updateOne(
    { orderNumber: ref },
    { $set: { stockReserved: false, stockApplied: false } }
  );

  return restored;
}
