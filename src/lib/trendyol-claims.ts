/**
 * Trendyol iade talepleri — getClaims
 * @see https://developers.trendyol.com/reference/getclaims.md
 */

import axios from 'axios';
import connectToDatabase from './mongodb';
import Order from '@/models/Order';
import { getTrendyolAuthHeader, getTrendyolSettings } from './trendyol';
import { TrendyolEndpoints } from './trendyol-endpoints';
import { processTrendyolOrderReturn } from '@/lib/stock-reversal';
import { mergeTenant } from '@/lib/tenant-query';

const MS_DAY = 86_400_000;

type ClaimRow = Record<string, unknown>;

function scalar(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export async function syncTrendyolAcceptedClaims(opts?: {
  daysBack?: number;
  tenantId?: string;
}): Promise<{ processed: number; returned: number }> {
  await connectToDatabase();
  const tenantId = opts?.tenantId;
  const settings = await getTrendyolSettings(tenantId);
  const headers = getTrendyolAuthHeader(
    settings.apiKey,
    settings.apiSecret,
    settings.sellerId
  );
  const daysBack = Math.min(Math.max(opts?.daysBack ?? 30, 1), 90);
  const startDate = Date.now() - daysBack * MS_DAY;
  const url = TrendyolEndpoints.claims(settings.sellerId);

  let processed = 0;
  let returned = 0;
  let page = 0;
  let totalPages = 1;

  while (page < totalPages && page < 30) {
    const { data } = await axios.get(url, {
      headers,
      params: {
        page,
        size: 200,
        startDate,
        claimItemStatus: 'Accepted',
      },
      timeout: 90_000,
    });

    const content = Array.isArray(data?.content)
      ? (data.content as ClaimRow[])
      : [];
    totalPages = Math.max(1, Number(data?.totalPages) || 1);

    for (const claim of content) {
      processed++;
      const pkgId = scalar(
        claim.orderShipmentPackageId ?? claim.shipmentPackageId
      );
      const orderNo = scalar(claim.orderNumber);

      let order = pkgId
        ? await Order.findOne(
            mergeTenant(tenantId, {
              platform: 'trendyol',
              $or: [{ packageId: pkgId }, { platformOrderId: pkgId }],
            })
          ).lean()
        : null;

      if (!order && orderNo) {
        order = await Order.findOne(mergeTenant(tenantId, { orderNumber: orderNo })).lean();
      }
      if (!order) continue;

      const st = String(order.status ?? '');
      if (st === 'İade Edildi' || st === 'İptal Edildi') continue;

      const r = await processTrendyolOrderReturn(String(order.orderNumber), order.tenantId);
      if (r.restored > 0 || r.statusUpdated) returned++;
    }

    page++;
    if (content.length === 0) break;
  }

  return { processed, returned };
}
