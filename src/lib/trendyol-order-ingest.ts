import Order from '@/models/Order';
import { findProductBySkuOrBarcode, orderHasStockDeductions } from '@/lib/inventory';
import { applyOrderStockDeduction, statusRequiresStockDeduction } from '@/lib/order-stock';
import { restoreOrderStockIfApplied } from '@/lib/stock-reversal';
import { getTrendyolSettings } from '@/lib/trendyol';

export function mapTrendyolPackageStatus(ty: string): string {
  switch (String(ty ?? '')) {
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
