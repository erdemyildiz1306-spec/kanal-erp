import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { calculateInvoiceTotals } from '@/lib/invoice-math';
import { createErpInvoiceWithRetry } from '@/lib/erp-invoice-number';
import { requireSession } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';

export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator', 'accountant']);
    if (session instanceof Response) return session;

    const scope = tenantScope(session);
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const q: Record<string, string> = { ...scope };
    if (status && status !== 'Tümü') q.status = status;

    const limit = Math.min(Math.max(1, Number(searchParams.get('limit')) || 500), 2000);
    const invoices = await Invoice.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    return NextResponse.json({ success: true, invoices, limit });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator', 'accountant']);
    if (session instanceof Response) return session;

    await connectToDatabase();
    const data = await request.json();

    const rawLines = Array.isArray(data.lines) ? data.lines : [];
    const { lines, netTotal, vatTotal, grandTotal } = calculateInvoiceTotals(
      rawLines.map((l: { description?: string; quantity?: number; unitPrice?: number; vatRate?: number }) => ({
        description: l.description || 'Kalem',
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        vatRate: Number.isFinite(Number(l.vatRate))
          ? Number(l.vatRate)
          : 20,
      }))
    );

    const payload = {
      tenantId: tenantScope(session).tenantId,
      orderRef: data.orderRef || '',
      status: data.status || 'Taslak',
      customerName: data.customerName || '',
      customerTaxId: data.customerTaxId || '',
      customerAddress: data.customerAddress || '',
      lines,
      netTotal,
      vatTotal,
      grandTotal,
    };

    const customNumber = String(data.invoiceNumber ?? '').trim();
    const inv = customNumber
      ? await Invoice.create({ ...payload, invoiceNumber: customNumber })
      : await createErpInvoiceWithRetry(payload);

    return NextResponse.json({ success: true, invoice: inv });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
