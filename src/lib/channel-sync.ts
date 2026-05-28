import Product from '@/models/Product';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import { readStorePushSettings, resolveStorePushEndpoint } from '@/lib/store-endpoint';
import {
  getTrendyolSettings,
  updateTrendyolStockAndPrice,
} from '@/lib/trendyol';

type ProductDoc = {
  _id: unknown;
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
    trendyol?: { syncActive?: boolean };
    web?: { syncActive?: boolean };
  };
};

export async function pushProductStockToChannels(
  productId: unknown,
  opts?: { skipTrendyol?: boolean; skipWeb?: boolean }
): Promise<{ trendyol?: string; web?: string }> {
  const product = (await Product.findById(productId).exec()) as ProductDoc | null;
  if (!product) return {};

  const result: { trendyol?: string; web?: string } = {};
  const platforms = product.platforms ?? [];

  if (
    !opts?.skipTrendyol &&
    platforms.includes('trendyol') &&
    product.integrations?.trendyol?.syncActive !== false
  ) {
    try {
      const settings = await getTrendyolSettings();
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
      result.trendyol =
        e instanceof Error ? e.message : 'Trendyol gönderim hatası';
    }
  }

  if (
    !opts?.skipWeb &&
    platforms.includes('web') &&
    product.integrations?.web?.syncActive !== false
  ) {
    try {
      const doc = await resolveSingletonSettingDocument();
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

  return result;
}

export async function pushStockAfterOrder(
  product: ProductDoc,
  sourcePlatform: string
): Promise<void> {
  await pushProductStockToChannels(product._id, {
    skipTrendyol: sourcePlatform === 'trendyol',
    skipWeb: sourcePlatform === 'web',
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
