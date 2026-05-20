import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import Customer from '@/models/Customer';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, authenticated: false });
    }

    await connectToDatabase();

    if (session.role === 'customer') {
      const customer = await Customer.findById(session.userId).select('-passwordHash');
      if (!customer || !customer.active) {
        return NextResponse.json({ success: false, authenticated: false });
      }
      return NextResponse.json({
        success: true,
        authenticated: true,
        user: {
          id: String(customer._id),
          email: customer.email,
          name: customer.name,
          role: 'customer',
          balance: customer.balance,
        },
      });
    }

    const user = await User.findById(session.userId).select('-passwordHash');
    if (!user || !user.active) {
      return NextResponse.json({ success: false, authenticated: false });
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
