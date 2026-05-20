import { NextResponse } from 'next/server';
import {
  getTrendyolSettings,
  formatTrendyolAxiosError,
  summarizeTrendyolBatchResult,
  getTrendyolProductWriteHeaders,
} from '@/lib/trendyol';
import axios from 'axios';
import { TrendyolEndpoints } from '@/lib/trendyol-endpoints';

/** Trendyol batch sonucunu teşhis için döner (yayımlama sonrası kontrol) */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const batchRequestId = String(searchParams.get('batchRequestId') ?? '').trim();
    if (!batchRequestId) {
      return NextResponse.json(
        { success: false, error: 'batchRequestId zorunlu.' },
        { status: 400 }
      );
    }

    const settings = await getTrendyolSettings();
    const url = TrendyolEndpoints.batchRequestResult(
      settings.sellerId,
      batchRequestId
    );
    const headers = getTrendyolProductWriteHeaders(
      settings.apiKey,
      settings.apiSecret,
      settings.sellerId
    );

    const response = await axios.get(url, {
      headers,
      timeout: 60_000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      return NextResponse.json(
        {
          success: false,
          error: `Trendyol batch sorgusu HTTP ${response.status}.`,
          data: response.data,
        },
        { status: 502 }
      );
    }

    const summary = summarizeTrendyolBatchResult(response.data);
    const root = response.data as Record<string, unknown>;
    const status = String(root.status ?? '').trim();

    return NextResponse.json({
      success: true,
      batchRequestId,
      batchStatus: status,
      ...summary,
      hint:
        summary.successCount > 0
          ? 'Ürünler Trendyol satıcı panelinde «Onay bekleyenler» listesinde görünür (onaylı ürünler değil).'
          : summary.itemErrors[0] ??
            'Henüz işlenmedi veya tüm satırlar reddedildi.',
      raw: response.data,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: formatTrendyolAxiosError(error) },
      { status: 502 }
    );
  }
}
