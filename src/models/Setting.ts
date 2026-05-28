import mongoose from 'mongoose';

const SettingSchema = new mongoose.Schema({
  settingsId: { type: String, default: 'global', unique: true },

  trendyolSellerId: { type: String, default: '' },
  trendyolApiKey: { type: String, default: '' },
  trendyolApiSecret: { type: String, default: '' },
  /** Trendyol ürün yayımlama — sayısal marka ID (zorunlu create API için) */
  trendyolBrandId: { type: Number, default: 0 },
  trendyolBrandName: { type: String, default: '' },
  /** pending | processing | shipped — stok düşüm eşiği */
  trendyolStockDeductAt: { type: String, default: 'processing' },
  /** Webhook URL son segmenti; boşsa otomatik üretilir */
  trendyolWebhookSecret: { type: String, default: '' },
  /** Sunucu tarafı otomatik sipariş senkronu (Vercel Cron) */
  trendyolAutoSyncEnabled: { type: Boolean, default: true },
  /** Otomatik senkron aralığı (dakika) */
  trendyolAutoSyncIntervalMinutes: { type: Number, default: 2 },
  /** Webhook sonrası poll atlama (saniye) */
  trendyolWebhookCoalesceSeconds: { type: Number, default: 180 },
  /** Webhook gelince kısa süre poll atla */
  trendyolWebhookCoalesceOrders: { type: Boolean, default: true },
  trendyolLastWebhookAt: { type: Date, default: null },
  trendyolLastAutoSyncAt: { type: Date, default: null },
  /** Trendyol görsel yayımlama — dışarıdan erişilebilir HTTPS taban (ör. Railway URL) */
  publicAppUrl: { type: String, default: '' },

  webApiUrl: { type: String, default: '' },
  webApiToken: { type: String, default: '' },
  /** Taban URL sonuna eklenir; varsayılan stock-price */
  webApiStockPath: { type: String, default: 'stock-price' },
  /** Doluysa taban+yol yerine doğrudan bu URL kullanılır (özel yazılım) */
  webApiPushUrl: { type: String, default: '' },

  storeName: { type: String, default: 'Stok ERP' },
  printPackageContents: { type: Boolean, default: true },

  /** Fatura başlığı (ERP / e-Arşiv entegrasyonu için) */
  companyLegalTitle: { type: String, default: '' },
  companyTaxId: { type: String, default: '' },
  companyTaxOffice: { type: String, default: '' },
  companyAddress: { type: String, default: '' },

  /** Müşteri portalı destek iletişim */
  portalSupportPhone: { type: String, default: '' },
  portalSupportEmail: { type: String, default: '' },
  portalWhatsapp: { type: String, default: '' },

  /** Herkese açık üye olma (kayıt) */
  authAllowSignup: { type: Boolean, default: true },
  /** Kayıt sonrası yönetici onayı gerekli */
  authRequireApproval: { type: Boolean, default: true },

  /** Finans simülatörü — varsayılan komisyon % */
  financeDefaultCommissionPct: { type: Number, default: 20 },
  /** E-ticaret stopaj oranı % (brüt satış üzerinden) */
  financeStopajRatePct: { type: Number, default: 1 },
  /** Sipariş başına sabit hizmet bedeli tahmini (₺) */
  financeServiceFeePerOrder: { type: Number, default: 0 },
  /** Ürün desi yoksa varsayılan */
  financeDefaultDesi: { type: Number, default: 1 },
  /** Ürün kargo fiyatı yoksa varsayılan sabit kargo (₺/adet) */
  financeDefaultCargoFee: { type: Number, default: 0 },
  /** KDV oranı (0.2 = %20) */
  financeVatRate: { type: Number, default: 0.2 },
  /** Desi barem → kargo ücreti (KDV dahil ₺) */
  cargoDesiTariff: [
    {
      maxDesi: { type: Number, required: true },
      fee: { type: Number, required: true },
    },
  ],
}, { timestamps: true });

export default mongoose.models.Setting || mongoose.model('Setting', SettingSchema);
