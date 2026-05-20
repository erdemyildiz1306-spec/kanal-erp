import { NextResponse } from 'next/server';
import { getAuthPolicy } from '@/lib/auth-settings';

export async function GET() {
  const policy = await getAuthPolicy();
  return NextResponse.json({
    success: true,
    allowSignup: policy.allowSignup,
    requireApproval: policy.requireApproval,
    minPasswordLength: 8,
  });
}
