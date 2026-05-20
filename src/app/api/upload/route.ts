import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import {
  isTrendyolPublicImageUrl,
  toAbsolutePublicUrl,
} from '@/lib/public-image-url';

export const runtime = 'nodejs';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Dosya gerekli.' }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: 'Yalnızca JPEG, PNG, WebP veya GIF yükleyin.' },
        { status: 400 }
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Dosya en fazla 5 MB olabilir.' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const ext =
      file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : file.type === 'image/gif'
            ? 'gif'
            : 'jpg';
    const name = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
    const dir = path.join(process.cwd(), 'public', 'uploads', 'products');
    await mkdir(dir, { recursive: true });
    const fsPath = path.join(dir, name);
    await writeFile(fsPath, buf);

    const publicUrl = `/uploads/products/${name}`;
    const settingsDoc = await resolveSingletonSettingDocument();
    const imageBase = String(settingsDoc.get('publicAppUrl') ?? '').trim();
    const absoluteUrl = toAbsolutePublicUrl(publicUrl, imageBase);
    const trendyolReady = isTrendyolPublicImageUrl(absoluteUrl);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      absoluteUrl,
      trendyolReady,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Yükleme hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
