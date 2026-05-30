import Order from '@/models/Order';
import { MAIN_WAREHOUSE_ID } from '@/lib/warehouse-stock';
import { resolveSettingDocument } from '@/lib/erp-settings';

export async function resolveOrderWarehouseId(input: {
  warehouseId?: string;
  orderNumber?: string;
  tenantId?: string;
}): Promise<string> {
  const direct = String(input.warehouseId ?? '').trim();
  if (direct) return direct;

  const orderNumber = String(input.orderNumber ?? '').trim();
  if (orderNumber) {
    const filter: Record<string, string> = { orderNumber };
    if (input.tenantId) filter.tenantId = input.tenantId;
    const order = await Order.findOne(filter).select('warehouseId').lean();
    const wh = String(order?.warehouseId ?? '').trim();
    if (wh) return wh;
  }

  const doc = await resolveSettingDocument(input.tenantId);
  return (
    String(doc.get('trendyolDefaultWarehouseId') ?? MAIN_WAREHOUSE_ID).trim() ||
    MAIN_WAREHOUSE_ID
  );
}
