import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { resolveSettingDocument } from '@/lib/erp-settings';
import Warehouse from '@/models/Warehouse';
import { tenantScope } from '@/lib/tenant';
import {
  getTrendyolSettings,
  parseTrendyolBrandId,
  resolveTrendyolBrandId,
} from '@/lib/trendyol';
import { randomBytes } from 'crypto';
import { requireSession, getSessionFromRequest } from '@/lib/auth';
import {
  DEFAULT_PRODUCTION_APP_URL,
  getEffectivePublicAppUrl,
} from '@/lib/public-image-url';
import { OutboundUrlError, assertSafeOutboundHttpsUrl } from '@/lib/outbound-url';
import {
  normalizeIntegrationModules,
  type IntegrationModuleKey,
} from '@/lib/integration-modules';

export const dynamic = 'force-dynamic';

function toTrimmedString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).trim();
  if (typeof v === 'boolean') return v ? 'true' : '';
  return String(v).trim();
}

function buildIntegrationHints(doc: {
  get: (path: string) => unknown;
}): Record<string, boolean> {
  const brandId = parseTrendyolBrandId(doc.get('trendyolBrandId'));
  const brandName = toTrimmedString(doc.get('trendyolBrandName'));
  return {
    trendyolSellerIdSaved: Boolean(toTrimmedString(doc.get('trendyolSellerId'))),
    trendyolApiKeySaved: Boolean(toTrimmedString(doc.get('trendyolApiKey'))),
    trendyolApiSecretSaved: Boolean(toTrimmedString(doc.get('trendyolApiSecret'))),
    webApiTokenSaved: Boolean(toTrimmedString(doc.get('webApiToken'))),
    trendyolBrandIdSaved: Number.isFinite(brandId) && brandId > 0,
    trendyolBrandNameSaved: brandName.length > 0,
    efaturamPartnerPasswordSaved: Boolean(toTrimmedString(doc.get('efaturamPartnerPassword'))),
    efaturamCustomerPasswordSaved: Boolean(toTrimmedString(doc.get('efaturamCustomerPassword'))),
    trendyolWebhookSecretSaved: Boolean(toTrimmedString(doc.get('trendyolWebhookSecret'))),
  };
}

export async function GET(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    let doc = await resolveSettingDocument(tenantScope(session).tenantId);

    let publicAppUrlStored = String(doc.get('publicAppUrl') ?? '').trim();
    if (!publicAppUrlStored && process.env.VERCEL) {
      publicAppUrlStored = getEffectivePublicAppUrl('');
      if (publicAppUrlStored) {
        doc.set('publicAppUrl', publicAppUrlStored);
        await doc.save();
      }
    }

    /** Kimlik doğrulanmış değil; yalnızca “doluluk” ipuçları */
    const integrationHints = buildIntegrationHints(doc);

    const o = doc.toObject({ getters: false, virtuals: false });
    delete (o as { trendyolApiKey?: string }).trendyolApiKey;
    delete (o as { trendyolApiSecret?: string }).trendyolApiSecret;
    delete (o as { webApiToken?: string }).webApiToken;
    delete (o as { efaturamPartnerPassword?: string }).efaturamPartnerPassword;
    delete (o as { efaturamCustomerPassword?: string }).efaturamCustomerPassword;
    delete (o as { trendyolWebhookSecret?: string }).trendyolWebhookSecret;
    (o as { publicAppUrl?: string }).publicAppUrl =
      publicAppUrlStored || String((o as { publicAppUrl?: string }).publicAppUrl ?? '');

    return NextResponse.json(
      {
        success: true,
        settings: o,
        effectivePublicAppUrl: getEffectivePublicAppUrl(publicAppUrlStored),
        keysMasked: true,
        integrationHints,
        database: {
          name: mongoose.connection.name || '',
          host: mongoose.connection.host || '',
          ready: mongoose.connection.readyState === 1,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          Pragma: 'no-cache',
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Gizli alanlar ve satıcı ID: istemciden dolu gelmeyeni yok say; mevcut değeri koru. */
export async function PUT(request: Request) {
  try {
    const auth = requireSession(request, ['admin']);
    if (auth instanceof Response) return auth;

    let doc = await resolveSettingDocument(tenantScope(auth).tenantId);

    const data = (await request.json()) as Record<string, unknown>;
    let webhookSecretGenerated: string | undefined;

    const incomingSeller = toTrimmedString(data.trendyolSellerId);
    if (incomingSeller !== '') {
      doc.set('trendyolSellerId', incomingSeller);
    }

    const incomingKey = toTrimmedString(data.trendyolApiKey);
    if (incomingKey !== '') {
      doc.set('trendyolApiKey', incomingKey);
    }

    const incomingSecret = toTrimmedString(data.trendyolApiSecret);
    if (incomingSecret !== '') {
      doc.set('trendyolApiSecret', incomingSecret);
    }

    const incomingWebToken = toTrimmedString(data.webApiToken);
    if (incomingWebToken !== '') {
      doc.set('webApiToken', incomingWebToken);
    }

    const incomingWpToken = toTrimmedString((data as { wpApiToken?: string }).wpApiToken);
    if (incomingWpToken !== '') {
      doc.set('wpApiToken', incomingWpToken);
    }

    if ((data as { wpApiUrl?: string }).wpApiUrl !== undefined) {
      const wpUrl = String((data as { wpApiUrl?: string }).wpApiUrl ?? '').trim();
      if (wpUrl) {
        try {
          assertSafeOutboundHttpsUrl(wpUrl, 'WordPress API adresi');
          doc.set('wpApiUrl', wpUrl);
        } catch (error) {
          const message =
            error instanceof OutboundUrlError ? error.message : 'Geçersiz WordPress API adresi.';
          return NextResponse.json({ error: message }, { status: 400 });
        }
      } else {
        doc.set('wpApiUrl', '');
      }
    }

    if (data.webApiUrl !== undefined) {
      const baseUrl = String(data.webApiUrl ?? '').trim();
      if (baseUrl) {
        try {
          assertSafeOutboundHttpsUrl(baseUrl, 'Mağaza API taban adresi');
          doc.set('webApiUrl', baseUrl);
        } catch (error) {
          const message =
            error instanceof OutboundUrlError ? error.message : 'Geçersiz mağaza API adresi.';
          return NextResponse.json({ error: message }, { status: 400 });
        }
      } else {
        doc.set('webApiUrl', '');
      }
    }
    if (data.webApiStockPath !== undefined) {
      doc.set('webApiStockPath', String(data.webApiStockPath ?? 'stock-price').trim() || 'stock-price');
    }
    if (data.webApiPushUrl !== undefined) {
      const pushUrl = String(data.webApiPushUrl ?? '').trim();
      if (pushUrl) {
        try {
          doc.set('webApiPushUrl', assertSafeOutboundHttpsUrl(pushUrl, 'Stok tam URL'));
        } catch (error) {
          const message = error instanceof OutboundUrlError ? error.message : 'Geçersiz stok URL.';
          return NextResponse.json({ error: message }, { status: 400 });
        }
      } else {
        doc.set('webApiPushUrl', '');
      }
    }
    if (data.webApiInvoicePath !== undefined) {
      doc.set(
        'webApiInvoicePath',
        String(data.webApiInvoicePath ?? 'orders/invoice').trim() || 'orders/invoice'
      );
    }
    if (data.webApiInvoicePushUrl !== undefined) {
      const invoiceUrl = String(data.webApiInvoicePushUrl ?? '').trim();
      if (invoiceUrl) {
        try {
          doc.set(
            'webApiInvoicePushUrl',
            assertSafeOutboundHttpsUrl(invoiceUrl, 'Fatura tam URL')
          );
        } catch (error) {
          const message =
            error instanceof OutboundUrlError ? error.message : 'Geçersiz fatura URL.';
          return NextResponse.json({ error: message }, { status: 400 });
        }
      } else {
        doc.set('webApiInvoicePushUrl', '');
      }
    }
    if (data.storeAutoMarkInvoiced !== undefined) {
      doc.set('storeAutoMarkInvoiced', Boolean(data.storeAutoMarkInvoiced));
    }
    if (data.storeName !== undefined) {
      doc.set('storeName', String(data.storeName ?? ''));
    }
    if (data.printPackageContents !== undefined) {
      doc.set('printPackageContents', Boolean(data.printPackageContents));
    }
    if (data.integrationModulesEnabled !== undefined && data.integrationModulesEnabled !== null) {
      const normalized = normalizeIntegrationModules(data.integrationModulesEnabled);
      for (const key of Object.keys(normalized) as IntegrationModuleKey[]) {
        doc.set(`integrationModulesEnabled.${key}`, normalized[key]);
      }
      doc.set('efaturamEnabled', normalized.trendyolEfaturam);
    }
    if (data.trendyolDefaultWarehouseId !== undefined) {
      const wh = String(data.trendyolDefaultWarehouseId ?? '').trim() || 'main';
      const whDoc = await Warehouse.findOne({ warehouseId: wh }).lean();
      if (!whDoc) {
        return NextResponse.json(
          { error: `Depo bulunamadı: "${wh}". Önce Depo sayfasından oluşturun.` },
          { status: 400 }
        );
      }
      doc.set('trendyolDefaultWarehouseId', wh);
    }
    if (data.modulesEnabled !== undefined && data.modulesEnabled !== null) {
      const raw = data.modulesEnabled as Record<string, unknown>;
      const keys = [
        'dashboard',
        'products',
        'scanner',
        'warehouse',
        'orders',
        'finans',
        'customers',
        'invoices',
        'trendyolInvoice',
        'storeInvoice',
        'cari',
        'reports',
        'activityLog',
        'users',
      ] as const;
      for (const key of keys) {
        if (typeof raw[key] === 'boolean') {
          doc.set(`modulesEnabled.${key}`, raw[key]);
        }
      }
    }
    if (data.companyLegalTitle !== undefined) {
      doc.set('companyLegalTitle', String(data.companyLegalTitle ?? ''));
    }
    if (data.companyTaxId !== undefined) {
      doc.set('companyTaxId', String(data.companyTaxId ?? ''));
    }
    if (data.companyTaxOffice !== undefined) {
      doc.set('companyTaxOffice', String(data.companyTaxOffice ?? ''));
    }
    if (data.companyAddress !== undefined) {
      doc.set('companyAddress', String(data.companyAddress ?? ''));
    }
    if (data.portalSupportPhone !== undefined) {
      doc.set('portalSupportPhone', String(data.portalSupportPhone ?? ''));
    }
    if (data.portalSupportEmail !== undefined) {
      doc.set('portalSupportEmail', String(data.portalSupportEmail ?? ''));
    }
    if (data.portalWhatsapp !== undefined) {
      doc.set('portalWhatsapp', String(data.portalWhatsapp ?? ''));
    }

    if (data.trendyolBrandName !== undefined) {
      doc.set('trendyolBrandName', toTrimmedString(data.trendyolBrandName));
    }
    if (data.trendyolBrandId !== undefined) {
      const rawBrand = toTrimmedString(data.trendyolBrandId);
      if (!rawBrand) {
        doc.set('trendyolBrandId', 0);
      } else {
        const bid = parseTrendyolBrandId(rawBrand);
        if (bid > 0) {
          doc.set('trendyolBrandId', bid);
        } else {
          const currentName = toTrimmedString(doc.get('trendyolBrandName'));
          if (!currentName) {
            doc.set('trendyolBrandName', rawBrand);
          }
        }
      }
    }
    if (data.trendyolStockDeductAt !== undefined) {
      const v = String(data.trendyolStockDeductAt ?? 'processing').trim();
      if (!['pending', 'processing', 'shipped'].includes(v)) {
        return NextResponse.json(
          { error: 'trendyolStockDeductAt: pending, processing veya shipped olmalı.' },
          { status: 400 }
        );
      }
      doc.set('trendyolStockDeductAt', v);
    }
    if (data.trendyolAutoSyncEnabled !== undefined) {
      doc.set('trendyolAutoSyncEnabled', Boolean(data.trendyolAutoSyncEnabled));
    }
    if (data.trendyolAutoSyncIntervalMinutes !== undefined) {
      const n = Number(data.trendyolAutoSyncIntervalMinutes);
      if (Number.isFinite(n) && n >= 1) {
        doc.set('trendyolAutoSyncIntervalMinutes', Math.min(Math.floor(n), 60));
      }
    }
    if (data.trendyolWebhookCoalesceOrders !== undefined) {
      doc.set('trendyolWebhookCoalesceOrders', Boolean(data.trendyolWebhookCoalesceOrders));
    }
    if (data.trendyolWebhookCoalesceSeconds !== undefined) {
      const n = Number(data.trendyolWebhookCoalesceSeconds);
      if (Number.isFinite(n) && n >= 30) {
        doc.set('trendyolWebhookCoalesceSeconds', Math.min(Math.floor(n), 600));
      }
    }
    if (data.trendyolWebhookSecret !== undefined) {
      const ws = String(data.trendyolWebhookSecret ?? '').trim();
      if (ws) doc.set('trendyolWebhookSecret', ws);
    } else if (!String(doc.get('trendyolWebhookSecret') ?? '').trim()) {
      webhookSecretGenerated = randomBytes(16).toString('hex');
      doc.set('trendyolWebhookSecret', webhookSecretGenerated);
    }
    if (data.publicAppUrl !== undefined) {
      let url = String(data.publicAppUrl ?? '').trim();
      if (!url && process.env.VERCEL) {
        url = getEffectivePublicAppUrl('') || DEFAULT_PRODUCTION_APP_URL;
      }
      doc.set('publicAppUrl', url);
    }

    if (data.financeDefaultCommissionPct !== undefined) {
      const n = Number(data.financeDefaultCommissionPct);
      if (Number.isFinite(n) && n >= 0 && n <= 100) {
        doc.set('financeDefaultCommissionPct', n);
      }
    }
    if (data.financeStopajRatePct !== undefined) {
      const n = Number(data.financeStopajRatePct);
      if (Number.isFinite(n) && n >= 0 && n <= 100) {
        doc.set('financeStopajRatePct', n);
      }
    }
    if (data.financeServiceFeePerOrder !== undefined) {
      const n = Number(data.financeServiceFeePerOrder);
      if (Number.isFinite(n) && n >= 0) {
        doc.set('financeServiceFeePerOrder', n);
      }
    }
    if (data.financeDefaultDesi !== undefined) {
      const n = Number(data.financeDefaultDesi);
      if (Number.isFinite(n) && n > 0) {
        doc.set('financeDefaultDesi', n);
      }
    }
    if (data.financeDefaultCargoFee !== undefined) {
      const n = Number(data.financeDefaultCargoFee);
      if (Number.isFinite(n) && n >= 0) {
        doc.set('financeDefaultCargoFee', n);
      }
    }
    if (data.financeVatRate !== undefined) {
      const n = Number(data.financeVatRate);
      if (Number.isFinite(n) && n > 0 && n < 1) {
        doc.set('financeVatRate', n);
      }
    }
    if (data.cargoDesiTariff !== undefined && Array.isArray(data.cargoDesiTariff)) {
      const tiers = data.cargoDesiTariff
        .map((t: { maxDesi?: number; fee?: number }) => ({
          maxDesi: Number(t.maxDesi) || 0,
          fee: Number(t.fee) || 0,
        }))
        .filter((t: { maxDesi: number; fee: number }) => t.maxDesi > 0 && t.fee >= 0);
      if (tiers.length) doc.set('cargoDesiTariff', tiers);
    }

    if (data.efaturamEnabled !== undefined) {
      const enabled = Boolean(data.efaturamEnabled);
      doc.set('efaturamEnabled', enabled);
      doc.set('integrationModulesEnabled.trendyolEfaturam', enabled);
    }
    if (data.efaturamUseStage !== undefined) {
      doc.set('efaturamUseStage', Boolean(data.efaturamUseStage));
    }
    if (data.efaturamPartnerId !== undefined) {
      const n = Number(data.efaturamPartnerId);
      if (Number.isFinite(n) && n >= 0) doc.set('efaturamPartnerId', Math.floor(n));
    }
    if (data.efaturamPartnerUsername !== undefined) {
      doc.set('efaturamPartnerUsername', String(data.efaturamPartnerUsername ?? '').trim());
    }
    const incomingPartnerPw = toTrimmedString(data.efaturamPartnerPassword);
    if (incomingPartnerPw !== '') doc.set('efaturamPartnerPassword', incomingPartnerPw);
    if (data.efaturamCustomerEmail !== undefined) {
      doc.set('efaturamCustomerEmail', String(data.efaturamCustomerEmail ?? '').trim());
    }
    const incomingCustomerPw = toTrimmedString(data.efaturamCustomerPassword);
    if (incomingCustomerPw !== '') doc.set('efaturamCustomerPassword', incomingCustomerPw);
    if (data.efaturamCompanyId !== undefined) {
      const n = Number(data.efaturamCompanyId);
      if (Number.isFinite(n) && n >= 0) doc.set('efaturamCompanyId', Math.floor(n));
    }
    if (data.efaturamUserId !== undefined) {
      const n = Number(data.efaturamUserId);
      if (Number.isFinite(n) && n >= 0) doc.set('efaturamUserId', Math.floor(n));
    }
    if (data.efaturamInvoicePrefix !== undefined) {
      doc.set(
        'efaturamInvoicePrefix',
        String(data.efaturamInvoicePrefix ?? 'ERP')
          .trim()
          .slice(0, 3)
          .toUpperCase() || 'ERP'
      );
    }
    if (data.efaturamXsltCode !== undefined) {
      doc.set('efaturamXsltCode', String(data.efaturamXsltCode ?? '').trim());
    }
    if (data.efaturamInvoiceLinkTemplate !== undefined) {
      doc.set('efaturamInvoiceLinkTemplate', String(data.efaturamInvoiceLinkTemplate ?? '').trim());
    }
    if (data.efaturamDefaultVatRate !== undefined) {
      const n = Number(data.efaturamDefaultVatRate);
      if (Number.isFinite(n) && n >= 0 && n <= 100) doc.set('efaturamDefaultVatRate', n);
    }
    if (data.efaturamAutoMarkInvoiced !== undefined) {
      doc.set('efaturamAutoMarkInvoiced', Boolean(data.efaturamAutoMarkInvoiced));
    }

    await doc.save();

    let brandResolveWarning: string | undefined;
    let brandResolvedFromName = false;
    const hasTyCreds =
      toTrimmedString(doc.get('trendyolSellerId')) !== '' &&
      toTrimmedString(doc.get('trendyolApiKey')) !== '' &&
      toTrimmedString(doc.get('trendyolApiSecret')) !== '';
    if (
      hasTyCreds &&
      parseTrendyolBrandId(doc.get('trendyolBrandId')) <= 0 &&
      toTrimmedString(doc.get('trendyolBrandName')) !== ''
    ) {
      try {
        const settings = await getTrendyolSettings();
        const resolvedId = await resolveTrendyolBrandId(settings);
        doc.set('trendyolBrandId', resolvedId);
        await doc.save();
        brandResolvedFromName = true;
      } catch (error: unknown) {
        brandResolveWarning =
          error instanceof Error ? error.message : 'Marka ID çözülemedi.';
      }
    }

    doc = await resolveSettingDocument(tenantScope(auth).tenantId);
    const integrationHints = buildIntegrationHints(doc);
    const savedBrandId = parseTrendyolBrandId(doc.get('trendyolBrandId'));
    const savedBrandName = toTrimmedString(doc.get('trendyolBrandName'));

    return NextResponse.json({
      success: true,
      settingsId: doc.get('settingsId'),
      integrationHints,
      brandResolvedFromName,
      brandResolveWarning,
      saved: {
        trendyolSellerId: String(doc.get('trendyolSellerId') ?? '').trim(),
        trendyolBrandId: savedBrandId,
        trendyolBrandName: savedBrandName,
        trendyolStockDeductAt: String(doc.get('trendyolStockDeductAt') ?? 'processing'),
        trendyolWebhookSecretSaved: Boolean(
          String(doc.get('trendyolWebhookSecret') ?? '').trim()
        ),
        ...(webhookSecretGenerated
          ? { trendyolWebhookSecret: webhookSecretGenerated }
          : {}),
        publicAppUrl:
          String(doc.get('publicAppUrl') ?? '').trim() ||
          getEffectivePublicAppUrl(''),
        webApiUrl: String(doc.get('webApiUrl') ?? '').trim(),
        wpApiUrl: String(doc.get('wpApiUrl') ?? '').trim(),
        webApiStockPath: String(doc.get('webApiStockPath') ?? 'stock-price').trim(),
        webApiPushUrl: String(doc.get('webApiPushUrl') ?? '').trim(),
        webApiInvoicePath: String(doc.get('webApiInvoicePath') ?? 'orders/invoice').trim(),
        webApiInvoicePushUrl: String(doc.get('webApiInvoicePushUrl') ?? '').trim(),
        storeAutoMarkInvoiced: Boolean(doc.get('storeAutoMarkInvoiced') ?? true),
        storeName: String(doc.get('storeName') ?? '').trim(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
