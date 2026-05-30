import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import { validateDeploymentSettings } from '@/lib/settings-validate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const dbOk = mongoose.connection.readyState === 1;
    const url = new URL(request.url);
    const deep = url.searchParams.get('deep') === '1';

    if (deep) {
      const report = await validateDeploymentSettings('default', url.origin);
      return NextResponse.json(
        {
          ok: dbOk && report.ok,
          db: dbOk ? 'connected' : 'disconnected',
          deployment: report,
          ts: new Date().toISOString(),
        },
        { status: dbOk ? 200 : 503 }
      );
    }

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
