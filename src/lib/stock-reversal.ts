import Order from '@/models/Order';
import StockMovement from '@/models/StockMovement';
import {
  adjustProductStock,
  findProductBySkuOrBarcode,
  orderHasStockDeductions,
  resolveVariantMatch,
} from '@/lib/inventory';
import { logActivity } from '@/lib/activity-log';

async function orderStockAlreadyRestored(orderNumber: string): Promise<boolean> {
  const hit = await StockMovement.exists({
    reference: `${orderNumber}:restore`,
    delta: { $gt: 0 },
    reason: 'return',
  });
  return Boolean(hit);
}

/** İptal / iade siparişinde stok geri yükle (idempotent — aynı siparişte bir kez). */
export async function restoreOrderStockIfApplied(orderNumber: string): Promise<number> {
  const ref = String(orderNumber ?? '').trim();
  if (!ref) return 0;

  const order = await Order.findOne({ orderNumber: ref }).lean();
  if (!order) return 0;

  if (await orderStockAlreadyRestored(ref)) return 0;

  const hadDeduction =
    Boolean(order.stockApplied) || (await orderHasStockDeductions(ref));
  if (!hadDeduction) return 0;

  let restored = 0;
  const missed: string[] = [];

  for (const line of order.items ?? []) {
    const raw = await findProductBySkuOrBarcode(line.sku, line.barcode);
    if (!raw) {
      missed.push(String(line.sku || line.barcode || 'satır'));
      continue;
    }
    const match = resolveVariantMatch(raw, line.sku, line.barcode, line.productName);
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    await adjustProductStock({
      match,
      delta: qty,
      reason: 'return',
      reference: `${ref}:restore`,
      sku: line.sku,
      barcode: line.barcode,
      productName: line.productName,
    });
    restored += qty;
  }

  if (restored > 0) {
    await Order.updateOne({ orderNumber: ref }, { $set: { stockApplied: false } });
    await logActivity({
      action: 'stock_restore',
      module: 'orders',
      detail: `${ref}: ${restored} adet stok iade edildi${missed.length ? ` (${missed.length} eşleşmeyen kalem)` : ''}`,
    });
  }

  return restored;
}
