import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

function devResetAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** Yerel geliştirme: tüm kullanıcıları siler; sonraki girişte yeni admin oluşturulur. */
export async function GET() {
  return NextResponse.json({ allowed: devResetAllowed() });
}

export async function POST() {
  if (!devResetAllowed()) {
    return NextResponse.json(
      { success: false, error: 'Bu işlem yalnızca geliştirme ortamında kullanılabilir.' },
      { status: 403 }
    );
  }

  try {
    await connectToDatabase();
    const deleted = await User.deleteMany({});
    return NextResponse.json({
      success: true,
      message: `${deleted.deletedCount} kullanıcı silindi. Şimdi istediğiniz e-posta ve şifre ile giriş yapın; otomatik yönetici oluşturulur.`,
      deletedCount: deleted.deletedCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
