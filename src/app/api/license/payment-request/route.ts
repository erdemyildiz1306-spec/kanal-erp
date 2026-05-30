import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import LicensePaymentRequest from '@/models/LicensePaymentRequest';
import { requireSession } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';
import { getPlatformBankInfo } from '@/lib/platform-billing';
import {
  licenseAmountForPackage,
  type LicensePackageKey,
  type BillingPeriod,
} from '@/lib/license-packages';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = requireSession(request, ['admin']);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const requests = await LicensePaymentRequest.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return NextResponse.json({ success: true, requests });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin']);
    if (session instanceof NextResponse) return session;

    const bank = getPlatformBankInfo();
    if (!bank.configured) {
      return NextResponse.json(
        { success: false, error: 'Platform banka bilgileri henüz tanımlı değil.' },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      packageKey?: LicensePackageKey;
      plan?: BillingPeriod;
      senderName?: string;
      transferReference?: string;
      note?: string;
    };
    const packageKey = body.packageKey === 'efatura' ? 'efatura' : 'standard';
    const plan: BillingPeriod = body.plan === 'yearly' ? 'yearly' : 'monthly';
    const senderName = String(body.senderName ?? '').trim();
    const transferReference = String(body.transferReference ?? '').trim();

    if (!senderName || !transferReference) {
      return NextResponse.json(
        { success: false, error: 'Gönderen adı ve havale referansı zorunlu.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const { tenantId } = tenantScope(session);

    const pending = await LicensePaymentRequest.findOne({ tenantId, status: 'pending' }).lean();
    if (pending) {
      return NextResponse.json(
        { success: false, error: 'Bekleyen bir ödeme bildiriminiz var. Onaylanmasını bekleyin.' },
        { status: 409 }
      );
    }

    const row = await LicensePaymentRequest.create({
      tenantId,
      packageKey,
      plan,
      amount: licenseAmountForPackage(packageKey, plan),
      senderName,
      transferReference,
      note: String(body.note ?? '').trim(),
      submittedByUserId: session.userId,
    });

    return NextResponse.json({ success: true, request: row });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bildirim kaydedilemedi';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
