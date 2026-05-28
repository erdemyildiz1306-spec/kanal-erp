import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { issueStoreInvoiceForOrder } from '@/lib/store-invoice-flow';

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

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : 'pdf';

    const result = await issueStoreInvoiceForOrder({
      orderId,
      mode: 'file',
      invoiceNumber: invoiceNumber || undefined,
      fileBuffer: buffer,
      fileName: `fatura-${orderId}.${ext}`,
      mimeType,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
