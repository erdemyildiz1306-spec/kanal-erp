import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { getTrendyolSettings, updateTrendyolPackageStatus, formatTrendyolAxiosError } from '@/lib/trendyol';
import {
  sendTrendyolInvoiceLink,
  unixInvoiceDateTime,
  isValidTrendyolInvoiceNumber,
} from '@/lib/trendyol-invoice';
import { assertHttpsInvoiceLink } from '@/lib/outbound-url';
import { StoreInvoiceError } from '@/lib/store-invoice-errors';
import {
  assertValidStoreOrderId,
  enforceInvoiceRateLimit,
  logInvoiceActivity,
  requireInvoiceSession,
  storeInvoiceErrorResponse,
} from '@/lib/store-invoice-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = requireInvoiceSession(request);
    if (session instanceof NextResponse) return session;
    const limited = enforceInvoiceRateLimit(session.userId);
    if (limited) return limited;

    const body = (await request.json()) as {
      orderId?: string;
      invoiceLink?: string;
      invoiceNumber?: string;
      invoiceDateTime?: number;
      markInvoiced?: boolean;
    };

    const orderId = assertValidStoreOrderId(body.orderId ?? '');
    const invoiceLink = assertHttpsInvoiceLink(String(body.invoiceLink ?? '').trim());

    await connectToDatabase();
    const order = await Order.findById(orderId).lean();
    if (!order || order.platform !== 'trendyol') {
      throw new StoreInvoiceError('Trendyol siparişi bulunamadı.', 404);
    }
    const packageId = String(order.packageId ?? '').trim();
    if (!/^\d+$/.test(packageId)) {
      throw new StoreInvoiceError('Geçerli paket numarası yok.', 400);
    }

    const invoiceNumber = String(body.invoiceNumber ?? order.trendyolInvoice?.invoiceNumber ?? '').trim();
    if (invoiceNumber && !isValidTrendyolInvoiceNumber(invoiceNumber)) {
      throw new StoreInvoiceError('Geçersiz fatura numarası formatı.', 400);
    }

    const settings = await getTrendyolSettings();
    const invoiceDateTime = body.invoiceDateTime ?? unixInvoiceDateTime();

    await sendTrendyolInvoiceLink({
      sellerId: settings.sellerId,
      apiKey: settings.apiKey,
      apiSecret: settings.apiSecret,
      payload: {
        invoiceLink,
        shipmentPackageId: Number(packageId),
        invoiceDateTime,
        invoiceNumber: invoiceNumber || undefined,
      },
    });

    if (body.markInvoiced !== false) {
      const lines = (order.items ?? [])
        .map((item: { lineId?: string; quantity?: number }) => ({
          lineId: Number(item.lineId),
          quantity: Number(item.quantity) || 1,
        }))
        .filter((l: { lineId: number; quantity: number }) => Number.isFinite(l.lineId) && l.lineId > 0);
      if (lines.length > 0 && invoiceNumber) {
        await updateTrendyolPackageStatus({
          sellerId: settings.sellerId,
          apiKey: settings.apiKey,
          apiSecret: settings.apiSecret,
          packageId,
          status: 'Invoiced',
          lines,
          invoiceNumber,
        });
      }
    }

    await Order.findByIdAndUpdate(orderId, {
      $set: {
        trendyolInvoice: {
          status: 'sent',
          invoiceNumber,
          invoiceLink,
          invoiceDateTime,
          sentAt: new Date(),
          sentVia: 'link',
          lastError: '',
        },
      },
    });

    await logInvoiceActivity(session, {
      platform: 'trendyol',
      action: 'send_link',
      orderNumber: order.orderNumber,
      invoiceNumber,
    });

    return NextResponse.json({ success: true, packageId, invoiceLink, invoiceNumber });
  } catch (error: unknown) {
    const message = error instanceof Error ? formatTrendyolAxiosError(error) || error.message : 'Hata';
    if (!(error instanceof StoreInvoiceError)) {
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }
    return storeInvoiceErrorResponse(error);
  }
}
