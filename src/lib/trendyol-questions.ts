import axios from 'axios';
import { getTrendyolAuthHeader, getTrendyolSettings } from './trendyol';
import { TrendyolEndpoints } from './trendyol-endpoints';

export type TrendyolQuestion = {
  id: number;
  text: string;
  status: string;
  productName?: string;
  imageUrl?: string;
  creationDate?: number;
  answer?: { text?: string; creationDate?: number };
};

export async function fetchTrendyolQuestions(
  tenantId?: string,
  opts?: {
    status?: 'WAITING_FOR_ANSWER' | 'ANSWERED' | 'REJECTED' | 'REPORTED';
    page?: number;
    size?: number;
  }
): Promise<{
  content: TrendyolQuestion[];
  totalElements: number;
  totalPages: number;
}> {
  const settings = await getTrendyolSettings(tenantId);
  const headers = getTrendyolAuthHeader(
    settings.apiKey,
    settings.apiSecret,
    settings.sellerId
  );
  const url = TrendyolEndpoints.customerQuestionsFilter(settings.sellerId);
  const endDate = Date.now();
  const startDate = endDate - 30 * 86_400_000;

  const { data } = await axios.get(url, {
    headers,
    params: {
      status: opts?.status,
      startDate,
      endDate,
      page: opts?.page ?? 0,
      size: Math.min(opts?.size ?? 20, 200),
      orderByField: 'CreatedDate',
      orderByDirection: 'DESC',
    },
    timeout: 60_000,
  });

  const content = Array.isArray(data?.content) ? data.content : [];
  return {
    content,
    totalElements: Number(data?.totalElements) || content.length,
    totalPages: Number(data?.totalPages) || 1,
  };
}

export async function answerTrendyolQuestion(
  tenantId: string | undefined,
  questionId: number | string,
  text: string
): Promise<void> {
  const settings = await getTrendyolSettings(tenantId);
  const headers = getTrendyolAuthHeader(
    settings.apiKey,
    settings.apiSecret,
    settings.sellerId
  );
  const url = TrendyolEndpoints.customerQuestionAnswer(
    settings.sellerId,
    questionId
  );
  await axios.post(url, { text }, { headers, timeout: 60_000 });
}
