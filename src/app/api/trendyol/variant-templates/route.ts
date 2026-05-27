import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import {
  importVariantTemplatesFromCategory,
  listVariantTemplates,
} from '@/lib/trendyol-variant-templates';

export async function GET(request: Request) {
  try {
    getSessionFromRequest(request);
    const templates = await listVariantTemplates();
    return NextResponse.json({ success: true, templates });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    getSessionFromRequest(request);
    const body = (await request.json()) as { categoryId?: number; trendyolCategoryId?: number };
    const categoryId = Number(body.categoryId ?? body.trendyolCategoryId);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Geçerli Trendyol categoryId girin.' },
        { status: 400 }
      );
    }

    const result = await importVariantTemplatesFromCategory(categoryId);
    return NextResponse.json({
      success: true,
      created: result.created,
      varianterCount: result.created.length,
      skipped: result.skipped,
      skippedAlreadyExists: result.skippedAlreadyExists,
      skippedNoValues: result.skippedNoValues,
      hint:
        result.created.length === 0
          ? 'Varianter/slicer özellik bulunamadı veya şablonlar zaten mevcut.'
          : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
