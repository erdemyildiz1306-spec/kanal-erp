import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import {
  getTrendyolSettings,
  parseTrendyolBrandId,
  resolveTrendyolBrandId,
} from '@/lib/trendyol';
import { randomBytes } from 'crypto';

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
  };
}

export async function GET() {
  try {
    let doc = await resolveSingletonSettingDocument();

    /** Kimlik doğrulanmış değil; yalnızca “doluluk” ipuçları */
    const integrationHints = buildIntegrationHints(doc);

    const o = doc.toObject({ getters: false, virtuals: false });
    delete (o as { trendyolApiKey?: string }).trendyolApiKey;
    delete (o as { trendyolApiSecret?: string }).trendyolApiSecret;
    delete (o as { webApiToken?: string }).webApiToken;

    return NextResponse.json(
      {
        success: true,
        settings: o,
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
    let doc = await resolveSingletonSettingDocument();

    const data = (await request.json()) as Record<string, unknown>;

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

    if (data.webApiUrl !== undefined) {
      doc.set('webApiUrl', String(data.webApiUrl ?? ''));
    }
    if (data.webApiStockPath !== undefined) {
      doc.set('webApiStockPath', String(data.webApiStockPath ?? 'stock-price').trim() || 'stock-price');
    }
    if (data.webApiPushUrl !== undefined) {
      doc.set('webApiPushUrl', String(data.webApiPushUrl ?? '').trim());
    }
    if (data.storeName !== undefined) {
      doc.set('storeName', String(data.storeName ?? ''));
    }
    if (data.printPackageContents !== undefined) {
      doc.set('printPackageContents', Boolean(data.printPackageContents));
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
      doc.set('trendyolStockDeductAt', v || 'processing');
    }
    if (data.trendyolWebhookSecret !== undefined) {
      const ws = String(data.trendyolWebhookSecret ?? '').trim();
      if (ws) doc.set('trendyolWebhookSecret', ws);
    } else if (!String(doc.get('trendyolWebhookSecret') ?? '').trim()) {
      doc.set('trendyolWebhookSecret', randomBytes(16).toString('hex'));
    }
    if (data.publicAppUrl !== undefined) {
      doc.set('publicAppUrl', String(data.publicAppUrl ?? '').trim());
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

    doc = await resolveSingletonSettingDocument();
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
        trendyolWebhookSecret: String(doc.get('trendyolWebhookSecret') ?? '').trim(),
        publicAppUrl: String(doc.get('publicAppUrl') ?? '').trim(),
        webApiUrl: String(doc.get('webApiUrl') ?? '').trim(),
        storeName: String(doc.get('storeName') ?? '').trim(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
