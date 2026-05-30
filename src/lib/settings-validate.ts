import mongoose from 'mongoose';
import Warehouse from '@/models/Warehouse';
import { resolveSettingDocument } from '@/lib/erp-settings';
import {
  loadIntegrationModulesEnabled,
} from '@/lib/integration-modules-server';
import type { IntegrationModulesEnabled } from '@/lib/integration-modules';
import { getTrendyolSettings } from '@/lib/trendyol';

export type SettingsCheckItem = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
};

export type SettingsValidationReport = {
  ok: boolean;
  tenantId: string;
  integrationModules: IntegrationModulesEnabled;
  checks: SettingsCheckItem[];
  webhookUrlHint?: string;
  cronConfigured: boolean;
};

export async function validateDeploymentSettings(
  tenantId?: string,
  origin?: string
): Promise<SettingsValidationReport> {
  const tid = tenantId?.trim() || 'default';
  const doc = await resolveSettingDocument(tid);
  const modules = await loadIntegrationModulesEnabled(tid);
  const checks: SettingsCheckItem[] = [];

  const dbOk = mongoose.connection.readyState === 1;
  checks.push({
    id: 'mongodb',
    label: 'MongoDB bağlantısı',
    ok: dbOk,
    detail: dbOk ? 'Bağlı' : 'Bağlantı yok',
  });

  const cronConfigured = Boolean(process.env.CRON_SECRET?.trim());
  checks.push({
    id: 'cron_secret',
    label: 'Vercel Cron (CRON_SECRET)',
    ok: cronConfigured || process.env.NODE_ENV !== 'production',
    detail: cronConfigured
      ? 'Tanımlı'
      : process.env.NODE_ENV === 'production'
        ? 'Üretimde zorunlu — Vercel ortam değişkeni ekleyin'
        : 'Geliştirme ortamında isteğe bağlı',
  });

  if (modules.trendyolSeller !== false) {
    const sellerId = String(doc.get('trendyolSellerId') ?? '').trim();
    const apiKey = String(doc.get('trendyolApiKey') ?? '').trim();
    const apiSecret = String(doc.get('trendyolApiSecret') ?? '').trim();
    checks.push({
      id: 'ty_credentials',
      label: 'Trendyol API kimlik bilgileri',
      ok: Boolean(sellerId && apiKey && apiSecret),
      detail:
        sellerId && apiKey && apiSecret
          ? 'Satıcı ID + Key + Secret kayıtlı'
          : 'Satıcı ID, API Key ve Secret eksik',
    });

    const webhookSecret = String(doc.get('trendyolWebhookSecret') ?? '').trim();
    checks.push({
      id: 'ty_webhook',
      label: 'Trendyol webhook token',
      ok: Boolean(webhookSecret),
      detail: webhookSecret ? 'Kayıtlı' : 'Kaydedince otomatik üretilir',
    });

    try {
      await getTrendyolSettings(tid);
      checks.push({
        id: 'ty_settings_parse',
        label: 'Trendyol ayarları okunabilir',
        ok: true,
      });
    } catch (e: unknown) {
      checks.push({
        id: 'ty_settings_parse',
        label: 'Trendyol ayarları okunabilir',
        ok: false,
        detail: e instanceof Error ? e.message : 'Ayar hatası',
      });
    }

    const wh = String(doc.get('trendyolDefaultWarehouseId') ?? 'main').trim() || 'main';
    const whDoc = await Warehouse.findOne({ warehouseId: wh }).lean();
    checks.push({
      id: 'ty_warehouse',
      label: 'Trendyol varsayılan depo',
      ok: Boolean(whDoc),
      detail: whDoc ? `${wh} — ${whDoc.name}` : `"${wh}" depo kaydı bulunamadı`,
    });
  }

  if (modules.webStoreApi !== false) {
    const webUrl = String(doc.get('webApiUrl') ?? '').trim();
    const webToken = String(doc.get('webApiToken') ?? '').trim();
    checks.push({
      id: 'store_api',
      label: 'Mağaza API (URL + token)',
      ok: Boolean(webUrl && webToken),
      detail:
        webUrl && webToken
          ? 'Taban URL ve token kayıtlı'
          : !webUrl
            ? 'Taban URL eksik'
            : 'Token eksik',
    });
  }

  if (modules.trendyolEfaturam !== false) {
    const taxId = String(doc.get('companyTaxId') ?? '').trim();
    const partnerUser = String(doc.get('efaturamPartnerUsername') ?? '').trim();
    const partnerPw = String(doc.get('efaturamPartnerPassword') ?? '').trim();
    checks.push({
      id: 'efaturam',
      label: 'E-Faturam + firma VKN',
      ok: Boolean(taxId && partnerUser && partnerPw),
      detail:
        taxId && partnerUser && partnerPw
          ? 'Temel E-Faturam alanları dolu'
          : 'VKN veya E-Faturam partner bilgileri eksik',
    });
  }

  const webhookSecret = String(doc.get('trendyolWebhookSecret') ?? '').trim();
  const webhookUrlHint =
    webhookSecret && origin
      ? `${origin.replace(/\/$/, '')}/api/trendyol/webhook/${webhookSecret}`
      : undefined;

  return {
    ok: checks.every((c) => c.ok),
    tenantId: tid,
    integrationModules: modules,
    checks,
    webhookUrlHint,
    cronConfigured,
  };
}
