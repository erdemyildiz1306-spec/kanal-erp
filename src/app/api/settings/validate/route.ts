import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { requireSession } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';
import { validateDeploymentSettings } from '@/lib/settings-validate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const origin = new URL(request.url).origin;
    const report = await validateDeploymentSettings(
      tenantScope(session).tenantId,
      origin
    );

    return NextResponse.json({ success: true, ...report });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Doğrulama hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
