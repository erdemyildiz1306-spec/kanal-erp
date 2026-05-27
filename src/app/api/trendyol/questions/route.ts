import { NextResponse } from 'next/server';
import {
  answerTrendyolQuestion,
  fetchTrendyolQuestions,
} from '@/lib/trendyol-questions';
import { formatTrendyolAxiosError } from '@/lib/trendyol';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as
      | 'WAITING_FOR_ANSWER'
      | 'ANSWERED'
      | undefined;
    const page = Number(searchParams.get('page') ?? 0);
    const data = await fetchTrendyolQuestions({
      status: status ?? undefined,
      page,
      size: 30,
    });
    return NextResponse.json({ success: true, ...data });
  } catch (error: unknown) {
    const message =
      formatTrendyolAxiosError(error) ||
      (error instanceof Error ? error.message : 'Sorular alınamadı');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { questionId?: number; text?: string };
    const questionId = body.questionId;
    const text = String(body.text ?? '').trim();
    if (!questionId || !text) {
      return NextResponse.json(
        { success: false, error: 'questionId ve text zorunlu' },
        { status: 400 }
      );
    }
    await answerTrendyolQuestion(questionId, text);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      formatTrendyolAxiosError(error) ||
      (error instanceof Error ? error.message : 'Cevap gönderilemedi');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
