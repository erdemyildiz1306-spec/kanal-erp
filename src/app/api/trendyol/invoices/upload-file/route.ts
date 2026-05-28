import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { getTrendyolSettings, formatTrendyolAxiosError } from '@/lib/trendyol';
import {
  uploadTrendyolInvoiceFile,
  unixInvoiceDateTime,
  isValidTrendyolInvoiceNumber,
} from '@/lib/trendyol-invoice';
import { detectAllowedInvoiceMime } from '@/lib/file-mime-verify';
import { StoreInvoiceError } from '@/lib/store-invoice-errors';
import {
  assertValidStoreOrderId,
  enforceInvoiceRateLimit,
  logInvoiceActivity,
  requireInvoiceSession,
  storeInvoiceErrorResponse,
} from '@/lib/store-invoice-api';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const session = requireInvoiceSession(request);
    if (session instanceof NextResponse) return session;
    const limited = enforceInvoiceRateLimit(session.userId);
    if (limited) return limited;

    const form = await request.formData();
    const orderId = assertValidStoreOrderId(String(form.get('orderId') ?? ''));
    const invoiceNumber = String(form.get('invoiceNumber') ?? '').trim();
    const file = form.get('file');

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: 'orderId ve file zorunlu.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
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
      throw new StoreInvoiceError('Trendyol siparişi bulunamadı.', 404);
    }
    const packageId = String(order.packageId ?? '').trim();
    if (!/^\d+$/.test(packageId)) {
      throw new StoreInvoiceError('Geçerli paket numarası yok.', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = detectAllowedInvoiceMime(buffer);
    if (!mimeType) {
      return NextResponse.json(
        { success: false, error: 'Desteklenen formatlar: PDF, JPEG, PNG.' },
        { status: 400 }
      );
    }

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

    await logInvoiceActivity(session, {
      platform: 'trendyol',
      action: 'upload',
      orderNumber: order.orderNumber,
      invoiceNumber,
      mode: 'file',
    });

    return NextResponse.json({ success: true, packageId, invoiceNumber });
  } catch (error: unknown) {
    const message = error instanceof Error ? formatTrendyolAxiosError(error) || error.message : 'Hata';
    if (!(error instanceof StoreInvoiceError)) {
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }
    return storeInvoiceErrorResponse(error);
  }
}
