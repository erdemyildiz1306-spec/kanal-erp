import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { calculateInvoiceTotals } from '@/lib/invoice-math';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const q: Record<string, string> = {};
    if (status && status !== 'Tümü') q.status = status;

    const invoices = await Invoice.find(q).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, invoices });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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

    const count = await Invoice.countDocuments();
    const invoiceNumber =
      data.invoiceNumber || `FTR-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const inv = new Invoice({
      invoiceNumber,
      orderRef: data.orderRef || '',
      status: data.status || 'Taslak',
      customerName: data.customerName || '',
      customerTaxId: data.customerTaxId || '',
      customerAddress: data.customerAddress || '',
      lines,
      netTotal,
      vatTotal,
      grandTotal,
    });

    await inv.save();
    return NextResponse.json({ success: true, invoice: inv });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
