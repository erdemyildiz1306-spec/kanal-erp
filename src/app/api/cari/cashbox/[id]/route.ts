import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Cashbox from '@/models/Cashbox';
import { requireSession } from '@/lib/auth';
import { tenantScope, belongsToTenant } from '@/lib/tenant';

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'operator', 'accountant']);
    if (session instanceof NextResponse) return session;

    const { tenantId } = tenantScope(session);
    const { id } = await ctx.params;
    const data = await request.json();
    const box = await Cashbox.findById(id);
    if (!box) {
      return NextResponse.json({ success: false, error: 'Kasa bulunamadı.' }, { status: 404 });
    }
    if (!belongsToTenant(session, box.tenantId)) {
      return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 403 });
    }

    if (data.name !== undefined) {
      const name = String(data.name ?? '').trim();
      if (!name) {
        return NextResponse.json({ success: false, error: 'Kasa adı zorunlu.' }, { status: 400 });
      }
      box.name = name;
    }
    if (data.type !== undefined) {
      box.type = ['general', 'bank', 'pos'].includes(data.type) ? data.type : box.type;
    }

    await box.save();
    return NextResponse.json({ success: true, cashbox: box });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { tenantId } = tenantScope(session);
    const { id } = await ctx.params;
    const box = await Cashbox.findOne({ _id: id, tenantId });
    if (!box) {
      return NextResponse.json({ success: false, error: 'Kasa bulunamadı.' }, { status: 404 });
    }
    if (box.isDefault) {
      return NextResponse.json({ success: false, error: 'Varsayılan kasa silinemez.' }, { status: 400 });
    }
    if (Number(box.balance) !== 0) {
      return NextResponse.json(
        { success: false, error: 'Bakiyeli kasa silinemez.' },
        { status: 400 }
      );
    }

    await Cashbox.deleteOne({ _id: box._id, tenantId });
    return NextResponse.json({ success: true, message: 'Kasa silindi.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
