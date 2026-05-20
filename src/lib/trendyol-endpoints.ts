/**
 * Trendyol Satıcı entegrasyonu — resmi API referansı:
 * https://developers.trendyol.com/reference
 *
 * Temel host: https://api.trendyol.com/sapigw
 * Kimlik doğrulama: HTTP Basic (API Key : API Secret), User-Agent zorunlu.
 *
 * Aşağıdaki uç noktalar bu ERP’de kullanılmakta veya ihtiyaç halinde genişletilebilir.
 */
export const TRENDYOL_SAPIGW = 'https://api.trendyol.com/sapigw' as const;

/**
 * TR marketplace — onaylı ürün listesi ve ürün filtreleme (resmi dökümanda “apigw”).
 * @see https://developers.trendyol.com/docs (Ürün Filtreleme - Onaylı Ürün v2)
 */
export const TRENDYOL_PRODUCT_INTEGRATION =
  'https://apigw.trendyol.com/integration/product' as const;

/** TR sipariş paketleri (statü güncelleme, stream vb.) */
export const TRENDYOL_ORDER_INTEGRATION =
  'https://apigw.trendyol.com/integration/order' as const;

/** Stok & fiyat güncelleme (apigw) */
export const TRENDYOL_INVENTORY_INTEGRATION =
  'https://apigw.trendyol.com/integration/inventory' as const;

export const TRENDYOL_APIGW = 'https://apigw.trendyol.com' as const;

export const TrendyolEndpoints = {
  /** Kategori ağacı (apigw — resmi TR entegrasyon) */
  productCategoriesIntegration: () =>
    `${TRENDYOL_PRODUCT_INTEGRATION}/product-categories`,
  /** Kategori öznitelikleri (apigw) */
  categoryAttributesIntegration: (categoryId: number) =>
    `${TRENDYOL_PRODUCT_INTEGRATION}/product-categories/${categoryId}/attributes`,
  /** Kategori öznitelikleri V2 (apigw — değerler ayrı uç noktadan) */
  categoryAttributesV2: (categoryId: number) =>
    `${TRENDYOL_PRODUCT_INTEGRATION}/categories/${categoryId}/attributes`,
  /** Öznitelik değer listesi V2 */
  categoryAttributeValuesV2: (categoryId: number, attributeId: number) =>
    `${TRENDYOL_PRODUCT_INTEGRATION}/categories/${categoryId}/attributes/${attributeId}/values`,
  /** Kategori ağacı (sapigw yedek) */
  productCategories: () => `${TRENDYOL_SAPIGW}/product-categories`,
  /** Kategori öznitelikleri (beden, renk vb.) */
  categoryAttributes: (categoryId: number) =>
    `${TRENDYOL_SAPIGW}/product-categories/${categoryId}/attributes`,
  /** Eski/usule göre sapigw ürün listesi (yedek). */
  supplierProducts: (supplierId: string) =>
    `${TRENDYOL_SAPIGW}/suppliers/${encodeURIComponent(supplierId)}/products`,
  /** Onaylı ürün listesi TR (variants içerir). */
  supplierProductsApproved: (sellerId: string) =>
    `${TRENDYOL_PRODUCT_INTEGRATION}/sellers/${encodeURIComponent(sellerId)}/products/approved`,
  /** Ürün oluşturma (v2) */
  supplierProductsV2: (supplierId: string) =>
    `${TRENDYOL_SAPIGW}/suppliers/${supplierId}/v2/products`,
  /** Stok ve fiyat güncelleme */
  priceAndInventory: (supplierId: string) =>
    `${TRENDYOL_SAPIGW}/suppliers/${supplierId}/products/price-and-inventory`,
  /** Sipariş paketleri */
  supplierOrders: (supplierId: string) =>
    `${TRENDYOL_SAPIGW}/suppliers/${supplierId}/orders`,
  /** Paket statü bildirimi (Picking / Invoiced) */
  shipmentPackageUpdate: (sellerId: string, packageId: string) =>
    `${TRENDYOL_ORDER_INTEGRATION}/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${encodeURIComponent(packageId)}`,
  /** Ürün oluşturma (v1 — onay bekleyenler) */
  productCreate: (sellerId: string) =>
    `${TRENDYOL_PRODUCT_INTEGRATION}/sellers/${encodeURIComponent(sellerId)}/products`,
  /** Ürün oluşturma v2 (apigw) */
  productCreateV2: (sellerId: string) =>
    `${TRENDYOL_PRODUCT_INTEGRATION}/sellers/${encodeURIComponent(sellerId)}/v2/products`,
  /** Stok & fiyat (apigw) */
  priceAndInventoryIntegration: (sellerId: string) =>
    `${TRENDYOL_INVENTORY_INTEGRATION}/sellers/${encodeURIComponent(sellerId)}/products/price-and-inventory`,
  /** Marka adı ile arama */
  brandByName: () => `${TRENDYOL_PRODUCT_INTEGRATION}/brands/by-name`,
  /** Marka listesi / arama */
  brands: () => `${TRENDYOL_PRODUCT_INTEGRATION}/brands`,
} as const;
