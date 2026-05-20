import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import {
  getTrendyolSettings,
  fetchTrendyolProducts,
  formatTrendyolAxiosError,
  extractTrendyolProductImageUrls,
  probeTrendyolProductListEndpoints,
} from '@/lib/trendyol';
import { generateEan13 } from '@/lib/codes';

/** .env: 1, true, yes, on (büyük/küçük harf) */
function parseEnvBool(v: string | undefined): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

const MOCK_TRENDYOL_ROWS: Record<string, unknown>[] = [
  {
    title: 'Premium Pamuklu Tişört',
    stockCode: 'MOCK-TSH-WHT-M',
    barcode: '8681234567890',
    salePrice: 299.9,
    quantity: 145,
    categoryName: 'Bebek Giyim',
    id: 'TY-MOCK-1',
    description: 'Örnek (TRENDYOL_ALLOW_SYNC_MOCK / MOCK_ONLY)',
  },
  {
    title: 'Spor Ayakkabı X1',
    stockCode: 'MOCK-SH-X1-42',
    barcode: '8680987654321',
    salePrice: 899,
    quantity: 32,
    categoryName: 'Ayakkabı',
    id: 'TY-MOCK-2',
  },
];

function parseQuantityLoose(item: Record<string, unknown>): number {
  const tryNum = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.trim().replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const cands: unknown[] = [
    item.quantity,
    item.availableStock,
    item.supplierQuantity,
    item.stockQuantity,
    item.inventoryQuantity,
  ];

  const nested = item.stock;
  if (nested && typeof nested === 'object') {
    const st = nested as Record<string, unknown>;
    cands.push(
      st.quantity,
      st.availableQuantity,
      st.supplierQuantity
    );
  }

  if (typeof item.stock === 'number') cands.push(item.stock);

  for (const v of cands) {
    const n = tryNum(v);
    if (n !== null) return Math.max(0, Math.floor(n));
  }

  return 0;
}

function coerceRowImages(item: Record<string, unknown>): Array<{ url: string }> {
  if (Array.isArray(item.tyFlatImageUrls)) {
    const urls = (item.tyFlatImageUrls as unknown[])
      .map((x) => String(x ?? '').trim())
      .filter(Boolean);
    return urls.slice(0, 12).map((url) => ({ url }));
  }
  const merged = extractTrendyolProductImageUrls(item);
  return merged.slice(0, 12).map((url) => ({ url }));
}

function coerceRow(item: Record<string, unknown>) {
  const barcodeRaw = String(
    item.barcode ?? item.sellerBarcode ?? item.gtin ?? ''
  ).trim();

  let stockCode = String(
    item.stockCode ?? item.merchantSku ?? item.sku ?? item.productMainId ?? ''
  ).trim();

  /** Onaylı üründe birden fazla varyant aynı stok kodunu paylaşabiliyor — SKU’yu barkoda sabitleyin */
  if (barcodeRaw) {
    stockCode = `TY-${barcodeRaw.replace(/\s+/g, '')}`;
  }

  if (!stockCode) {
    stockCode = barcodeRaw
      ? `EAY-${barcodeRaw.slice(-10)}`
      : `TY-${Date.now()}`;
  }

  const title = String(
    item.title ?? item.name ?? item.productName ?? 'İsimsiz ürün'
  ).trim();

  const salePrice = Number(item.salePrice ?? item.listPrice ?? item.price ?? 0);

  const quantity = parseQuantityLoose(item);

  const categoryName = String(
    item.categoryName ?? item.pimCategoryName ?? ''
  ).trim();

  const cid = item.categoryId;
  let trendyolCategoryId: number | undefined;
  if (typeof cid === 'number' && Number.isFinite(cid)) trendyolCategoryId = cid;
  else if (cid != null && String(cid).trim() !== '') {
    const n = Number(cid);
    if (Number.isFinite(n)) trendyolCategoryId = n;
  }

  const rawId =
    item.id ??
    item.productId ??
    item.contentId ??
    item.mainProductCode ??
    '';
  const id = String(rawId);

  const description = String(item.description ?? item.shortDescription ?? '').trim();

  const barcode = barcodeRaw || generateEan13();

  const images = coerceRowImages(item);

  const productMainId = String(item.productMainId ?? '').trim();
  const contentId =
    item.contentId !== null && item.contentId !== undefined
      ? String(item.contentId).trim()
      : '';
  const sizeLabel = String(item.sizeLabel ?? '').trim();
  const colorLabel = String(item.colorLabel ?? '').trim();

  return {
    stockCode,
    title,
    barcode,
    salePrice,
    quantity,
    categoryName,
    id,
    trendyolCategoryId,
    description,
    images,
    productMainId,
    contentId,
    sizeLabel,
    colorLabel,
  };
}

type CoercedLine = ReturnType<typeof coerceRow>;

function groupCoercedRows(rows: Record<string, unknown>[]): CoercedLine[][] {
  const m = new Map<string, CoercedLine[]>();
  for (const raw of rows) {
    const line = coerceRow(raw);
    const key =
      line.productMainId !== ''
        ? `m:${line.productMainId}`
        : line.contentId !== ''
          ? `c:${line.contentId}`
          : `s:${line.stockCode}`;
    const arr = m.get(key) ?? [];
    arr.push(line);
    m.set(key, arr);
  }
  return [...m.values()];
}

/** Upsert filtresi yalnızca kök şema alanları — iç içe `integrations.*` upsert’te strict hatası verir */
function buildUpsertFilter(
  first: CoercedLine,
  parentSku: string
): Record<string, unknown> {
  const or: Record<string, unknown>[] = [{ sku: parentSku }];
  if (first.stockCode && first.stockCode !== parentSku) {
    or.push({ sku: first.stockCode });
  }
  if (first.barcode) {
    or.push({ barcode: first.barcode });
  }
  return or.length === 1 ? or[0]! : { $or: or };
}

export async function GET() {
  try {
    await connectToDatabase();

    const allowMock = parseEnvBool(process.env.TRENDYOL_ALLOW_SYNC_MOCK);
    /** Trendyol API’yi hiç çağırma; sadece örnek 2 ürün (API anahtarı gerekmez) */
    const mockOnly = parseEnvBool(process.env.TRENDYOL_SYNC_ONLY_MOCK);

    let rows: Record<string, unknown>[] = [];
    let apiError: string | null = null;
    let usedMock = false;
    let settings: Awaited<ReturnType<typeof getTrendyolSettings>> | null = null;

    if (mockOnly) {
      usedMock = true;
      rows = [...MOCK_TRENDYOL_ROWS];
    } else {
      try {
        settings = await getTrendyolSettings();
        rows = await fetchTrendyolProducts(
          settings.sellerId,
          settings.apiKey,
          settings.apiSecret
        );
      } catch (err: unknown) {
        apiError = formatTrendyolAxiosError(err);
        if (!allowMock) {
          return NextResponse.json(
            {
              success: false,
              error: apiError,
              hint:
                'Satıcı ID + API anahtarı + secret birlikte gerekli. Anahtarlar kayıtta kalır ekranda boş görünür; değiştirmek için yeniden yazıp Kaydete basın. Genel sekmesi satıcı ID’yi artık boş string ile silmez. Yalnızca örnek veri için .env: TRENDYOL_SYNC_ONLY_MOCK=true veya TRENDYOL_ALLOW_SYNC_MOCK=true',
            },
            { status: 502 }
          );
        }
      }

      if (rows.length === 0 && allowMock) {
        usedMock = true;
        rows = [...MOCK_TRENDYOL_ROWS];
      }
    }

    if (!allowMock && !mockOnly && rows.length === 0) {
      let listProbe: Awaited<
        ReturnType<typeof probeTrendyolProductListEndpoints>
      > | null = null;
      if (settings) {
        try {
          listProbe = await probeTrendyolProductListEndpoints(
            settings.sellerId,
            settings.apiKey,
            settings.apiSecret
          );
        } catch {
          listProbe = null;
        }
      }

      const probeHint =
        listProbe &&
        typeof listProbe.approved?.totalElements === 'number' &&
        listProbe.approved.totalElements > 0 &&
        listProbe.approved.extractedLength === 0
          ? ' API yanıtında ürün sayısı var ama ERP içeriği çıkaramadı (yanıt şeması değişmiş olabilir). diagnostics’a bakın.'
          : listProbe &&
              typeof listProbe.legacy?.totalElements === 'number' &&
              listProbe.legacy.totalElements > 0 &&
              listProbe.legacy.extractedLength === 0
            ? ' Sapigw listesinde kayıt görünüyor ancak parse edilen satır 0 — şema güncellemesi gerekebilir.'
            : '';

      return NextResponse.json({
        success: false,
        count: 0,
        error:
          apiError ||
          'Trendyol ürün listesi boş döndü veya satırlar işlenemedi.',
        message:
          apiError ||
          'Hiç ürün satırı gelmedi; veri tabanına yazım yapılmadı. Ayarlar > Trendyol: Satıcı ID, API Key ve Secret kayıtlı olmalı. Onaylı ürün / mağaza katalog kontrolü yapın.',
        hint:
          'Yerel test: .env TRENDYOL_SYNC_ONLY_MOCK=true ; veya önce sapigw: TRENDYOL_PRODUCT_LIST_LEGACY_FIRST=true. Kalıcı veri: MONGODB_URI.' +
          probeHint,
        diagnostics: listProbe ?? undefined,
      });
    }

    let syncedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let variantProductCount = 0;
    let singleProductCount = 0;
    let totalVariantLines = 0;
    const syncErrors: string[] = [];
    const groups = groupCoercedRows(rows);
    for (const group of groups) {
      const sorted = [...group].sort((a, b) =>
        a.stockCode.localeCompare(b.stockCode, 'tr')
      );
      const first = sorted[0]!;
      const hasVariants = sorted.length > 1;

      const stockTotal = sorted.reduce(
        (acc, r) => acc + Math.max(0, Math.floor(r.quantity)),
        0
      );

      const priceVal = Math.max(
        0,
        ...sorted.map((r) =>
          typeof r.salePrice === 'number' && Number.isFinite(r.salePrice)
            ? r.salePrice
            : 0
        )
      );

      const parentSku = hasVariants
        ? first.productMainId
          ? `TY-M-${first.productMainId}`
          : `TY-C-${first.contentId}`
        : first.stockCode;

      const variantsPayload = hasVariants
        ? sorted.map((r) => ({
            sku: r.stockCode,
            barcode: r.barcode,
            stock: Math.max(0, Math.floor(r.quantity)),
            sizeLabel: r.sizeLabel || '—',
            colorLabel: r.colorLabel || '',
          }))
        : [];

      const filter = buildUpsertFilter(first, parentSku);

      if (hasVariants) {
        variantProductCount++;
        totalVariantLines += sorted.length;
      } else {
        singleProductCount++;
        totalVariantLines += 1;
      }

      const existingBefore = await Product.findOne(filter).select('_id').lean();

      const setDoc = {
        sku: parentSku,
        name: first.title,
        description: first.description || first.title,
        barcode: first.barcode,
        price: priceVal,
        costPrice: Number((priceVal * 0.4).toFixed(2)),
        prices: {
          website: priceVal,
          trendyol: priceVal,
        },
        stock: hasVariants ? stockTotal : Math.max(0, Math.floor(first.quantity)),
        safetyStock: 2,
        warehouseLocation: '',
        category: first.categoryName,
        hasVariants,
        variants: variantsPayload,
        images: first.images,
        platforms: ['trendyol', 'web'],
        ...(first.trendyolCategoryId != null
          ? { trendyolCategoryId: first.trendyolCategoryId }
          : {}),
        integrations: {
          trendyol: {
            productId: first.contentId || first.id || '',
            productMainId: first.productMainId || '',
            approved: true,
            syncActive: true,
          },
          web: { syncActive: true },
        },
      };

      try {
        await Product.findOneAndUpdate(
          filter,
          { $set: setDoc },
          { upsert: true, new: true }
        );
        syncedCount++;
        if (existingBefore) updatedCount++;
        else createdCount++;
      } catch (err: unknown) {
        const isDup =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code?: number }).code === 11000;
        const msg = err instanceof Error ? err.message : String(err);

        if (isDup) {
          try {
            await Product.findOneAndUpdate(
              { sku: parentSku },
              { $set: setDoc },
              { new: true }
            );
            syncedCount++;
            if (existingBefore) updatedCount++;
            else createdCount++;
          } catch (err2: unknown) {
            const m2 = err2 instanceof Error ? err2.message : String(err2);
            syncErrors.push(`${parentSku}: ${m2}`);
          }
        } else {
          syncErrors.push(`${parentSku}: ${msg}`);
        }
      }
    }

    const ok =
      syncedCount > 0 || syncErrors.length === 0;

    const stats = {
      trendyolRows: rows.length,
      productGroups: groups.length,
      productsSynced: syncedCount,
      productsCreated: createdCount,
      productsUpdated: updatedCount,
      variantProducts: variantProductCount,
      singleProducts: singleProductCount,
      totalVariantLines,
      failedGroups: syncErrors.length,
    };

    let message: string;
    if (usedMock) {
      message =
        `Test verisi: ${syncedCount} ürün modeli (${createdCount} yeni, ${updatedCount} güncellendi). ` +
        `${variantProductCount} varyantlı, ${singleProductCount} tekil; toplam ${totalVariantLines} varyant satırı. ` +
        `Canlı kullanım için mock bayraklarını kapatın.`;
    } else if (syncErrors.length && syncedCount > 0) {
      message =
        `Kısmen eşitlendi: Trendyol'dan ${rows.length} satır → ${syncedCount} ürün modeli ` +
        `(${createdCount} yeni, ${updatedCount} güncellendi). ` +
        `${variantProductCount} varyantlı ürün, ${totalVariantLines} varyant satırı. ` +
        `${syncErrors.length} model yazılamadı.`;
    } else if (syncedCount > 0) {
      message =
        `Trendyol'dan ${rows.length} satır alındı → ${syncedCount} ürün modeli kaydedildi ` +
        `(${createdCount} yeni, ${updatedCount} güncellendi). ` +
        `${variantProductCount} varyantlı, ${singleProductCount} tekil ürün; toplam ${totalVariantLines} varyant satırı.`;
    } else if (syncErrors.length > 0) {
      message = `Hiçbir ürün yazılamadı (${syncErrors.length} hata). Trendyol'dan ${rows.length} satır geldi.`;
    } else {
      message = 'Eşitleme tamamlandı; işlenecek ürün bulunamadı.';
    }

    return NextResponse.json({
      success: ok,
      message,
      error: ok ? undefined : message,
      count: syncedCount,
      stats,
      rowGroups: groups.length,
      /** İstemci / destek: mock gerçekten kullanıldı mı */
      mockUsed: usedMock,
      mockOnlyMode: mockOnly,
      errors:
        syncErrors.length > 0 ? syncErrors.slice(0, 40) : undefined,
      hint:
        !syncedCount && syncErrors.length > 0
          ? 'MongoDB yazımı başarısız (benzersiz SKU/barkod çakışması ya da şema değişimi olabilir). Çakışan kayıtları kaldırıp tekrar deneyin.'
          : syncErrors.length > 0
            ? 'Bazı modeller yazılamadı; ayrıntı "errors" alanında.'
            : undefined,
    });
  } catch (error: unknown) {
    console.error('Senkronizasyon hatası:', error);
    const message =
      error instanceof Error ? error.message : 'Senkronizasyon hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
