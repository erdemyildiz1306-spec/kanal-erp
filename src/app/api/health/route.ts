import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();
    const dbOk = mongoose.connection.readyState === 1;
    return NextResponse.json(
      {
        ok: dbOk,
        db: dbOk ? 'connected' : 'disconnected',
        ts: new Date().toISOString(),
      },
      { status: dbOk ? 200 : 503 }
    );
  } catch {
    return NextResponse.json({ ok: false, db: 'error' }, { status: 503 });
  }
}
