import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import path from 'path';

/** Mobil APK bilgisi — public/kanal-erp.apk dosyası varsa indirme linki döner */
export async function GET() {
  const apkPath = path.join(process.cwd(), 'public', 'kanal-erp.apk');
  const available = existsSync(apkPath);
  const version = process.env.APK_VERSION?.trim() || '1.0.0';
  return NextResponse.json({
    success: true,
    available,
    version,
    downloadUrl: available ? '/kanal-erp.apk' : null,
    buildHint:
      'APK: mobile-shell klasöründe Capacitor ile derlenir (sipariş projesindeki release:apk akışına benzer).',
  });
}
