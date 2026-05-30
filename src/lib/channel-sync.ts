import Product from '@/models/Product';
import { resolveSettingDocument } from '@/lib/erp-settings';
import { readStorePushSettings, resolveStorePushEndpoint } from '@/lib/store-endpoint';
import { loadIntegrationModulesEnabled } from '@/lib/integration-modules-server';
import { isIntegrationModuleEnabled } from '@/lib/integration-modules';
import { getTrendyolSettings, updateTrendyolStockAndPrice } from '@/lib/trendyol';
import { readProductTenantId } from '@/lib/tenant-query';
import { pushStockToWordPress } from '@/lib/wordpress-connector';

type ProductDoc = {
  _id: unknown;
  tenantId?: string;
  sku: string;
  name: string;
  barcode?: string;
  price: number;
  stock: number;
  hasVariants?: boolean;
  variants?: Array<{ sku: string; barcode: string; stock: number }>;
  platforms?: string[];
  prices?: { website?: number; trendyol?: number };
  integrations?: {
    trendyol?: { syncActive?: boolean; listingActive?: boolean };
    web?: { syncActive?: boolean };
    wordpress?: { syncActive?: boolean };
  };
};

export async function pushProductStockToChannels(
  productId: unknown,
  opts?: {
    skipTrendyol?: boolean;
    skipWeb?: boolean;
    skipWordpress?: boolean;
    tenantId?: string;
  }
): Promise<{ trendyol?: string; web?: string; wordpress?: string }> {
  const product = (await Product.findById(productId).exec()) as ProductDoc | null;
  if (!product) return {};

  const tenantId = opts?.tenantId ?? readProductTenantId(product);
  const result: { trendyol?: string; web?: string; wordpress?: string } = {};
  const platforms = product.platforms ?? [];
  const modules = await loadIntegrationModulesEnabled(tenantId);

  if (
    !opts?.skipTrendyol &&
    isIntegrationModuleEnabled(modules, 'trendyolSeller') &&
    platforms.includes('trendyol') &&
    product.integrations?.trendyol?.listingActive !== false &&
    product.integrations?.trendyol?.syncActive !== false
  ) {
    try {
      const settings = await getTrendyolSettings(tenantId);
      const listPrice = Math.max(0, Number(product.price) || 0);
      const tySale = Math.max(0, Number(product.prices?.trendyol) || listPrice);
      const items: Array<{
        barcode: string;
        quantity: number;
        salePrice: number;
        listPrice?: number;
      }> = [];

      if (product.hasVariants && product.variants?.length) {
        for (const v of product.variants) {
          const bc = String(v.barcode ?? '').trim();
          if (!bc) continue;
          items.push({
            barcode: bc,
            quantity: Math.max(0, Math.floor(Number(v.stock) || 0)),
            salePrice: tySale,
            listPrice,
          });
        }
      } else if (product.barcode) {
        items.push({
          barcode: String(product.barcode),
          quantity: Math.max(0, Math.floor(Number(product.stock) || 0)),
          salePrice: tySale,
          listPrice,
        });
      }

      if (items.length) {
        await updateTrendyolStockAndPrice(
          settings.sellerId,
          settings.apiKey,
          settings.apiSecret,
          items
        );
        result.trendyol = `${items.length} barkod güncellendi`;
      }
    } catch (e: unknown) {
      result.trendyol = e instanceof Error ? e.message : 'Trendyol gönderim hatası';
    }
  }

  if (
    !opts?.skipWeb &&
    isIntegrationModuleEnabled(modules, 'webStoreApi') &&
    platforms.includes('web') &&
    product.integrations?.web?.syncActive !== false
  ) {
    try {
      const doc = await resolveSettingDocument(tenantId);
      const storeSettings = readStorePushSettings(doc);
      const token = String(doc.get('webApiToken') ?? '').trim();
      const endpoint = resolveStorePushEndpoint(storeSettings);
      if (!storeSettings.webApiUrl && !storeSettings.webApiPushUrl) {
        result.web = 'Mağaza URL tanımlı değil';
      } else if (!token) {
        result.web = 'Mağaza API token tanımlı değil';
      } else {
        const listPrice = Math.max(0, Number(product.price) || 0);
        const webSale = Math.max(0, Number(product.prices?.website) || listPrice);
        const items: Array<{
          sku: string;
          barcode: string;
          salePrice: number;
          listPrice: number;
          stock: number;
        }> = [];

        if (product.hasVariants && product.variants?.length) {
          for (const v of product.variants) {
            const bc = String(v.barcode ?? '').trim();
            if (!bc) continue;
            items.push({
              sku: String(v.sku ?? product.sku),
              barcode: bc,
              salePrice: webSale,
              listPrice,
              stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
            });
          }
        } else if (product.barcode) {
          items.push({
            sku: String(product.sku),
            barcode: String(product.barcode),
            salePrice: webSale,
            listPrice,
            stock: Math.max(0, Math.floor(Number(product.stock) || 0)),
          });
        }

        if (items.length) {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ source: 'kanal-erp', items }),
            signal: AbortSignal.timeout(60_000),
          });
          if (!res.ok) {
            const text = await res.text();
            result.web = `HTTP ${res.status}: ${text.slice(0, 200)}`;
          } else {
            result.web = `${items.length} satır gönderildi`;
          }
        }
      }
    } catch (e: unknown) {
      result.web = e instanceof Error ? e.message : 'Mağaza gönderim hatası';
    }
  }

  if (
    !opts?.skipWordpress &&
    isIntegrationModuleEnabled(modules, 'wordpress') &&
    platforms.includes('wordpress') &&
    product.integrations?.wordpress?.syncActive !== false
  ) {
    try {
      const listPrice = Math.max(0, Number(product.price) || 0);
      const salePrice = Math.max(0, Number(product.prices?.website) || listPrice);
      const items: Array<{ sku: string; stock: number; salePrice: number; listPrice: number }> =
        [];

      if (product.hasVariants && product.variants?.length) {
        for (const v of product.variants) {
          const sku = String(v.sku ?? '').trim();
          if (!sku) continue;
          items.push({
            sku,
            stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
            salePrice,
            listPrice,
          });
        }
      } else if (product.sku) {
        items.push({
          sku: String(product.sku),
          stock: Math.max(0, Math.floor(Number(product.stock) || 0)),
          salePrice,
          listPrice,
        });
      }

      if (items.length) {
        const wp = await pushStockToWordPress(tenantId, items);
        result.wordpress = wp.ok ? wp.message : wp.message;
      }
    } catch (e: unknown) {
      result.wordpress = e instanceof Error ? e.message : 'WordPress gönderim hatası';
    }
  }

  return result;
}

export async function pushStockAfterOrder(
  product: ProductDoc,
  sourcePlatform: string
): Promise<void> {
  const tenantId = readProductTenantId(product);
  await pushProductStockToChannels(product._id, {
    skipTrendyol: sourcePlatform === 'trendyol',
    skipWeb: sourcePlatform === 'web',
    skipWordpress: sourcePlatform === 'wordpress',
    tenantId,
  });
}

function parseEnvBool(v: string | undefined): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function allowTrendyolOrderMock(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return parseEnvBool(process.env.TRENDYOL_ALLOW_ORDER_SYNC_MOCK);
}

import { isProductionEnv } from '@/lib/production-guard';
import { secureCompareStrings } from '@/lib/secure-compare';

export function verifyStoreWebhookSecret(request: Request): boolean {
  const expected = process.env.STORE_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return !isProductionEnv();
  }
  const header =
    request.headers.get('x-webhook-secret') ??
    request.headers.get('x-kanal-webhook-secret') ??
    '';
  return secureCompareStrings(header, expected);
}
