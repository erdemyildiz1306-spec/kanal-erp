import { NextResponse } from 'next/server';
import { resolveSettingDocument } from '@/lib/erp-settings';
import {
  getEfaturamCustomerSession,
  efaturamGetApplicationStatus,
  getEfaturamGateway,
  formatEfaturamError,
} from '@/lib/trendyol-efaturam';
import { loadEfaturamSettingsFromDb } from '@/lib/trendyol-invoice-flow';
import { requireInvoiceSession } from '@/lib/store-invoice-api';
import connectToDatabase from '@/lib/mongodb';
import { assertIntegrationModuleEnabled } from '@/lib/integration-modules-server';
import { tenantScope } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = requireInvoiceSession(request);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const mod = await assertIntegrationModuleEnabled('trendyolEfaturam', tenantId, session);
    if (!mod.ok) {
      return NextResponse.json({ success: false, error: mod.error }, { status: 403 });
    }

    const efaturam = await loadEfaturamSettingsFromDb(tenantId);
    if (!efaturam) {
      return NextResponse.json(
        { success: false, error: 'E-Faturam ayarları eksik veya devre dışı.' },
        { status: 400 }
      );
    }

    const doc = await resolveSettingDocument(tenantId);
    const companyTaxId = String(doc.get('companyTaxId') ?? '').trim();
    if (!companyTaxId) {
      return NextResponse.json(
        { success: false, error: 'Firma VKN/TCKN (Ayarlar → Genel & Firma) zorunlu.' },
        { status: 400 }
      );
    }

    const sessionData = await getEfaturamCustomerSession(efaturam, companyTaxId);
    const gateway = getEfaturamGateway(efaturam.useStage);

    let applicationStatus: unknown = null;
    if (efaturam.partnerId > 0) {
      try {
        applicationStatus = await efaturamGetApplicationStatus(
          gateway,
          efaturam.partnerId,
          companyTaxId,
          sessionData.partnerToken
        );
      } catch {
        /* opsiyonel */
      }
    }

    const companyId = efaturam.companyId || sessionData.companyId;
    const userId = efaturam.userId || sessionData.userId;
    if (companyId && userId) {
      doc.set('efaturamCompanyId', companyId);
      doc.set('efaturamUserId', userId);
      await doc.save();
    }

    return NextResponse.json({
      success: true,
      gateway,
      companyId,
      userId,
      partnerCustomerId: sessionData.partnerCustomerId,
      applicationStatus,
      message: 'E-Faturam bağlantısı başarılı.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? formatEfaturamError(error) : 'Bağlantı hatası';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
