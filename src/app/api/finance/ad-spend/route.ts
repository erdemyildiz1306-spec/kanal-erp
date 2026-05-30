import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import AdSpendEntry from '@/models/AdSpendEntry';
import { requireSession } from '@/lib/auth';
import { tenantScope, belongsToTenant } from '@/lib/tenant';

const FINANCE_ROLES = ['admin', 'operator', 'accountant'] as const;

export async function GET(request: Request) {
  try {
    const session = requireSession(request, [...FINANCE_ROLES]);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const rows = await AdSpendEntry.find({ tenantId })
      .sort({ spendDate: -1 })
      .limit(100)
      .lean();
    return NextResponse.json({ success: true, entries: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Liste alınamadı';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'accountant']);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const body = await request.json();
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Geçerli bir tutar girin' },
        { status: 400 }
      );
    }

    const spendDate = body?.spendDate ? new Date(body.spendDate) : new Date();
    if (Number.isNaN(spendDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz tarih' },
        { status: 400 }
      );
    }

    const doc = await AdSpendEntry.create({
      tenantId,
      spendDate,
      amount,
      platform: String(body?.platform ?? 'trendyol').trim() || 'trendyol',
      campaign: String(body?.campaign ?? '').trim(),
      note: String(body?.note ?? '').trim(),
      source: 'manual',
    });

    return NextResponse.json({ success: true, entry: doc });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Kayıt eklenemedi';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'accountant']);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 });
    }
    const row = await AdSpendEntry.findOne({ _id: id, tenantId }).lean();
    if (!row || row.source !== 'manual') {
      return NextResponse.json(
        { success: false, error: 'Sadece manuel kayıtlar silinebilir' },
        { status: 400 }
      );
    }
    await AdSpendEntry.deleteOne({ _id: id, tenantId });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Silinemedi';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
