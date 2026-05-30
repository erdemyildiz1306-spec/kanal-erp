import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { requireSession, type SessionUser } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';
import { StoreInvoiceError, mapStoreInvoiceHttpError } from '@/lib/store-invoice-errors';
import { checkRateLimit } from '@/lib/rate-limit';

const INVOICE_ROLES = ['admin', 'operator', 'accountant'] as const;

export function requireStoreInvoiceSession(request: Request) {
  const session = requireSession(request, [...INVOICE_ROLES]);
  if (session instanceof NextResponse) return session;
  return session;
}

/** Trendyol + mağaza fatura API'leri için ortak rol kontrolü */
export const requireInvoiceSession = requireStoreInvoiceSession;

export function assertValidStoreOrderId(orderId: string) {
  const id = String(orderId ?? '').trim();
  if (!id) {
    throw new StoreInvoiceError('orderId zorunlu.', 400);
  }
  if (!mongoose.isValidObjectId(id)) {
    throw new StoreInvoiceError('Geçersiz sipariş ID.', 400);
  }
  return id;
}

export function enforceInvoiceRateLimit(userId: string): NextResponse | null {
  const rl = checkRateLimit(`invoice:${userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: `Çok fazla fatura isteği. ${rl.retryAfterSec} sn sonra deneyin.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }
  return null;
}

export function storeInvoiceErrorResponse(error: unknown) {
  const { status, message } = mapStoreInvoiceHttpError(error);
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function logInvoiceActivity(
  session: SessionUser,
  input: {
    platform: 'web' | 'trendyol';
    action: 'issue' | 'send_link' | 'upload';
    orderNumber: string;
    invoiceNumber?: string;
    mode?: string;
  }
) {
  await logActivity({
    action: `${input.platform}_invoice_${input.action}`,
    module: 'invoices',
    detail: `${input.platform === 'web' ? 'Mağaza' : 'Trendyol'} fatura — ${input.orderNumber}${input.invoiceNumber ? ` (${input.invoiceNumber})` : ''}`,
    userId: session.userId,
    userName: session.name,
    tenantId: session.tenantId,
    meta: {
      platform: input.platform,
      orderNumber: input.orderNumber,
      invoiceNumber: input.invoiceNumber ?? '',
      mode: input.mode ?? '',
    },
  });
}
