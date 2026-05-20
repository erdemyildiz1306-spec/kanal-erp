import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { calculateInvoiceTotals } from '@/lib/invoice-math';
import { requireSession } from '@/lib/auth';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const { id } = await context.params;
    const inv = await Invoice.findById(id).lean();
    if (!inv) {
      return NextResponse.json({ success: false, error: 'Fatura bulunamadı.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, invoice: inv });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'operator', 'accountant']);
    if (session instanceof Response) return session;

    const { id } = await context.params;
    const data = await request.json();

    const inv = await Invoice.findById(id);
    if (!inv) {
      return NextResponse.json({ success: false, error: 'Fatura bulunamadı.' }, { status: 404 });
    }

    if (data.status) {
      const status = String(data.status);
      if (!['Taslak', 'Kesildi', 'İptal'].includes(status)) {
        return NextResponse.json({ success: false, error: 'Geçersiz durum.' }, { status: 400 });
      }
      if (inv.status === 'Kesildi' && status === 'Taslak') {
        return NextResponse.json(
          { success: false, error: 'Kesilmiş fatura taslağa alınamaz.' },
          { status: 400 }
        );
      }
      inv.status = status as typeof inv.status;
    }

    if (data.externalDocumentId !== undefined) {
      inv.externalDocumentId = String(data.externalDocumentId ?? '');
    }

    const isDraftEdit = inv.status === 'Taslak';
    if (isDraftEdit) {
      if (data.customerName !== undefined) inv.customerName = String(data.customerName ?? '');
      if (data.customerTaxId !== undefined) inv.customerTaxId = String(data.customerTaxId ?? '');
      if (data.customerAddress !== undefined) inv.customerAddress = String(data.customerAddress ?? '');
      if (data.orderRef !== undefined) inv.orderRef = String(data.orderRef ?? '');

      if (Array.isArray(data.lines)) {
        const totals = calculateInvoiceTotals(
          data.lines.map(
            (l: { description?: string; quantity?: number; unitPrice?: number; vatRate?: number }) => ({
              description: l.description || 'Kalem',
              quantity: Number(l.quantity) || 0,
              unitPrice: Number(l.unitPrice) || 0,
              vatRate: Number.isFinite(Number(l.vatRate)) ? Number(l.vatRate) : 20,
            })
          )
        );
        inv.lines = totals.lines;
        inv.netTotal = totals.netTotal;
        inv.vatTotal = totals.vatTotal;
        inv.grandTotal = totals.grandTotal;
        inv.markModified('lines');
      }
    }

    await inv.save();
    return NextResponse.json({ success: true, invoice: inv });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'accountant']);
    if (session instanceof Response) return session;

    const { id } = await context.params;
    const inv = await Invoice.findById(id);
    if (!inv) {
      return NextResponse.json({ success: false, error: 'Fatura bulunamadı.' }, { status: 404 });
    }
    if (inv.status !== 'Taslak') {
      return NextResponse.json(
        { success: false, error: 'Yalnızca taslak faturalar silinebilir.' },
        { status: 400 }
      );
    }

    await Invoice.deleteOne({ _id: inv._id });
    return NextResponse.json({ success: true, message: 'Taslak silindi.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
