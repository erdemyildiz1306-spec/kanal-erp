import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import { issueStoreInvoiceForOrder } from '@/lib/store-invoice-flow';
import { detectAllowedInvoiceMime } from '@/lib/file-mime-verify';
import { isValidTrendyolInvoiceNumber } from '@/lib/trendyol-invoice';
import {
  assertValidStoreOrderId,
  enforceInvoiceRateLimit,
  logInvoiceActivity,
  requireStoreInvoiceSession,
  storeInvoiceErrorResponse,
} from '@/lib/store-invoice-api';
import { StoreInvoiceError } from '@/lib/store-invoice-errors';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const session = requireStoreInvoiceSession(request);
    if (session instanceof NextResponse) return session;
    const limited = enforceInvoiceRateLimit(session.userId);
    if (limited) return limited;

    await connectToDatabase();
    const mod = await assertIntegrationModuleEnabled('webStoreApi');
    if (!mod.ok) {
      return NextResponse.json({ success: false, error: mod.error }, { status: 403 });
    }

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
      return NextResponse.json(
        { success: false, error: 'Geçersiz fatura numarası formatı.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const order = await Order.findById(orderId).select('orderNumber platform').lean();
    if (!order || order.platform !== 'web') {
      throw new StoreInvoiceError('Mağaza (web) siparişi bulunamadı.', 404);
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

    const result = await issueStoreInvoiceForOrder({
      orderId,
      mode: 'file',
      invoiceNumber: invoiceNumber || undefined,
      fileBuffer: buffer,
      fileName: `fatura-${order.orderNumber}.${ext}`,
      mimeType,
    });

    await logInvoiceActivity(session, {
      platform: 'web',
      action: 'upload',
      orderNumber: result.orderNumber,
      invoiceNumber: result.invoiceNumber,
      mode: 'file',
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    return storeInvoiceErrorResponse(error);
  }
}
