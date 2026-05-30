import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import Order from '@/models/Order';
import Setting from '@/models/Setting';
import { requireSession } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';

export async function GET(request: Request) {
  try {
    const auth = requireSession(request, ['admin']);
    if (auth instanceof Response) return auth;

    const { tenantId } = tenantScope(auth);
    await connectToDatabase();
    const [products, orders, settings] = await Promise.all([
      Product.find({ tenantId }).lean(),
      Order.find({ tenantId }).sort({ createdAt: -1 }).limit(5000).lean(),
      Setting.find({ tenantId }).lean(),
    ]);
    const payload = {
      exportedAt: new Date().toISOString(),
      tenantId,
      products,
      orders,
      settings: settings.map((s) => {
        const o = { ...s } as Record<string, unknown>;
        delete o.trendyolApiKey;
        delete o.trendyolApiSecret;
        delete o.webApiToken;
        return o;
      }),
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="kanal-erp-backup-${tenantId}-${Date.now()}.json"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Yedek hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
