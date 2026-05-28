import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { getTrendyolSettings, updateTrendyolPackageStatus, formatTrendyolAxiosError } from '@/lib/trendyol';
import {
  sendTrendyolInvoiceLink,
  unixInvoiceDateTime,
  isValidTrendyolInvoiceNumber,
} from '@/lib/trendyol-invoice';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    const body = (await request.json()) as {
      orderId?: string;
      invoiceLink?: string;
      invoiceNumber?: string;
      invoiceDateTime?: number;
      markInvoiced?: boolean;
    };

    const orderId = String(body.orderId ?? '').trim();
    const invoiceLink = String(body.invoiceLink ?? '').trim();
    if (!orderId || !invoiceLink) {
      return NextResponse.json(
        { success: false, error: 'orderId ve invoiceLink zorunlu.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const order = await Order.findById(orderId).lean();
    if (!order || order.platform !== 'trendyol') {
      return NextResponse.json({ success: false, error: 'Trendyol siparişi bulunamadı.' }, { status: 404 });
    }
    const packageId = String(order.packageId ?? '').trim();
    if (!/^\d+$/.test(packageId)) {
      return NextResponse.json({ success: false, error: 'Geçerli paket numarası yok.' }, { status: 400 });
    }

    const invoiceNumber = String(body.invoiceNumber ?? order.trendyolInvoice?.invoiceNumber ?? '').trim();
    if (invoiceNumber && !isValidTrendyolInvoiceNumber(invoiceNumber)) {
      return NextResponse.json({ success: false, error: 'Geçersiz fatura numarası formatı.' }, { status: 400 });
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

    return NextResponse.json({ success: true, packageId, invoiceLink, invoiceNumber });
  } catch (error: unknown) {
    const message = error instanceof Error ? formatTrendyolAxiosError(error) || error.message : 'Hata';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
