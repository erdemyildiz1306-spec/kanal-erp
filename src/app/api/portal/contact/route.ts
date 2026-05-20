import { NextResponse } from 'next/server';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session || session.role !== 'customer') {
      return NextResponse.json({ success: false, error: 'Müşteri oturumu gerekli.' }, { status: 401 });
    }

    const doc = await resolveSingletonSettingDocument();
    return NextResponse.json({
      success: true,
      contact: {
        storeName: String(doc.get('storeName') ?? 'KanalERP'),
        companyLegalTitle: String(doc.get('companyLegalTitle') ?? ''),
        companyAddress: String(doc.get('companyAddress') ?? ''),
        phone: String(doc.get('portalSupportPhone') ?? ''),
        email: String(doc.get('portalSupportEmail') ?? ''),
        whatsapp: String(doc.get('portalWhatsapp') ?? ''),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
