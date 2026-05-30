import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import StockMovement from '@/models/StockMovement';
import { requireSession } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';

export async function GET(request: Request) {
  try {
    const session = requireSession(request);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50));

    const rows = await StockMovement.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ success: true, movements: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
