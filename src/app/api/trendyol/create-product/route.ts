import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import {
  getTrendyolSettings,
  createTrendyolProductsBatch,
  fetchTrendyolCategoryFieldsWithValues,
  formatTrendyolAxiosError,
  resolveTrendyolBrandId,
} from '@/lib/trendyol';
import {
  buildCreateAttributesForItem,
  fieldsForProductLevel,
  findVariantDimensionFields,
  toTrendyolApiAttributes,
  validateRequiredAttributes,
  validateVariantDimensionsForPublish,
  validateVariantTrendyolAttributeMapping,
  type TyAttributeField,
  type TyAttributeSelection,
  type TyAttributeFormValue,
} from '@/lib/trendyol-attributes';
import { resolveSettingDocument } from '@/lib/erp-settings';
import { requireSession } from '@/lib/auth';
import { tenantScope, belongsToTenant } from '@/lib/tenant';
import {
  getEffectivePublicAppUrl,
  resolveTrendyolImageUrls,
  trendyolImagePublishError,
} from '@/lib/public-image-url';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = Number(searchParams.get('categoryId'));
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return NextResponse.json(
        { success: false, error: 'categoryId zorunlu.' },
        { status: 400 }
      );
    }
    const { raw, fields } = await fetchTrendyolCategoryFieldsWithValues(categoryId);
    const { sizeField, colorField, ageField } = findVariantDimensionFields(fields);
    return NextResponse.json({
      success: true,
      categoryId,
      fields,
      raw,
      variantHints: {
        sizeAttributeId: sizeField?.attributeId ?? null,
        sizeAttributeName: sizeField?.name ?? null,
        colorAttributeId: colorField?.attributeId ?? null,
        colorAttributeName: colorField?.name ?? null,
        ageAttributeId: ageField?.attributeId ?? null,
        ageAttributeName: ageField?.name ?? null,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: formatTrendyolAxiosError(error) },
      { status: 502 }
    );
  }
}

function normalizeStoredAttributes(input: unknown): TyAttributeSelection[] {
  if (!Array.isArray(input)) return [];
  const out: TyAttributeSelection[] = [];
  for (const row of input) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const attributeId = Number(o.attributeId);
    if (!Number.isFinite(attributeId)) continue;
    out.push({
      attributeId,
      attributeName: String(o.attributeName ?? ''),
      attributeValueId:
        o.attributeValueId != null && Number.isFinite(Number(o.attributeValueId))
          ? Number(o.attributeValueId)
          : undefined,
      attributeValue: String(o.attributeValue ?? '').trim(),
    });
  }
  return out;
}

function storedToFormValues(
  stored: TyAttributeSelection[]
): Record<number, TyAttributeFormValue> {
  const out: Record<number, TyAttributeFormValue> = {};
  for (const s of stored) {
    out[s.attributeId] = {
      valueId: s.attributeValueId,
      custom: s.attributeValue || undefined,
    };
  }
  return out;
}

function validateItemAttributes(
  fields: TyAttributeField[],
  stored: TyAttributeSelection[],
  variant?: { sizeLabel?: string; colorLabel?: string },
  hasVariants = false
): string | null {
  const merged = buildCreateAttributesForItem(fields, stored, variant);
  const levelFields = fieldsForProductLevel(fields, hasVariants || Boolean(variant));
  return validateRequiredAttributes(levelFields, storedToFormValues(merged));
}

/** ERP ürününü Trendyol v2 create API ile mağazaya gönderir */
export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof NextResponse) return session;
    const { tenantId } = tenantScope(session);

    await connectToDatabase();
    const body = (await request.json()) as {
      productId?: string;
      attributes?: unknown[];
    };
    const productId = String(body.productId ?? '').trim();
    if (!productId) {
      return NextResponse.json({ success: false, error: 'productId zorunlu.' }, { status: 400 });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return NextResponse.json({ success: false, error: 'Ürün bulunamadı.' }, { status: 404 });
    }
    if (!belongsToTenant(session, product.tenantId)) {
      return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 403 });
    }

    const categoryId = Number(product.trendyolCategoryId);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Trendyol kategori ID tanımlı değil. Ürünü düzenleyip kategori seçin.',
        },
        { status: 400 }
      );
    }

    const { fields } = await fetchTrendyolCategoryFieldsWithValues(categoryId);

    const stored =
      Array.isArray(body.attributes) && body.attributes.length
        ? normalizeStoredAttributes(body.attributes)
        : normalizeStoredAttributes(product.trendyolAttributes);

    if (product.hasVariants && product.variants?.length) {
      const variantErr = validateVariantDimensionsForPublish(
        fields,
        product.variants.map((v: { sizeLabel?: string; colorLabel?: string }) => ({
          sizeLabel: v.sizeLabel,
          colorLabel: v.colorLabel,
        }))
      );
      if (variantErr) {
        return NextResponse.json({ success: false, error: variantErr }, { status: 400 });
      }
      const mappingErr = validateVariantTrendyolAttributeMapping(
        fields,
        product.variants.map((v: { sizeLabel?: string; colorLabel?: string }) => ({
          sizeLabel: v.sizeLabel,
          colorLabel: v.colorLabel,
        }))
      );
      if (mappingErr) {
        return NextResponse.json({ success: false, error: mappingErr }, { status: 400 });
      }
      const missing = validateRequiredAttributes(
        fieldsForProductLevel(fields, true),
        storedToFormValues(stored)
      );
      if (missing) {
        return NextResponse.json({ success: false, error: missing }, { status: 400 });
      }
    } else {
      const missing = validateRequiredAttributes(fields, storedToFormValues(stored));
      if (missing) {
        return NextResponse.json({ success: false, error: missing }, { status: 400 });
      }
    }

    const settings = await getTrendyolSettings(tenantId);
    const brandId = await resolveTrendyolBrandId(settings);
    const settingsDoc = await resolveSettingDocument(tenantId);
    const publicAppUrl = getEffectivePublicAppUrl(
      String(settingsDoc.get('publicAppUrl') ?? '')
    );
    const listPrice = Math.max(0, Number(product.price) || 0);
    const salePrice = Math.max(0, Number(product.prices?.trendyol) || listPrice);

    const rawImageUrls = (product.images ?? [])
      .map((im: { url?: string }) => String(im.url ?? '').trim())
      .filter(Boolean);
    const { ok: imageUrls, bad: badImages } = resolveTrendyolImageUrls(
      rawImageUrls,
      publicAppUrl
    );

    if (imageUrls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            rawImageUrls.length === 0
              ? 'Trendyol için en az bir ürün görseli gerekli.'
              : trendyolImagePublishError(badImages, publicAppUrl),
        },
        { status: 400 }
      );
    }

    const images = imageUrls.slice(0, 8).map((url: string) => ({ url }));

    const items: Record<string, unknown>[] = [];

    if (product.hasVariants && product.variants?.length) {
      for (const v of product.variants) {
        const bc = String(v.barcode ?? '').trim();
        if (!bc) continue;

        const variantRow = {
          sizeLabel: String(v.sizeLabel ?? '').trim(),
          colorLabel: String(v.colorLabel ?? '').trim(),
        };
        const itemAttrErr = validateItemAttributes(
          fields,
          stored,
          variantRow,
          true
        );
        if (itemAttrErr) {
          return NextResponse.json({ success: false, error: itemAttrErr }, { status: 400 });
        }

        const itemSelections = buildCreateAttributesForItem(fields, stored, variantRow);
        items.push({
          barcode: bc,
          title: product.name,
          productMainId: product.sku,
          brandId,
          categoryId,
          quantity: Math.max(0, Math.floor(Number(v.stock) || 0)),
          stockCode: String(v.sku ?? product.sku),
          origin: 'TR',
          dimensionalWeight:
            Number((product as { dimensionalWeight?: number }).dimensionalWeight) > 0
              ? Number((product as { dimensionalWeight?: number }).dimensionalWeight)
              : 1,
          description: product.description || product.name,
          currencyType: 'TRY',
          listPrice,
          salePrice,
          vatRate: 20,
          cargoCompanyId: 10,
          images,
          attributes: toTrendyolApiAttributes(itemSelections),
        });
      }
    } else {
      const bc = String(product.barcode ?? '').trim();
      if (!bc) {
        return NextResponse.json(
          { success: false, error: 'Barkod olmadan Trendyol aktarımı yapılamaz.' },
          { status: 400 }
        );
      }
      const itemSelections = buildCreateAttributesForItem(fields, stored);
      items.push({
        barcode: bc,
        title: product.name,
        productMainId: product.sku,
        brandId,
        categoryId,
        quantity: Math.max(0, Math.floor(Number(product.stock) || 0)),
        stockCode: product.sku,
        origin: 'TR',
        dimensionalWeight:
          Number((product as { dimensionalWeight?: number }).dimensionalWeight) > 0
            ? Number((product as { dimensionalWeight?: number }).dimensionalWeight)
            : 1,
        description: product.description || product.name,
        currencyType: 'TRY',
        listPrice,
        salePrice,
        vatRate: 20,
        cargoCompanyId: 10,
        images,
        attributes: toTrendyolApiAttributes(itemSelections),
      });
    }

    if (!items.length) {
      return NextResponse.json(
        { success: false, error: 'Gönderilecek varyant/barkod satırı yok.' },
        { status: 400 }
      );
    }

    const results = await createTrendyolProductsBatch(
      settings.sellerId,
      settings.apiKey,
      settings.apiSecret,
      items
    );

    const batchFailed =
      results.failedItemCount > 0 ||
      results.itemErrors.length > 0 ||
      results.batchStatus === 'FAILED' ||
      results.batchStatus === 'COMPLETED_WITH_ERRORS' ||
      results.batchStatus === 'NO_BATCH_ID' ||
      (results.batchStatus === 'COMPLETED' && results.successItemCount === 0);

    if (batchFailed) {
      const detail = results.itemErrors.slice(0, 5).join('\n');
      return NextResponse.json(
        {
          success: false,
          error:
            detail ||
            (results.batchStatus === 'COMPLETED' && results.successItemCount === 0
              ? 'Trendyol isteği tamamlandı ama hiçbir barkod kabul edilmedi. Marka ID, kategori öznitelikleri ve görselleri kontrol edin.'
              : `Trendyol toplu istek reddetti (${results.batchStatus || 'FAILED'}).`),
          batchRequestId: results.batchRequestId,
          batchStatus: results.batchStatus,
          successItemCount: results.successItemCount,
          itemErrors: results.itemErrors,
        },
        { status: 400 }
      );
    }

    if (results.batchStatus !== 'COMPLETED' || results.successItemCount < items.length) {
      const partial =
        results.successItemCount > 0 && results.successItemCount < items.length;
      if (partial || results.batchStatus !== 'COMPLETED') {
        return NextResponse.json(
          {
            success: false,
            error:
              results.itemErrors[0] ??
              (partial
                ? `Yalnızca ${results.successItemCount}/${items.length} barkod kabul edildi.`
                : `Trendyol kuyruk durumu: ${results.batchStatus || 'UNKNOWN'}.`),
            batchRequestId: results.batchRequestId,
            batchStatus: results.batchStatus,
            successItemCount: results.successItemCount,
            itemErrors: results.itemErrors,
          },
          { status: partial ? 400 : 502 }
        );
      }
    }

    if (
      String(results.batchStatus) === 'TIMEOUT' ||
      results.itemErrors.some((e) => e.includes('kuyruk sonucu'))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: results.itemErrors[0] ?? 'Trendyol kuyruk sonucu alınamadı.',
          batchRequestId: results.batchRequestId,
          batchStatus: results.batchStatus,
        },
        { status: 502 }
      );
    }

    product.platforms = [...new Set([...(product.platforms ?? []), 'trendyol'])];
    product.trendyolAttributes = stored;
    product.integrations = product.integrations ?? {};
    product.integrations.trendyol = {
      ...(product.integrations.trendyol ?? {}),
      syncActive: true,
      approved: false,
      productId: product.integrations.trendyol?.productId ?? '',
      productMainId: product.sku,
    };
    await product.save();

    return NextResponse.json({
      success: true,
      message:
        `${results.successItemCount} barkod Trendyol «Onay bekleyenler» kuyruğuna alındı` +
        (results.batchRequestId ? ` (işlem no: ${results.batchRequestId})` : '') +
        `. Satıcı panelinde Ürünler → Onay bekleyenler listesine bakın — «Onaylı ürünler» değil. Birkaç dakika sürebilir.`,
      sent: results.successItemCount,
      attributesUsed: (items[0]?.attributes as unknown[])?.length ?? 0,
      batchRequestId: results.batchRequestId,
      batchStatus: results.batchStatus,
      successItemCount: results.successItemCount,
      results: results.submitResponse,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: formatTrendyolAxiosError(error) },
      { status: 502 }
    );
  }
}
