import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Customer from '@/models/Customer';
import Order from '@/models/Order';
import CariEntry from '@/models/CariEntry';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    if (!session || session.role !== 'customer') {
      return NextResponse.json({ success: false, error: 'Müşteri oturumu gerekli.' }, { status: 401 });
    }

    const customer = await Customer.findById(session.userId).lean();
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Müşteri bulunamadı.' }, { status: 404 });
    }

    const payments = await CariEntry.find({
      customerId: customer._id,
      type: 'tahsilat',
    }).lean();
    const totalPayments = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);

    const orders = await Order.find({
      $or: [
        { customerId: customer._id, platform: 'b2b' },
        { customerName: customer.name },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      success: true,
      summary: {
        balance: Number(customer.balance) || 0,
        totalPayments,
        orderCount: orders.length,
      },
      customer: {
        name: customer.name,
        email: customer.email,
        companyName: customer.companyName,
        phone: customer.phone,
      },
      orders,
      payments,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
