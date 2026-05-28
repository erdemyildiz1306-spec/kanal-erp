import axios from 'axios';
import connectToDatabase from './mongodb';
import { resolveSingletonSettingDocument } from './erp-settings';
import {
  parseCategoryAttributeFields,
  parseCategoryAttributeValueRows,
} from './trendyol-attributes';
import {
  TRENDYOL_SAPIGW,
  TrendyolEndpoints,
} from './trendyol-endpoints';

/** @see https://developers.trendyol.com/reference — SAP Gateway host */
const TRENDYOL_API_BASE = TRENDYOL_SAPIGW;

export { TrendyolEndpoints };

const PRODUCT_ARRAY_KEYS = [
  'content',
  'items',
  'data',
  'products',
  'productList',
  'productDTOList',
  'approvedProducts',
  'results',
  'records',
  'list',
  'rows',
] as const;

function objectOnlyRows(arr: unknown[]): Record<string, unknown>[] {
  return arr.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
}

/** Yardımcı: API yanıtından ürün listesini çıkarır (Spring `content`, `items`, iç içe `data` vb.). */
export function extractProductsPayload(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return objectOnlyRows(data);
  if (!data || typeof data !== 'object') return [];
  const o = data as Record<string, unknown>;

  const asArr = (v: unknown): Record<string, unknown>[] | null =>
    Array.isArray(v) ? objectOnlyRows(v as unknown[]) : null;

  for (const key of PRODUCT_ARRAY_KEYS) {
    const hit = asArr(o[key]);
    if (hit?.length) return hit;
  }

  /** Yaygın sarıcılar: tek seviye içeriği yeniden tara */
  for (const wrap of [
    'data',
    'payload',
    'response',
    'body',
    'result',
    'model',
    '_embedded',
  ] as const) {
    const inner = o[wrap];
    if (inner != null && inner !== data) {
      const nested = extractProductsPayload(inner);
      if (nested.length) return nested;
    }
  }

  const nestedData = o.data;
  if (nestedData && typeof nestedData === 'object') {
    const d = nestedData as Record<string, unknown>;
    for (const key of PRODUCT_ARRAY_KEYS) {
      const hit = asArr(d[key]);
      if (hit?.length) return hit;
    }
  }

  const result = o.result;
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    for (const key of PRODUCT_ARRAY_KEYS) {
      const hit = asArr(r[key]);
      if (hit?.length) return hit;
    }
  }

  return [];
}

/** Boş çekimde teşhis: yanıt yapısı */
export function inspectTrendyolListResponse(data: unknown): {
  keys: string[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  extractedLength: number;
} {
  const keys = data && typeof data === 'object' ? Object.keys(data as object) : [];
  let totalElements: number | undefined;
  let totalPages: number | undefined;
  let page: number | undefined;
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.totalElements === 'number') totalElements = o.totalElements;
    if (typeof o.totalPages === 'number') totalPages = o.totalPages;
    if (typeof o.page === 'number') page = o.page;
  }
  return {
    keys,
    totalElements,
    totalPages,
    page,
    extractedLength: extractProductsPayload(data).length,
  };
}

// Trendyol API'ye istek atmak için Authorization Header oluşturur
/** Trendyol: entegratör adı en fazla 30 alfanumerik karakter; self-integration → SelfIntegration */
function resolveTrendyolIntegratorName(): string {
  const fromEnv = String(process.env.TRENDYOL_INTEGRATOR_NAME ?? '').trim();
  const raw = fromEnv || 'SelfIntegration';
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30);
  return cleaned || 'SelfIntegration';
}

export function buildTrendyolUserAgent(sellerId: string): string {
  const sid = String(sellerId ?? '').trim();
  const integrator = resolveTrendyolIntegratorName();
  return `${sid} - ${integrator}`;
}

export function getTrendyolAuthHeader(
  apiKey: string,
  apiSecret: string,
  sellerId?: string
) {
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const sid = String(sellerId ?? '').trim();
  return {
    Authorization: `Basic ${credentials}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': buildTrendyolUserAgent(sid),
  };
}

/** Marka listesi / arama — Trendyol storeFrontCode zorunlu (TR) */
export function getTrendyolBrandHeaders(
  apiKey: string,
  apiSecret: string,
  sellerId?: string
) {
  return {
    ...getTrendyolAuthHeader(apiKey, apiSecret, sellerId),
    storeFrontCode: 'TR',
  };
}

/** Ayarlardan veya formdan gelen marka ID değerini sayıya çevirir */
export function parseTrendyolBrandId(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  const s = String(raw).trim();
  if (!s) return 0;
  const digits = s.replace(/\D/g, '');
  if (digits) {
    const n = Number(digits);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  const plain = Number(s.replace(/\s/g, ''));
  if (Number.isFinite(plain) && plain > 0) return Math.floor(plain);
  return 0;
}

/** Ürün yazma (create/update) — apigw V2 için Supplier ID header */
export function getTrendyolProductWriteHeaders(
  apiKey: string,
  apiSecret: string,
  sellerId: string
) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    throw new Error('Trendyol Satıcı ID eksik.');
  }
  return {
    ...getTrendyolAuthHeader(apiKey, apiSecret, sid),
    'X-Supplier-Id': sid,
    storeFrontCode: 'TR',
  };
}

function isTrendyolHtmlBody(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  const t = data.trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html') || t.includes('<html');
}

function assertTrendyolJsonResponse(
  response: { status: number; data: unknown; headers: Record<string, unknown> },
  endpointLabel: string
): void {
  const ct = String(response.headers['content-type'] ?? '').toLowerCase();
  if (isTrendyolHtmlBody(response.data) || ct.includes('text/html')) {
    throw new Error(
      `Trendyol «${endpointLabel}» HTML sayfa döndürdü (JSON değil). Bu adres ürün oluşturma için uygun olmayabilir.`
    );
  }
}

function extractTrendyolErrorDetail(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') {
    const t = data.trim();
    if (t.startsWith('<!DOCTYPE') || t.startsWith('<html')) {
      return 'Trendyol HTML yanıt döndü — ürün yayımlama uç noktası reddedildi. Sayfayı yenileyip tekrar deneyin; sorun sürerse Ayarlar > Trendyol Satıcı ID’yi kontrol edin.';
    }
    return t.length > 480 ? `${t.slice(0, 480)}…` : t;
  }
  if (typeof data !== 'object') return '';
  const o = data as Record<string, unknown>;

  if (Array.isArray(o.errors) && o.errors.length) {
    const parts = o.errors.slice(0, 6).map((row) => {
      if (typeof row === 'string') return row.trim();
      if (!row || typeof row !== 'object') return '';
      const e = row as Record<string, unknown>;
      const msg = String(e.message ?? e.detail ?? e.errorMessage ?? e.reason ?? '').trim();
      const key = String(e.key ?? e.field ?? e.barcode ?? e.attributeId ?? '').trim();
      if (key && msg) return `${key}: ${msg}`;
      return msg || key || JSON.stringify(e).slice(0, 120);
    });
    const joined = parts.filter(Boolean).join(' · ');
    if (joined) return joined;
  }

  if (Array.isArray(o.validationErrors) && o.validationErrors.length) {
    return o.validationErrors
      .slice(0, 6)
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
      .join(' · ');
  }

  if (o.error && typeof o.error === 'object') {
    const e = o.error as Record<string, unknown>;
    const title = String(e.title ?? '').trim();
    const detail = String(e.detail ?? e.message ?? '').trim();
    if (title && detail) return `${title}: ${detail}`;
    if (title || detail) return title || detail;
  }
  for (const key of ['message', 'exception', 'detail', 'title', 'errorMessage']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  try {
    const compact = JSON.stringify(o);
    if (compact && compact !== '{}' && compact.length < 500) return compact;
  } catch {
    /* ignore */
  }
  return '';
}

function formatTrendyolHttpFailure(status: number, data: unknown, label?: string): string {
  const parsed = extractTrendyolErrorDetail(data);
  const prefix = label ? `[${label}] ` : '';
  if (parsed) return `${prefix}HTTP ${status}: ${parsed}`;
  return `${prefix}HTTP ${status}`;
}

function throwTrendyolHttpError(status: number, data: unknown, label?: string): never {
  const err = new Error(formatTrendyolHttpFailure(status, data, label)) as Error & {
    response?: { status: number; data: unknown };
  };
  err.response = { status, data };
  throw err;
}

/** UI / toast için kısa Trendyol hata metni */
export function formatTrendyolErrorShort(error: unknown): string {
  const full = formatTrendyolAxiosError(error);
  const firstLine = full.split('\n')[0]?.trim() ?? full;
  return firstLine.length > 220 ? `${firstLine.slice(0, 220)}…` : firstLine;
}

async function trendyolRequestWithFallback(
  primary: { method: 'post' | 'put'; url: string; data: unknown; headers: Record<string, string> },
  fallback?: { method: 'post' | 'put'; url: string; data: unknown; headers: Record<string, string> }
) {
  try {
    const r =
      primary.method === 'post'
        ? await axios.post(primary.url, primary.data, { headers: primary.headers })
        : await axios.put(primary.url, primary.data, { headers: primary.headers });
    if (r.status >= 400 && fallback) {
      const fb =
        fallback.method === 'post'
          ? await axios.post(fallback.url, fallback.data, { headers: fallback.headers })
          : await axios.put(fallback.url, fallback.data, { headers: fallback.headers });
      if (fb.status >= 400) {
        const err = new Error(`HTTP ${fb.status}`) as Error & {
          response?: { status: number; data: unknown };
        };
        err.response = { status: fb.status, data: fb.data };
        throw err;
      }
      return fb;
    }
    if (r.status >= 400) {
      const err = new Error(`HTTP ${r.status}`) as Error & { response?: { status: number; data: unknown } };
      err.response = { status: r.status, data: r.data };
      throw err;
    }
    return r;
  } catch (e: unknown) {
    if (
      axios.isAxiosError(e) &&
      fallback &&
      (e.response?.status === 404 || e.response?.status === 403)
    ) {
      return fallback.method === 'post'
        ? await axios.post(fallback.url, fallback.data, { headers: fallback.headers })
        : await axios.put(fallback.url, fallback.data, { headers: fallback.headers });
    }
    throw e;
  }
}

/** Axios hatasını kullanıcı / log için okunabilir metne çevirir. */
export function formatTrendyolAxiosError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const parsed = extractTrendyolErrorDetail(error.response?.data);

    if (status === 403) {
      return (
        parsed ||
        'Trendyol erişim reddedildi (403). Sipariş çekme çalışıyorsa API bilgileri doğrudur; ürün yayımlama farklı uç nokta kullanır — güncelleme sonrası tekrar deneyin. Öznitelik/kategori alanlarını da kontrol edin.'
      );
    }
    if (status === 401) {
      return (
        parsed ||
        'Trendyol kimlik doğrulama hatası (401). API Key / Secret yanlış veya satıcı ID eşleşmiyor.'
      );
    }
    if (status === 429) {
      return parsed || 'Trendyol istek limiti aşıldı (429). Birkaç saniye bekleyip tekrar deneyin.';
    }

    if (parsed) {
      return status ? `HTTP ${status}: ${parsed}` : parsed;
    }

    const base = error.message || (status ? `HTTP ${status}` : 'İstek başarısız');
    return base;
  }

  const withResponse = error as Error & { response?: { status?: number; data?: unknown } };
  if (withResponse?.response?.status) {
    return formatTrendyolHttpFailure(
      withResponse.response.status,
      withResponse.response.data
    );
  }

  return error instanceof Error ? error.message : String(error);
}

/**
 * Kayıt sıfır geldiğinde: onaylı ve sapigw liste uçlarına tek sayfa istek —
 * yanıt anahtarları + totalElements (ücretsiz destek teşhisi, sır sızmaz)
 */
export async function probeTrendyolProductListEndpoints(
  sellerId: string,
  apiKey: string,
  apiSecret: string
): Promise<{
  approved: Record<string, unknown>;
  legacy: Record<string, unknown>;
}> {
  const headers = getTrendyolAuthHeader(apiKey, apiSecret, sellerId);
  const approvedUrl = TrendyolEndpoints.supplierProductsApproved(sellerId);
  const legacyUrl = `${TRENDYOL_API_BASE}/suppliers/${encodeURIComponent(sellerId)}/products`;

  const approved: Record<string, unknown> = {};
  try {
    const supplierNum = Number(sellerId);
    const r = await axios.get<unknown>(approvedUrl, {
      headers,
      params: {
        supplierId: Number.isFinite(supplierNum) ? supplierNum : sellerId,
        page: 0,
        size: 20,
      },
      timeout: 60_000,
    });
    const ins = inspectTrendyolListResponse(r.data);
    approved.httpStatus = r.status;
    approved.responseKeys = ins.keys.slice(0, 28);
    approved.totalElements = ins.totalElements;
    approved.totalPages = ins.totalPages;
    approved.extractedLength = ins.extractedLength;
    approved.pageField = ins.page;
  } catch (e: unknown) {
    approved.error = formatTrendyolAxiosError(e);
  }

  const legacy: Record<string, unknown> = {};
  try {
    const r = await axios.get<unknown>(legacyUrl, {
      headers,
      params: { page: 0, size: 20 },
      timeout: 60_000,
    });
    const ins = inspectTrendyolListResponse(r.data);
    legacy.httpStatus = r.status;
    legacy.responseKeys = ins.keys.slice(0, 28);
    legacy.totalElements = ins.totalElements;
    legacy.totalPages = ins.totalPages;
    legacy.extractedLength = ins.extractedLength;
  } catch (e: unknown) {
    legacy.error = formatTrendyolAxiosError(e);
  }

  return { approved, legacy };
}

function coerceNumberFlexible(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Göreli yol veya host’sız parça → tam https URL (Trendyol CDN) */
function trendyolImagePathToUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return `https:${u}`;
  const p = u.startsWith('/') ? u : `/${u}`;
  return `https://cdn.dsmcdn.com${p}`;
}

/** Onaylı ürün görsel dizisi → tam URL dizisi (CDN öneki ile) */
export function normalizeTrendyolImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const out: string[] = [];
  for (const im of images) {
    let raw = '';
    if (typeof im === 'string') {
      raw = im.trim();
    } else if (im && typeof im === 'object') {
      const o = im as Record<string, unknown>;
      raw = String(
        o.url ??
          o.imageUrl ??
          o.path ??
          o.fullUrl ??
          o.href ??
          o.src ??
          o.picture ??
          o.cdnUrl ??
          ''
      ).trim();
    }
    if (!raw) continue;
    const u = trendyolImagePathToUrl(raw);
    if (!u) continue;
    if (!out.includes(u)) out.push(u);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Trendyol ürün/varyant objesindeki tüm bilinen görsel alanlarını birleştirir.
 * API bazen `images`, bazen `productImages`, tek string `imageUrl` vb. döner.
 */
export function extractTrendyolProductImageUrls(
  item: Record<string, unknown>
): string[] {
  const buckets: unknown[] = [];

  const push = (v: unknown) => {
    if (v == null) return;
    if (Array.isArray(v)) buckets.push(...v);
    else buckets.push(v);
  };

  push(item.images);
  push(item.productImages);
  push(item.mediaItems);
  push(item.pictures);
  push(item.productMediaItems);

  const content = item.content;
  if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>;
    push(c.images);
    push(c.mediaItems);
  }

  for (const key of [
    'imageUrl',
    'thumbnail',
    'coverImageUrl',
    'mainImageUrl',
    'productMainImageUrl',
  ] as const) {
    const s = item[key];
    if (typeof s === 'string' && s.trim()) {
      buckets.push({ url: s.trim() });
    }
  }

  return normalizeTrendyolImageUrls(buckets);
}

/** Onaylı ürün varyantından beden/renk vb. etiketleri oku */
export function extractTrendyolVariantLabels(vr: Record<string, unknown>): {
  sizeLabel: string;
  colorLabel: string;
} {
  let sizeLabel = '';
  let colorLabel = '';

  const setIf = (v: unknown, target: 'size' | 'color') => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (!t) return;
    if (target === 'size') sizeLabel = t;
    else colorLabel = t;
  };

  setIf(vr.size, 'size');
  setIf(vr.sizeName, 'size');
  setIf(vr.shoeSize, 'size');
  setIf(vr.dimension1, 'size');
  setIf(vr.color, 'color');
  setIf(vr.colorName, 'color');

  const attrSrc =
    vr.attributes ??
    vr.variantAttributes ??
    vr.merchantVariantAttributes ??
    vr.variantProperty ??
    vr.properties;
  const lists = Array.isArray(attrSrc) ? attrSrc : attrSrc ? [attrSrc] : [];
  for (const raw of lists) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    const name = String(
      a.attributeName ?? a.name ?? a.key ?? a.attributeKey ?? ''
    ).toLowerCase();
    const val = String(
      a.attributeValue ?? a.value ?? a.attributeValueText ?? ''
    ).trim();
    if (!val) continue;
    if (/(beden|size|boy|numara|yaş|length|ebat|ölç)/i.test(name)) {
      if (!sizeLabel) sizeLabel = val;
    } else if (/(renk|color|colour)/i.test(name)) {
      if (!colorLabel) colorLabel = val;
    }
  }

  return { sizeLabel, colorLabel };
}

/** Varyant stok miktarını Trendyol modellerinden oku */
function readApprovedVariantQuantity(vr: Record<string, unknown>): number {
  const st = vr.stock;
  if (st && typeof st === "object") {
    const o = st as Record<string, unknown>;
    const fromQty = coerceNumberFlexible(
      o.quantity ?? o.availableQuantity ?? o.supplierQuantity
    );
    if (fromQty !== null) return Math.max(0, Math.floor(fromQty));
  }
  const direct = coerceNumberFlexible(
    vr.quantity ??
      vr.availableStock ??
      vr.supplierQuantity ??
      vr.inventoryQuantity ??
      vr.stockQuantity
  );
  if (direct !== null) return Math.max(0, Math.floor(direct));
  return 0;
}

/** Varyant veya düz (tek SKU) ürün kaydından fiyat okur — sapigw / ihracat modelleri dahil */
function readRootSaleListPrice(item: Record<string, unknown>): {
  salePrice: number;
  listPrice: number;
} {
  let salePrice = 0;
  let listPrice = 0;
  const pr = item.price;
  if (pr && typeof pr === 'object') {
    const p = pr as Record<string, unknown>;
    salePrice = Number(p.salePrice ?? 0) || 0;
    listPrice = Number(p.listPrice ?? 0) || 0;
  }
  if (!salePrice) {
    salePrice =
      Number(
        item.salePrice ??
          item.listPrice ??
          item.rrpPrice ??
          item.buyingPrice ??
          0
      ) || 0;
  }
  if (!listPrice) {
    listPrice =
      Number(item.listPrice ?? item.salePrice ?? item.rrpPrice ?? salePrice) ||
      0;
  }
  if (!salePrice && listPrice) salePrice = listPrice;
  if (!listPrice && salePrice) listPrice = salePrice;
  return { salePrice, listPrice };
}

export function flattenApprovedProductContent(
  content: Record<string, unknown>[]
): Record<string, unknown>[] {
  const flat: Record<string, unknown>[] = [];

  for (const item of content) {
    const title = String(item.title ?? item.name ?? 'İsimsiz ürün').trim();
    const description = String(item.description ?? '').trim();

    let categoryName = '';
    let categoryIdNum: number | undefined;
    const cat = item.category;
    if (cat && typeof cat === 'object') {
      const c = cat as Record<string, unknown>;
      categoryName = String(c.name ?? '').trim();
      const cid = c.id;
      if (typeof cid === 'number' && Number.isFinite(cid)) categoryIdNum = cid;
      else if (cid != null && String(cid).trim() !== '') {
        const n = Number(cid);
        if (Number.isFinite(n)) categoryIdNum = n;
      }
    }

    const productMainId = String(item.productMainId ?? '').trim();
    const cidRaw = item.contentId;
    const contentId =
      cidRaw !== null && cidRaw !== undefined ? String(cidRaw) : '';

    const variants = Array.isArray(item.variants) ? item.variants : [];
    const fromProduct = extractTrendyolProductImageUrls(item);
    const fromVariants: string[] = [];
    for (const v of variants) {
      if (!v || typeof v !== 'object') continue;
      fromVariants.push(...extractTrendyolProductImageUrls(v as Record<string, unknown>));
    }
    const imageUrls = [...new Set([...fromProduct, ...fromVariants])].slice(0, 12);

    if (variants.length === 0) {
      const barcodeRoot = String(
        item.barcode ?? item.sellerBarcode ?? item.gtin ?? ''
      ).trim();
      const stockRoot = String(
        item.stockCode ?? item.merchantSku ?? item.sku ?? ''
      ).trim();
      const hasRootSku = !!(
        barcodeRoot ||
        stockRoot ||
        productMainId ||
        contentId
      );
      if (hasRootSku) {
        const { sizeLabel, colorLabel } = extractTrendyolVariantLabels(item);
        const quantity = readApprovedVariantQuantity(item);
        const { salePrice, listPrice } = readRootSaleListPrice(item);
        flat.push({
          title,
          description,
          categoryName,
          categoryId: categoryIdNum,
          productMainId,
          contentId,
          barcode: barcodeRoot,
          merchantSku: stockRoot || productMainId || barcodeRoot,
          stockCode: stockRoot || productMainId || barcodeRoot,
          salePrice,
          listPrice,
          quantity,
          tyFlatImageUrls: imageUrls,
          sizeLabel,
          colorLabel,
        });
      }
      continue;
    }

    for (const v of variants) {
      if (!v || typeof v !== 'object') continue;
      const vr = v as Record<string, unknown>;
      const barcode = String(vr.barcode ?? '').trim();
      const stockCode = String(vr.stockCode ?? '').trim();
      const { sizeLabel, colorLabel } = extractTrendyolVariantLabels(vr);

      const quantity = readApprovedVariantQuantity(vr);
      let salePrice = 0;
      let listPrice = 0;
      const pr = vr.price;
      if (pr && typeof pr === 'object') {
        const p = pr as Record<string, unknown>;
        salePrice = Number(p.salePrice ?? 0) || 0;
        listPrice = Number(p.listPrice ?? 0) || 0;
      }
      if (!salePrice && listPrice) salePrice = listPrice;
      if (!listPrice && salePrice) listPrice = salePrice;

      flat.push({
        title,
        description,
        categoryName,
        categoryId: categoryIdNum,
        productMainId,
        contentId,
        barcode,
        merchantSku: stockCode || productMainId,
        stockCode: stockCode || productMainId,
        salePrice,
        listPrice,
        quantity,
        tyFlatImageUrls: imageUrls,
        sizeLabel,
        colorLabel,
      });
    }
  }

  return flat;
}

async function fetchTrendyolApprovedProductsPaged(
  sellerId: string,
  apiKey: string,
  apiSecret: string
): Promise<Record<string, unknown>[]> {
  const headers = getTrendyolAuthHeader(apiKey, apiSecret, sellerId);
  const url = TrendyolEndpoints.supplierProductsApproved(sellerId);
  const size = 100;
  const allFlat: Record<string, unknown>[] = [];
  const supplierNum = Number(sellerId);

  for (let page = 0; page < 500; page++) {
    const { data } = await axios.get<unknown>(url, {
      headers,
      params: {
        supplierId: Number.isFinite(supplierNum) ? supplierNum : sellerId,
        page,
        size,
      },
      timeout: 90_000,
    });

    const chunk = extractProductsPayload(data);
    allFlat.push(...flattenApprovedProductContent(chunk));

    const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const totalPages =
      typeof body?.totalPages === 'number' ? body.totalPages : undefined;

    if (!chunk.length) break;
    if (totalPages !== undefined && page >= totalPages - 1) break;
    if (chunk.length < size) break;
  }

  return allFlat;
}

async function fetchTrendyolProductsLegacySapigw(
  sellerId: string,
  apiKey: string,
  apiSecret: string
): Promise<Record<string, unknown>[]> {
  const headers = getTrendyolAuthHeader(apiKey, apiSecret, sellerId);
  const legacyUrl = `${TRENDYOL_API_BASE}/suppliers/${encodeURIComponent(sellerId)}/products`;
  const size = 100;
  const all: Record<string, unknown>[] = [];

  for (let page = 0; page < 100; page++) {
    const { data } = await axios.get<unknown>(legacyUrl, {
      headers,
      params: { page, size },
      timeout: 60_000,
    });

    const chunk = extractProductsPayload(data);
    all.push(...flattenApprovedProductContent(chunk));

    const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const totalPages =
      typeof body?.totalPages === 'number' ? body.totalPages : undefined;
    const isLast = body?.last === true;

    if (!chunk.length || isLast) break;
    if (totalPages !== undefined && page >= totalPages - 1) break;
    if (chunk.length < size) break;
  }

  return all;
}

// Yardımcı fonksiyon: Veritabanından Trendyol ayarlarını çeker
export async function getTrendyolSettings() {
  const doc = await resolveSingletonSettingDocument();
  const sid = String(doc.get('trendyolSellerId') ?? '').trim();
  const apiKey = String(doc.get('trendyolApiKey') ?? '').trim();
  const apiSecret = String(doc.get('trendyolApiSecret') ?? '').trim();
  if (!sid || !apiKey || !apiSecret) {
    throw new Error(
      'Trendyol için satıcı ID, API Key ve API Secret gereklidir. Ayarlar > Trendyol’da hepsini kaydedin (anahtarlar GET ile görünmez; değiştirmek için yeniden yazın).'
    );
  }
  const brandId = parseTrendyolBrandId(doc.get('trendyolBrandId'));
  const brandName = String(doc.get('trendyolBrandName') ?? '').trim();
  const stockDeductAt = String(doc.get('trendyolStockDeductAt') ?? 'processing').trim() || 'processing';
  const webhookSecret = String(doc.get('trendyolWebhookSecret') ?? '').trim();
  return { sellerId: sid, apiKey, apiSecret, brandId, brandName, stockDeductAt, webhookSecret };
}

/** Trendyol marka adından sayısal brandId çöz; bulunursa ayarlara yazar */
export async function resolveTrendyolBrandId(settings: Awaited<ReturnType<typeof getTrendyolSettings>>): Promise<number> {
  const directId = parseTrendyolBrandId(settings.brandId);
  if (directId > 0) return directId;

  const name = settings.brandName.trim();
  if (!name) {
    throw new Error(
      'Trendyol marka ID sunucuda kayıtlı değil. Ayarlar > Trendyol bölümünde sayısal Marka ID yazın (Trendyol panelindeki marka numarası) veya Marka adını girip «Ayarları Kaydet» deyin — yalnızca tarayıcıda görünen değer yeterli değildir.'
    );
  }

  const headers = getTrendyolBrandHeaders(settings.apiKey, settings.apiSecret, settings.sellerId);
  const id = await lookupTrendyolBrandIdByName(name, headers);
  if (!id) {
    throw new Error(
      `Trendyol marka bulunamadı: «${name}». Ayarlar > Trendyol’da Marka ID’yi (sayı) doğrudan yazın ve kaydedin.`
    );
  }

  try {
    const doc = await resolveSingletonSettingDocument();
    doc.set('trendyolBrandId', id);
    if (!String(doc.get('trendyolBrandName') ?? '').trim()) {
      doc.set('trendyolBrandName', name);
    }
    if (doc.isModified()) await doc.save();
  } catch {
    /* marka çözüldü; kalıcı yazma isteğe bağlı */
  }

  return id;
}

/** Ayar kaydından marka ID yoksa Trendyol API ile çözüp yazar */
export async function ensureTrendyolBrandOnSettings(): Promise<{
  brandId: number;
  brandName: string;
  resolvedFromName: boolean;
}> {
  const settings = await getTrendyolSettings();
  const existingId = parseTrendyolBrandId(settings.brandId);
  if (existingId > 0) {
    return {
      brandId: existingId,
      brandName: settings.brandName,
      resolvedFromName: false,
    };
  }
  const id = await resolveTrendyolBrandId(settings);
  return {
    brandId: id,
    brandName: settings.brandName,
    resolvedFromName: true,
  };
}

function extractBrandRows(data: unknown): Array<{ id: number; name?: string }> {
  const out: Array<{ id: number; name?: string }> = [];
  const pushRow = (row: unknown) => {
    if (!row || typeof row !== 'object') return;
    const o = row as Record<string, unknown>;
    const id = Number(o.id ?? o.brandId ?? o.brand_id);
    if (!Number.isFinite(id) || id <= 0) return;
    out.push({
      id,
      name: String(o.name ?? o.brandName ?? '').trim() || undefined,
    });
  };

  if (Array.isArray(data)) {
    for (const row of data) pushRow(row);
    return out;
  }
  if (!data || typeof data !== 'object') return out;
  const root = data as Record<string, unknown>;
  for (const key of ['brands', 'content', 'items', 'data'] as const) {
    const hit = root[key];
    if (Array.isArray(hit)) {
      for (const row of hit) pushRow(row);
    }
  }
  if (out.length === 0 && (root.id != null || root.brandId != null)) {
    pushRow(root);
  }
  return out;
}

async function lookupTrendyolBrandIdByName(
  name: string,
  headers: Record<string, string>
): Promise<number> {
  const q = name.trim();
  if (!q) return 0;

  const attempts: Array<{ url: string; params?: Record<string, string | number> }> = [
    { url: TrendyolEndpoints.brandByName(), params: { name: q } },
    { url: TrendyolEndpoints.brands(), params: { name: q, page: 0, size: 1000 } },
    { url: TrendyolEndpoints.brands(), params: { page: 0, size: 1000 } },
  ];

  const norm = (s: string) =>
    s.trim().toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const target = norm(q);

  for (const attempt of attempts) {
    try {
      const resp = await axios.get<unknown>(attempt.url, {
        headers,
        params: attempt.params,
        timeout: 30_000,
      });
      const rows = extractBrandRows(resp.data);
      const exact = rows.find((r) => r.name && norm(r.name) === target);
      if (exact) return exact.id;
      if (rows.length === 1 && attempt.url.includes('by-name')) return rows[0]!.id;
      const partial = rows.find((r) => r.name && norm(r.name).includes(target));
      if (partial && attempt.url.includes('by-name')) return partial.id;
    } catch {
      /* sonraki uç nokta */
    }
  }

  return 0;
}

async function trendyolGetFirstOk(urls: string[], headers: Record<string, string>) {
  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await axios.get(url, { headers, timeout: 60_000 });
      return response.data;
    } catch (e: unknown) {
      lastError = e;
    }
  }
  throw lastError;
}

// Trendyol Kategori Ağacını Çeker
export async function fetchTrendyolCategories() {
  const settings = await getTrendyolSettings();
  const headers = getTrendyolAuthHeader(
    settings.apiKey,
    settings.apiSecret,
    settings.sellerId
  );
  try {
    return await trendyolGetFirstOk(
      [
        TrendyolEndpoints.productCategoriesIntegration(),
        TrendyolEndpoints.productCategories(),
      ],
      headers
    );
  } catch (error) {
    console.error('Trendyol kategori çekme hatası:', error);
    throw error;
  }
}

// Kategori Özelliklerini Çeker (Beden, Renk vb.)
export async function fetchTrendyolCategoryAttributes(categoryId: number) {
  const settings = await getTrendyolSettings();
  const headers = getTrendyolAuthHeader(
    settings.apiKey,
    settings.apiSecret,
    settings.sellerId
  );
  try {
    return await trendyolGetFirstOk(
      [
        TrendyolEndpoints.categoryAttributesV2(categoryId),
        TrendyolEndpoints.categoryAttributesIntegration(categoryId),
        TrendyolEndpoints.categoryAttributes(categoryId),
      ],
      headers
    );
  } catch (error) {
    console.error(`Trendyol kategori (${categoryId}) öznitelik hatası:`, error);
    throw error;
  }
}

async function fetchTrendyolCategoryAttributeValuesPaged(
  categoryId: number,
  attributeId: number,
  headers: Record<string, string>
): Promise<Array<{ id: number; name: string }>> {
  const url = TrendyolEndpoints.categoryAttributeValuesV2(categoryId, attributeId);
  const all: Array<{ id: number; name: string }> = [];

  for (let page = 0; page < 100; page++) {
    const { data } = await axios.get<unknown>(url, {
      headers,
      params: { page, size: 1000 },
      timeout: 60_000,
    });
    const chunk = parseCategoryAttributeValueRows(data);
    all.push(...chunk);

    const body =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const totalPages =
      typeof body?.totalPages === 'number' ? body.totalPages : undefined;
    if (!chunk.length) break;
    if (totalPages !== undefined && page >= totalPages - 1) break;
    if (chunk.length < 1000) break;
  }

  return all;
}

/** Öznitelik meta + V2 değer listeleri (Trendyol paneli ile uyumlu form) */
export async function fetchTrendyolCategoryFieldsWithValues(categoryId: number) {
  const settings = await getTrendyolSettings();
  const headers = getTrendyolAuthHeader(
    settings.apiKey,
    settings.apiSecret,
    settings.sellerId
  );

  const raw = await fetchTrendyolCategoryAttributes(categoryId);
  const fields = parseCategoryAttributeFields(raw);

  const toLoad = fields.filter((f) => f.values.length === 0);
  const batchSize = 6;
  for (let i = 0; i < toLoad.length; i += batchSize) {
    const slice = toLoad.slice(i, i + batchSize);
    await Promise.all(
      slice.map(async (field) => {
        try {
          const values = await fetchTrendyolCategoryAttributeValuesPaged(
            categoryId,
            field.attributeId,
            headers
          );
          field.values = values;
        } catch {
          /* allowCustom alanlarda serbest metin kalır */
        }
      })
    );
  }

  return { raw, fields };
}

/**
 * Ürünleri Trendyol’dan çek.
 * Önce TR dökümandaki **onaylı ürün** endpoint’i (varyantları açar); olmazsa eski sapigw listesini dener.
 * .env `TRENDYOL_PRODUCT_LIST_LEGACY_FIRST=true` ise önce sapigw listesi (bazı mağazalarda veri burada).
 */
export async function fetchTrendyolProducts(
  sellerId: string,
  apiKey: string,
  apiSecret: string
): Promise<Record<string, unknown>[]> {
  const legacyFirst = (() => {
    const s = String(process.env.TRENDYOL_PRODUCT_LIST_LEGACY_FIRST ?? '')
      .trim()
      .toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  })();

  if (legacyFirst) {
    try {
      const legFirst = await fetchTrendyolProductsLegacySapigw(
        sellerId,
        apiKey,
        apiSecret
      );
      if (legFirst.length > 0) return legFirst;
    } catch (e: unknown) {
      console.warn(
        'TRENDYOL_PRODUCT_LIST_LEGACY_FIRST: sapigw hata/boş, onaylı uç denenir:',
        formatTrendyolAxiosError(e)
      );
    }
  }

  let approvedError: string | null = null;
  try {
    const approved = await fetchTrendyolApprovedProductsPaged(
      sellerId,
      apiKey,
      apiSecret
    );
    if (approved.length > 0) return approved;

    console.warn(
      'Trendyol onaylı ürün listesi boş döndü; sapigw /suppliers/.../products yedek olarak denenecek.'
    );
  } catch (e: unknown) {
    approvedError = formatTrendyolAxiosError(e);
    console.warn(
      'Trendyol onaylı ürün çekimi hatası (sapigw denenecek):',
      approvedError
    );
  }

  try {
    const legacy = await fetchTrendyolProductsLegacySapigw(
      sellerId,
      apiKey,
      apiSecret
    );
    if (legacy.length === 0 && approvedError) {
      throw new Error(
        `Onaylı ürün API hatası veya boş liste. ${approvedError}`
      );
    }
    return legacy;
  } catch (e: unknown) {
    const legacyMsg = formatTrendyolAxiosError(e);
    if (approvedError) {
      throw new Error(
        `Onaylı ürün: ${approvedError} | Eski sapigw listesi: ${legacyMsg}`
      );
    }
    throw e instanceof Error ? e : new Error(legacyMsg);
  }
}

// Siparişleri Trendyol'dan Çek (Sipariş Paketi API)
export async function fetchTrendyolOrders(sellerId: string, apiKey: string, apiSecret: string) {
  const res = await fetchTrendyolOrdersPaginated(sellerId, apiKey, apiSecret, {
    page: 0,
    size: 200,
  });
  return { content: res.content, totalPages: res.totalPages, totalElements: res.totalElements };
}

export async function fetchTrendyolOrdersPaginated(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  params?: {
    page?: number;
    size?: number;
    status?: string;
    startDate?: number;
    endDate?: number;
  }
): Promise<{
  content: Array<Record<string, unknown>>;
  totalPages?: number;
  totalElements?: number;
}> {
  try {
    const headers = getTrendyolAuthHeader(apiKey, apiSecret, sellerId);
    const query: Record<string, string | number> = {
      page: params?.page ?? 0,
      size: Math.min(Math.max(params?.size ?? 200, 1), 200),
    };
    if (params?.status) query.status = params.status;
    if (params?.startDate != null) query.startDate = params.startDate;
    if (params?.endDate != null) query.endDate = params.endDate;

    const response = await axios.get(
      `${TRENDYOL_API_BASE}/suppliers/${sellerId}/orders`,
      { headers, params: query, timeout: 90_000 }
    );
    const data = response.data ?? {};
    const content = Array.isArray(data.content)
      ? (data.content as Array<Record<string, unknown>>)
      : [];
    return {
      content,
      totalPages: Number(data.totalPages) || 1,
      totalElements: Number(data.totalElements) || content.length,
    };
  } catch (error: unknown) {
    console.error('Trendyol sipariş çekme hatası:', error);
    throw error;
  }
}

/** Apigw getShipmentPackages — tek sipariş / paket için güncel cargoTrackingNumber */
export async function fetchTrendyolShipmentPackages(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  params?: {
    orderNumber?: string;
    shipmentPackageIds?: string[];
    page?: number;
    size?: number;
  }
): Promise<Array<Record<string, unknown>>> {
  const headers = getTrendyolAuthHeader(apiKey, apiSecret, sellerId);
  const query: Record<string, string | number> = {
    page: params?.page ?? 0,
    size: Math.min(Math.max(params?.size ?? 20, 1), 200),
  };
  const orderNo = String(params?.orderNumber ?? '').trim();
  if (orderNo) query.orderNumber = orderNo;
  const pkgIds = (params?.shipmentPackageIds ?? [])
    .map((id) => String(id).trim())
    .filter((id) => /^\d+$/.test(id));
  if (pkgIds.length === 1) query.shipmentPackageIds = pkgIds[0]!;
  else if (pkgIds.length > 1) query.shipmentPackageIds = pkgIds.join(',');

  const response = await axios.get(TrendyolEndpoints.shipmentPackages(sellerId), {
    headers,
    params: query,
    timeout: 90_000,
  });
  const data = response.data ?? {};
  return Array.isArray(data.content)
    ? (data.content as Array<Record<string, unknown>>)
    : [];
}

/** Paket statüsünü Trendyol'a bildirir (Picking = işleme alındı). */
export async function updateTrendyolPackageStatus(input: {
  sellerId: string;
  apiKey: string;
  apiSecret: string;
  packageId: string;
  status: 'Picking' | 'Invoiced';
  lines: Array<{ lineId: number; quantity: number }>;
  invoiceNumber?: string;
}) {
  const headers = {
    ...getTrendyolAuthHeader(input.apiKey, input.apiSecret, input.sellerId),
  };
  const payload: Record<string, unknown> = {
    status: input.status,
    lines: input.lines.map((l) => ({
      lineId: l.lineId,
      quantity: l.quantity,
    })),
    params:
      input.status === 'Invoiced' && input.invoiceNumber
        ? { invoiceNumber: input.invoiceNumber }
        : {},
  };
  const url = TrendyolEndpoints.shipmentPackageUpdate(
    input.sellerId,
    input.packageId
  );
  const response = await axios.put(url, payload, { headers });
  return response.data;
}

// Stok ve Fiyat Güncelle (Stok/Fiyat Eşitleme API)
export async function updateTrendyolStockAndPrice(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  items: Array<{ barcode: string; quantity: number; salePrice: number; listPrice?: number }>
) {
  const headers = getTrendyolAuthHeader(apiKey, apiSecret, sellerId);
  const payload = {
    items: items.map(item => ({
      barcode: item.barcode,
      quantity: item.quantity,
      salePrice: item.salePrice,
      listPrice: item.listPrice ?? item.salePrice,
    }))
  };
  const primaryUrl = TrendyolEndpoints.priceAndInventoryIntegration(sellerId);
  const fallbackUrl = TrendyolEndpoints.priceAndInventory(sellerId);
  const response = await trendyolRequestWithFallback(
    { method: 'post', url: primaryUrl, data: payload, headers },
    { method: 'post', url: fallbackUrl, data: payload, headers }
  );
  return response.data;
}

type TrendyolCreateAttempt = {
  label: string;
  url: string;
  headers: Record<string, string>;
};

async function postTrendyolProductCreateAttempt(
  attempt: TrendyolCreateAttempt,
  payload: { items: Record<string, unknown>[] }
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; html: true; status: number }
  | { ok: false; html: false; status: number; data: unknown }
> {
  const response = await axios.post(attempt.url, payload, {
    headers: attempt.headers,
    timeout: 90_000,
    maxRedirects: 0,
    validateStatus: () => true,
  });

  const ct = String(response.headers['content-type'] ?? '').toLowerCase();
  if (isTrendyolHtmlBody(response.data) || ct.includes('text/html')) {
    return { ok: false, html: true, status: response.status };
  }

  if (response.status >= 400) {
    return {
      ok: false,
      html: false,
      status: response.status,
      data: response.data,
    };
  }

  return { ok: true, data: response.data };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractBatchRequestId(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const o = data as Record<string, unknown>;
  return String(o.batchRequestId ?? o.batchRequestID ?? '').trim();
}

export type TrendyolBatchItemSummary = {
  successCount: number;
  failedCount: number;
  totalItems: number;
  itemErrors: string[];
};

function parseBatchItemRowError(
  item: Record<string, unknown>,
  barcode: string
): string {
  const status = String(item.status ?? '').trim();
  const reasons = Array.isArray(item.failureReasons)
    ? item.failureReasons
        .map((r) =>
          typeof r === 'string'
            ? r.trim()
            : r && typeof r === 'object'
              ? String(
                  (r as Record<string, unknown>).message ??
                    (r as Record<string, unknown>).detail ??
                    JSON.stringify(r)
                ).trim()
              : ''
        )
        .filter(Boolean)
    : [];

  const msg =
    reasons.join(' · ') ||
    String(item.failureReason ?? item.error ?? '').trim() ||
    `Durum: ${status || 'FAILED'}`;

  return barcode ? `${barcode}: ${msg}` : msg;
}

/** Batch yanıtından satır bazlı başarı/başarısızlık özeti */
export function summarizeTrendyolBatchResult(data: unknown): TrendyolBatchItemSummary {
  if (!data || typeof data !== 'object') {
    return { successCount: 0, failedCount: 0, totalItems: 0, itemErrors: [] };
  }
  const root = data as Record<string, unknown>;
  const items = Array.isArray(root.items) ? root.items : [];
  const itemErrors: string[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const row of items) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const status = String(item.status ?? '').trim().toUpperCase();

    const req =
      item.requestItem && typeof item.requestItem === 'object'
        ? (item.requestItem as Record<string, unknown>)
        : undefined;
    let barcode = String(req?.barcode ?? '').trim();
    if (!barcode && req?.product && typeof req.product === 'object') {
      barcode = String(
        (req.product as Record<string, unknown>).barcode ?? ''
      ).trim();
    }

    if (status === 'SUCCESS') {
      successCount += 1;
      continue;
    }

    failedCount += 1;
    itemErrors.push(parseBatchItemRowError(item, barcode));
  }

  const apiFailedCount = Number(root.failedItemCount ?? 0);
  if (failedCount === 0 && apiFailedCount > 0) {
    failedCount = apiFailedCount;
    itemErrors.push(`${apiFailedCount} satır Trendyol tarafından reddedildi (ayrıntı yok).`);
  }

  return {
    successCount,
    failedCount: Math.max(failedCount, apiFailedCount),
    totalItems: items.length,
    itemErrors,
  };
}

function parseBatchItemFailures(data: unknown): string[] {
  return summarizeTrendyolBatchResult(data).itemErrors;
}

export type TrendyolCreateBatchResult = {
  submitResponse: unknown;
  batchRequestId: string;
  batchStatus: string;
  failedItemCount: number;
  successItemCount: number;
  itemErrors: string[];
};

/** Ürün create sonrası batchRequestId ile gerçek sonucu bekler (Trendyol kuyruk işlemi). */
export async function pollTrendyolProductCreateBatch(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  batchRequestId: string,
  opts?: { maxAttempts?: number; firstDelayMs?: number; delayMs?: number }
): Promise<TrendyolCreateBatchResult> {
  const maxAttempts = opts?.maxAttempts ?? 12;
  const firstDelayMs = opts?.firstDelayMs ?? 2500;
  const delayMs = opts?.delayMs ?? 3000;
  const url = TrendyolEndpoints.batchRequestResult(sellerId, batchRequestId);
  const headers = getTrendyolProductWriteHeaders(apiKey, apiSecret, sellerId);

  let lastData: unknown = null;
  let lastStatus = 'PENDING';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(attempt === 0 ? firstDelayMs : delayMs);

    const response = await axios.get(url, {
      headers,
      timeout: 60_000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      if (attempt === maxAttempts - 1) {
        throwTrendyolHttpError(
          response.status,
          response.data,
          'batch-requests'
        );
      }
      continue;
    }

    lastData = response.data;
    const root = response.data as Record<string, unknown>;
    lastStatus = String(root.status ?? '').trim() || 'UNKNOWN';
    const summary = summarizeTrendyolBatchResult(response.data);

    if (
      lastStatus === 'COMPLETED' ||
      lastStatus === 'COMPLETED_WITH_ERRORS' ||
      lastStatus === 'FAILED'
    ) {
      return {
        submitResponse: lastData,
        batchRequestId,
        batchStatus: lastStatus,
        failedItemCount: summary.failedCount,
        successItemCount: summary.successCount,
        itemErrors: summary.itemErrors,
      };
    }

    if (summary.failedCount > 0 && summary.itemErrors.length > 0) {
      return {
        submitResponse: lastData,
        batchRequestId,
        batchStatus: lastStatus,
        failedItemCount: summary.failedCount,
        successItemCount: summary.successCount,
        itemErrors: summary.itemErrors,
      };
    }
  }

  return {
    submitResponse: lastData,
    batchRequestId,
    batchStatus: lastStatus || 'TIMEOUT',
    failedItemCount: 0,
    successItemCount: 0,
    itemErrors: [
      'Trendyol kuyruk sonucu henüz hazır değil. Birkaç dakika sonra Trendyol panelinde «Onay bekleyenler» veya «Toplu işlem» geçmişini kontrol edin.',
    ],
  };
}

export async function createTrendyolProductsBatch(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  items: Record<string, unknown>[]
) {
  if (!items.length) {
    throw new Error('Gönderilecek ürün satırı yok.');
  }

  const payload = { items };
  const attempts: TrendyolCreateAttempt[] = [
    {
      label: 'apigw v2',
      url: TrendyolEndpoints.productCreateV2(sellerId),
      headers: getTrendyolProductWriteHeaders(apiKey, apiSecret, sellerId),
    },
    {
      label: 'sapigw v2',
      url: TrendyolEndpoints.supplierProductsV2(sellerId),
      headers: getTrendyolAuthHeader(apiKey, apiSecret, sellerId),
    },
  ];

  let lastJsonFailure: { status: number; data: unknown; label: string } | null =
    null;
  let sawHtmlResponse = false;

  for (const attempt of attempts) {
    const result = await postTrendyolProductCreateAttempt(attempt, payload);
    if (result.ok) {
      const batchRequestId = extractBatchRequestId(result.data);
      if (!batchRequestId) {
        return {
          submitResponse: result.data,
          batchRequestId: '',
          batchStatus: 'NO_BATCH_ID',
          failedItemCount: 1,
          successItemCount: 0,
          itemErrors: [
            'Trendyol isteği kabul etti ama batchRequestId dönmedi — ürünün oluştuğu doğrulanamadı. Ayarlar > Trendyol Satıcı ID ve API bilgilerini kontrol edin.',
          ],
        } satisfies TrendyolCreateBatchResult;
      }

      const polled = await pollTrendyolProductCreateBatch(
        sellerId,
        apiKey,
        apiSecret,
        batchRequestId
      );
      return { ...polled, submitResponse: result.data };
    }

    if (result.html) {
      sawHtmlResponse = true;
      lastJsonFailure = {
        status: result.status,
        data: null,
        label: attempt.label,
      };
      continue;
    }

    lastJsonFailure = {
      status: result.status,
      data: result.data,
      label: attempt.label,
    };

    if (result.status === 404 || result.status === 403) {
      continue;
    }

    throwTrendyolHttpError(result.status, result.data, attempt.label);
  }

  if (sawHtmlResponse) {
    throw new Error(
      'Trendyol HTML yanıt döndü — ürün yayımlama uç noktası reddedildi (apigw ve sapigw denendi). Ayarlar > Trendyol Satıcı ID’yi kontrol edin; görsellerin herkese açık HTTPS adresi olduğundan emin olun.'
    );
  }

  if (lastJsonFailure) {
    throwTrendyolHttpError(
      lastJsonFailure.status,
      lastJsonFailure.data,
      lastJsonFailure.label
    );
  }

  throw new Error('Trendyol ürün oluşturma isteği başarısız.');
}

/** Tek barkod/varyant satırı — toplu gönderim için createTrendyolProductsBatch tercih edin */
export async function createTrendyolProduct(
  sellerId: string,
  apiKey: string,
  apiSecret: string,
  productData: Record<string, unknown>
) {
  return createTrendyolProductsBatch(sellerId, apiKey, apiSecret, [productData]);
}
