import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import { deleteProductsWithCleanup } from '@/lib/product-delete';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import {
  getEffectivePublicAppUrl,
  resolveTrendyolImageUrls,
} from '@/lib/public-image-url';

async function buildProductImagesPayload(
  raw: unknown
): Promise<Array<{ url: string; sortOrder: number }>> {
  if (!Array.isArray(raw)) return [];
  const settingsDoc = await resolveSingletonSettingDocument();
  const base = getEffectivePublicAppUrl(String(settingsDoc.get('publicAppUrl') ?? ''));
  const out: Array<{ url: string; sortOrder: number }> = [];
  raw.forEach((img: { url?: string }, i: number) => {
    const trimmed = String(img?.url ?? '').trim();
    if (!trimmed) return;
    const { ok } = resolveTrendyolImageUrls([trimmed], base);
    out.push({ url: ok[0] ?? trimmed, sortOrder: i });
  });
  return out;
}

function normalizeTyAttributesFromClient(data: unknown): Array<{
  attributeId: number;
  attributeName: string;
  attributeValueId?: number;
  attributeValue: string;
}> {
  if (!Array.isArray(data)) return [];
  const out: Array<{
    attributeId: number;
    attributeName: string;
    attributeValueId?: number;
    attributeValue: string;
  }> = [];
  for (const row of data) {
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

function genBarcode() {
  return '868' + String(Math.floor(1000000000 + Math.random() * 9000000000));
}

type VariantIn = {
  sku?: string;
  barcode?: string;
  stock?: number;
  sizeLabel?: string;
  colorLabel?: string;
};

async function skuBarcodeCollision(
  skus: string[],
  barcodes: string[],
  excludeId?: string
): Promise<{ field: string; value: string } | null> {
  const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];

  const or: Record<string, unknown>[] = [];
  const us = uniq(skus);
  const ub = uniq(barcodes);
  if (us.length)
    or.push({ sku: { $in: us } }, { 'variants.sku': { $in: us } });
  if (ub.length)
    or.push({ barcode: { $in: ub } }, { 'variants.barcode': { $in: ub } });

  if (or.length === 0) return null;

  const q: Record<string, unknown> = { $or: or };
  if (excludeId) q._id = { $ne: new mongoose.Types.ObjectId(excludeId) };

  const hit = await Product.findOne(q).lean();
  if (!hit) return null;

  if (us.includes(String((hit as { sku?: string }).sku))) {
    return { field: 'sku', value: String((hit as { sku?: string }).sku) };
  }
  const hv = hit as { variants?: { sku?: string; barcode?: string }[] };
  for (const s of us) {
    if (hv.variants?.some((v) => v.sku === s))
      return { field: 'variantSku', value: s };
  }
  if (ub.includes(String((hit as { barcode?: string }).barcode))) {
    return { field: 'barcode', value: String((hit as { barcode?: string }).barcode) };
  }
  for (const b of ub) {
    if (hv.variants?.some((v) => v.barcode === b))
      return { field: 'variantBarcode', value: b };
  }
  return { field: 'unknown', value: '' };
}

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(1, Number(searchParams.get('limit')) || 2000), 5000);
    const products = await Product.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    return NextResponse.json({ success: true, products, limit });
  } catch (error: unknown) {
    console.error('GET Products Error:', error);
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const data = await request.json();

    const hasVariants = Boolean(data.hasVariants);
    const variantsIn: VariantIn[] = Array.isArray(data.variants)
      ? data.variants.filter(
          (v: VariantIn) =>
            String(v.sku ?? '').trim() && String(v.barcode ?? '').trim()
        )
      : [];

    const imagesPayload = await buildProductImagesPayload(data.images);

    if (!data.name?.trim()) {
      return NextResponse.json(
        { error: 'Ürün adı zorunludur.' },
        { status: 400 }
      );
    }

    let sku = String(data.sku ?? '').trim();
    let barcode = String(data.barcode ?? '').trim();
    let stock = Number(data.stock) || 0;
    let variantsNormalized: Array<{
      sku: string;
      barcode: string;
      stock: number;
      sizeLabel: string;
      colorLabel: string;
    }> = [];

    if (hasVariants) {
      if (!sku) {
        return NextResponse.json(
          { error: 'Varyantlı ürünler için model SKU (ürün kodu) zorunludur.' },
          { status: 400 }
        );
      }
      if (variantsIn.length === 0) {
        return NextResponse.json(
          { error: 'En az bir geçerli varyant girin (SKU, barkod, stok).' },
          { status: 400 }
        );
      }
      variantsNormalized = variantsIn.map((v) => ({
        sku: String(v.sku).trim(),
        barcode: String(v.barcode).trim(),
        stock: Math.max(0, Number(v.stock) || 0),
        sizeLabel: String(v.sizeLabel ?? '').trim(),
        colorLabel: String(v.colorLabel ?? '').trim(),
      }));

      stock = variantsNormalized.reduce((a, v) => a + v.stock, 0);
      barcode = barcode || `VAR-${sku}-${genBarcode().slice(-8)}`;

      const allSkus = [sku, ...variantsNormalized.map((v) => v.sku)];
      const allBc = [...variantsNormalized.map((v) => v.barcode), barcode];

      const col = await skuBarcodeCollision(allSkus, allBc);
      if (col) {
        return NextResponse.json(
          {
            error: `Çakışan kod: ${col.field} = ${col.value}. SKU ve barkod sistemde tekil olmalıdır.`,
          },
          { status: 409 }
        );
      }
    } else {
      if (!sku || !barcode) {
        return NextResponse.json(
          { error: 'Tek SKU ürünlerde SKU ve barkod zorunludur.' },
          { status: 400 }
        );
      }
      const col = await skuBarcodeCollision([sku], [barcode]);
      if (col) {
        return NextResponse.json(
          {
            error: `Bu SKU veya barkod başka kayıtta kullanılıyor: ${col.field} = ${col.value}`,
          },
          { status: 409 }
        );
      }
    }

    const tcid =
      data.trendyolCategoryId !== undefined && data.trendyolCategoryId !== ''
        ? Number(data.trendyolCategoryId)
        : undefined;

    const platforms = Array.isArray(data.platforms)
      ? (data.platforms as string[])
      : [];

    const newProduct = new Product({
      name: data.name.trim(),
      description: String(data.description ?? '').trim(),
      sku,
      barcode,
      images: imagesPayload,
      hasVariants,
      variants: hasVariants ? variantsNormalized : [],

      costPrice: Number(data.costPrice) || 0,
      price: Number(data.price) || 0,
      dimensionalWeight:
        Number(data.dimensionalWeight) > 0 ? Number(data.dimensionalWeight) : 1,
      cargoFee: Math.max(0, Number(data.cargoFee) || 0),
      prices: {
        website: Number(data.prices?.website) || Number(data.price) || 0,
        trendyol: Number(data.prices?.trendyol) || Number(data.price) || 0,
      },
      stock,
      safetyStock: Number(data.safetyStock) || 0,
      warehouseLocation: data.warehouseLocation || '',
      category: data.category || '',
      ...(Number.isFinite(tcid!) ? { trendyolCategoryId: tcid } : {}),
      ...(Array.isArray(data.trendyolAttributes)
        ? { trendyolAttributes: normalizeTyAttributesFromClient(data.trendyolAttributes) }
        : {}),
      platforms,
      integrations: {
        trendyol: {
          syncActive: platforms.includes('trendyol'),
          approved: false,
        },
        web: {
          syncActive: platforms.includes('web'),
        },
      },
    });

    await newProduct.save();

    return NextResponse.json({ success: true, product: newProduct });
  } catch (error: unknown) {
    console.error('POST Product Error:', error);
    const errAny = error as { code?: number; keyPattern?: Record<string, number> };
    if (errAny?.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error:
            'SKU veya barkod benzersiz olmalı. Aynı kod başka kayıtta kullanılıyor — «Üret» ile yenileyin veya farklı değer girin.',
        },
        { status: 409 }
      );
    }
    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as Error).message === 'string'
        ? (error as Error).message
        : 'Sunucu hatası';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Ürün ID belirtilmelidir.' }, { status: 400 });
    }

    const data = await request.json();
    const product = await Product.findById(id);
    if (!product) {
      return NextResponse.json({ error: 'Ürün bulunamadı.' }, { status: 404 });
    }

    /** Sadece stok güncelleme — tekil ürünler için */
    if (
      Object.keys(data).length === 1 &&
      Object.prototype.hasOwnProperty.call(data, 'stock')
    ) {
      if (product.hasVariants) {
        return NextResponse.json(
          {
            error:
              'Varyantlı üründe stok satır bazında güncellenmelidir. variants dizisi gönderin.',
          },
          { status: 400 }
        );
      }
      product.stock = Number(data.stock) || 0;
      await product.save();
      return NextResponse.json({ success: true, product });
    }

    /** Varyant stok güncelleme — yalnızca stok alanları */
    if (
      product.hasVariants &&
      Array.isArray(data.variants) &&
      !Object.prototype.hasOwnProperty.call(data, 'name') &&
      !Object.prototype.hasOwnProperty.call(data, 'sku')
    ) {
      const variantsNormalized = (data.variants as VariantIn[])
        .filter(
          (v) => String(v.sku ?? '').trim() && String(v.barcode ?? '').trim()
        )
        .map((v) => ({
          sku: String(v.sku).trim(),
          barcode: String(v.barcode).trim(),
          stock: Math.max(0, Number(v.stock) || 0),
          sizeLabel: String(v.sizeLabel ?? '').trim(),
          colorLabel: String(v.colorLabel ?? '').trim(),
        }));

      if (variantsNormalized.length === 0) {
        return NextResponse.json(
          { error: 'En az bir geçerli varyant satırı gerekli.' },
          { status: 400 }
        );
      }

      product.variants = variantsNormalized;
      product.stock = variantsNormalized.reduce((a, v) => a + v.stock, 0);
      product.markModified('variants');
      await product.save();
      return NextResponse.json({ success: true, product });
    }

    const hasVariants =
      data.hasVariants !== undefined
        ? Boolean(data.hasVariants)
        : !!product.hasVariants;

    const variantsSource: VariantIn[] = Array.isArray(data.variants)
      ? data.variants
      : Array.isArray(product.variants)
        ? (product.variants as VariantIn[])
        : [];

    const variantsInFiltered = variantsSource.filter(
      (v: VariantIn) =>
        String(v.sku ?? '').trim() && String(v.barcode ?? '').trim()
    );

    const variantsNormalized = variantsInFiltered.map((v) => ({
      sku: String(v.sku).trim(),
      barcode: String(v.barcode).trim(),
      stock: Math.max(0, Number(v.stock) || 0),
      sizeLabel: String(v.sizeLabel ?? '').trim(),
      colorLabel: String(v.colorLabel ?? '').trim(),
    }));

    const imagesPayload = await buildProductImagesPayload(data.images);

    let sku = data.sku !== undefined ? String(data.sku).trim() : product.sku;
    let barcode =
      data.barcode !== undefined
        ? String(data.barcode).trim()
        : String(product.barcode || '');

    let stock =
      data.stock !== undefined ? Number(data.stock) || 0 : product.stock;

    product.hasVariants = hasVariants;

    if (hasVariants) {
      if (!sku)
        return NextResponse.json({ error: 'Model SKU gereklidir.' }, { status: 400 });
      if (variantsNormalized.length === 0) {
        return NextResponse.json(
          { error: 'En az bir geçerli varyant (SKU+barkod) gerekli.' },
          { status: 400 }
        );
      }
      stock = variantsNormalized.reduce((a, v) => a + v.stock, 0);
      barcode =
        barcode ||
        String(product.barcode || '') ||
        `VAR-${sku}-${genBarcode().slice(-8)}`;
      product.variants = variantsNormalized;

      const allSkus = [sku, ...variantsNormalized.map((v) => v.sku)];
      const allBc = [...variantsNormalized.map((v) => v.barcode), barcode];
      const col = await skuBarcodeCollision(allSkus, allBc, id);
      if (col) {
        return NextResponse.json(
          { error: `Çakışan kod: ${col.field} = ${col.value}` },
          { status: 409 }
        );
      }
    } else {
      product.variants = [];
      if (!sku || !barcode)
        return NextResponse.json(
          {
            error: 'Tek SKU modunda ürün kodu ve barkod gereklidir.',
          },
          { status: 400 }
        );
      const col = await skuBarcodeCollision([sku], [barcode], id);
      if (col)
        return NextResponse.json(
          {
            error: `Çakışan kod: ${col.field} = ${col.value}`,
          },
          { status: 409 }
        );
      product.stock = stock;
    }

    product.name =
      data.name !== undefined ? String(data.name).trim() : product.name;
    if (data.description !== undefined)
      product.set('description', String(data.description).trim());

    product.sku = sku;
    product.barcode = barcode;
    if (imagesPayload.length > 0) product.images = imagesPayload;
    if (data.costPrice !== undefined)
      product.costPrice = Number(data.costPrice) || 0;
    if (data.dimensionalWeight !== undefined) {
      const d = Number(data.dimensionalWeight);
      product.dimensionalWeight = Number.isFinite(d) && d > 0 ? d : 1;
    }
    if (data.cargoFee !== undefined) {
      product.cargoFee = Math.max(0, Number(data.cargoFee) || 0);
    }
    if (data.price !== undefined) product.price = Number(data.price) || 0;

    if (data.prices) {
      product.prices = {
        website:
          data.prices.website !== undefined
            ? Number(data.prices.website)
            : product.prices!.website,
        trendyol:
          data.prices.trendyol !== undefined
            ? Number(data.prices.trendyol)
            : product.prices!.trendyol,
      };
    }

    product.stock = stock;
    product.safetyStock =
      data.safetyStock !== undefined
        ? Number(data.safetyStock)
        : product.safetyStock;
    product.warehouseLocation =
      data.warehouseLocation !== undefined
        ? String(data.warehouseLocation)
        : product.warehouseLocation;
    product.category =
      data.category !== undefined ? String(data.category) : product.category;

    const tcRaw = data.trendyolCategoryId;
    if (tcRaw !== undefined) {
      if (tcRaw === '' || tcRaw === null) product.set('trendyolCategoryId', undefined);
      else product.trendyolCategoryId = Number(tcRaw);
    }

    if (data.trendyolAttributes !== undefined) {
      product.set(
        'trendyolAttributes',
        normalizeTyAttributesFromClient(data.trendyolAttributes)
      );
    }

    product.platforms = Array.isArray(data.platforms)
      ? data.platforms
      : product.platforms;

    await product.save();
    return NextResponse.json({ success: true, product });
  } catch (error: unknown) {
    console.error('PUT Product Error:', error);
    const errAny = error as { code?: number };
    if (errAny?.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error:
            'SKU veya barkod benzersiz olmalı (çakışma). Kodları güncelleyip tekrar deneyin.',
        },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Ürün ID belirtilmelidir.' }, { status: 400 });
    }

    const result = await deleteProductsWithCleanup([id]);
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Ürün bulunamadı.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message:
        'Ürün silindi. Depo stokları temizlendi; Trendyol/mağaza çekiminde tekrar gelmeyecek.',
    });
  } catch (error: unknown) {
    console.error('DELETE Product Error:', error);
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
