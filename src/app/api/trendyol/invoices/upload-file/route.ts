import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { getTrendyolSettings, formatTrendyolAxiosError } from '@/lib/trendyol';
import {
  uploadTrendyolInvoiceFile,
  unixInvoiceDateTime,
  isValidTrendyolInvoiceNumber,
} from '@/lib/trendyol-invoice';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export async function POST(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Oturum gerekli.' }, { status: 401 });
    }

    const form = await request.formData();
    const orderId = String(form.get('orderId') ?? '').trim();
    const invoiceNumber = String(form.get('invoiceNumber') ?? '').trim();
    const file = form.get('file');

    if (!orderId || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: 'orderId ve file zorunlu.' },
        { status: 400 }
      );
    }

    const mimeType = file.type || 'application/pdf';
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json(
        { success: false, error: 'Desteklenen formatlar: PDF, JPEG, PNG.' },
        { status: 400 }
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Dosya boyutu 10 MB sınırını aşıyor.' },
        { status: 400 }
      );
    }
    if (invoiceNumber && !isValidTrendyolInvoiceNumber(invoiceNumber)) {
      return NextResponse.json({ success: false, error: 'Geçersiz fatura numarası.' }, { status: 400 });
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : 'pdf';
    const settings = await getTrendyolSettings();

    await uploadTrendyolInvoiceFile({
      sellerId: settings.sellerId,
      apiKey: settings.apiKey,
      apiSecret: settings.apiSecret,
      shipmentPackageId: packageId,
      fileBuffer: buffer,
      fileName: `fatura-${order.orderNumber}.${ext}`,
      mimeType,
      invoiceDateTime: unixInvoiceDateTime(),
      invoiceNumber: invoiceNumber || undefined,
    });

    await Order.findByIdAndUpdate(orderId, {
      $set: {
        trendyolInvoice: {
          status: 'sent',
          invoiceNumber,
          invoiceDateTime: unixInvoiceDateTime(),
          sentAt: new Date(),
          sentVia: 'file',
          lastError: '',
        },
      },
    });

    return NextResponse.json({ success: true, packageId, invoiceNumber });
  } catch (error: unknown) {
    const message = error instanceof Error ? formatTrendyolAxiosError(error) || error.message : 'Hata';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
