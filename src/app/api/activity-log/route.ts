import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ActivityLog from '@/models/ActivityLog';
import { requireSession } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50));
    const logs = await ActivityLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    return NextResponse.json({ success: true, logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
