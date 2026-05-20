import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Category from '@/models/Category';
import { fetchTrendyolCategories, formatTrendyolAxiosError } from '@/lib/trendyol';

export async function GET() {
  try {
    let categoriesTree: unknown[] = [];

    try {
      const raw = await fetchTrendyolCategories();
      if (Array.isArray(raw)) {
        categoriesTree = raw;
      } else if (raw && typeof raw === 'object') {
        const o = raw as {
          categories?: unknown[];
          categoryTree?: unknown[];
          data?: { categories?: unknown[] };
        };
        categoriesTree =
          o.categories || o.categoryTree || o.data?.categories || [];
      }
    } catch (apiErr) {
      const msg = formatTrendyolAxiosError(apiErr);
      return NextResponse.json(
        {
          success: false,
          error: `Trendyol kategori ağacı alınamadı: ${msg}. Ayarlar > Trendyol API bilgilerini kontrol edin.`,
        },
        { status: 502 }
      );
    }

    if (categoriesTree.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Trendyol boş kategori ağacı döndürdü. API erişimini ve satıcı ID’yi kontrol edin.',
        },
        { status: 502 }
      );
    }

    const flatCategories: Array<{
      categoryId: number;
      name: string;
      parentId: number | null;
      isLeaf: boolean;
    }> = [];

    function childrenOf(node: Record<string, unknown>): unknown[] {
      const ch =
        node.subCategories ??
        node.subcategories ??
        node.children ??
        node.childCategories;
      return Array.isArray(ch) ? ch : [];
    }

    function nodeId(node: Record<string, unknown>): number | null {
      const v = node.id ?? node.categoryId ?? node.category_id;
      if (v === undefined || v === null) return null;
      return typeof v === 'string' ? parseInt(v, 10) : Number(v);
    }

    function traverse(nodes: unknown[], parentId: number | null = null) {
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const n = node as Record<string, unknown>;
        const id = nodeId(n);
        if (id === null || Number.isNaN(id)) continue;

        const ch = childrenOf(n);
        const explicitLeaf = n.leaf ?? n.isLeaf;
        const isLeaf =
          explicitLeaf === true || explicitLeaf === 1 || explicitLeaf === 'true'
            ? true
            : explicitLeaf === false || explicitLeaf === 0 || explicitLeaf === 'false'
              ? false
              : ch.length === 0;

        flatCategories.push({
          categoryId: id,
          name: String(n.name ?? n.title ?? n.displayName ?? '?').trim(),
          parentId,
          isLeaf,
        });

        if (ch.length > 0) traverse(ch, id);
      }
    }

    traverse(categoriesTree);

    if (flatCategories.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Trendyol kategori yanıtı işlenemedi (geçerli düğüm yok).',
        },
        { status: 502 }
      );
    }

    await connectToDatabase();

    const syncedIds = flatCategories.map((c) => c.categoryId);
    await Category.deleteMany({ categoryId: { $nin: syncedIds } });

    const bulkOps = flatCategories.map((cat) => ({
      updateOne: {
        filter: { categoryId: cat.categoryId },
        update: { $set: cat },
        upsert: true,
      },
    }));
    await Category.bulkWrite(bulkOps);

    const leafCount = flatCategories.filter((c) => c.isLeaf).length;

    return NextResponse.json({
      success: true,
      message: `Trendyol kategori ağacı senkronize edildi: ${flatCategories.length} kategori (${leafCount} yaprak — ürün eklenebilir). Eski/sahte kategoriler temizlendi.`,
      count: flatCategories.length,
      leafCount,
      categories: flatCategories,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
