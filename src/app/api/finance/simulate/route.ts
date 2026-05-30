import { NextResponse } from 'next/server';
import { simulateProfit } from '@/lib/profit-simulator';
import { getFinanceDefaults } from '@/lib/finance-defaults';
import { requireSession } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';

export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator', 'accountant']);
    if (session instanceof NextResponse) return session;

    const defaults = await getFinanceDefaults(tenantScope(session).tenantId);
    return NextResponse.json({ success: true, defaults });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Varsayılanlar alınamadı';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator', 'accountant']);
    if (session instanceof NextResponse) return session;

    const body = (await request.json()) as Record<string, unknown>;
    const defaults = await getFinanceDefaults(tenantScope(session).tenantId);

    const result = simulateProfit({
      listPrice: Number(body.listPrice) || 0,
      costPrice: Number(body.costPrice) || 0,
      commissionPct:
        body.commissionPct != null
          ? Number(body.commissionPct)
          : defaults.defaultCommissionPct,
      desi: body.desi != null ? Number(body.desi) : defaults.defaultDesi,
      quantity: body.quantity != null ? Number(body.quantity) : 1,
      sellerDiscountPct: Number(body.sellerDiscountPct) || 0,
      platformDiscount: Number(body.platformDiscount) || 0,
      vatRate: defaults.vatRate,
      cargoTariff: defaults.cargoTariff,
      stopajRatePct: defaults.stopajRatePct,
      serviceFeePerOrder: defaults.serviceFeePerOrder,
      adCostPerOrder: Number(body.adCostPerOrder) || 0,
      cargoFee: body.cargoFee != null ? Number(body.cargoFee) : undefined,
      defaultCargoFee: defaults.defaultCargoFee,
    });

    const targetMargins = [10, 15, 20, 25, 30].map((m) => ({
      marginPct: m,
      price: result.targetPriceForMargin(m),
    }));

    return NextResponse.json({
      success: true,
      result: {
        ...result,
        targetPriceForMargin: undefined,
      },
      targetMargins,
      defaults,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Simülasyon hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
