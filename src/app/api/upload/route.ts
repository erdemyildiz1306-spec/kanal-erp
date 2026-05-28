import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { put } from '@vercel/blob';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import {
  isTrendyolPublicImageUrl,
  toAbsolutePublicUrl,
  getEffectivePublicAppUrl,
} from '@/lib/public-image-url';

export const runtime = 'nodejs';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

function canUseLocalUploads(): boolean {
  return !isVercelRuntime();
}

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

    const ext =
      file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : file.type === 'image/gif'
            ? 'gif'
            : 'jpg';
    const name = `products/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;

    const settingsDoc = await resolveSingletonSettingDocument();
    const imageBase = getEffectivePublicAppUrl(
      String(settingsDoc.get('publicAppUrl') ?? '')
    );

    let publicUrl: string;
    let absoluteUrl: string;

    if (isVercelRuntime() || process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(name, file, {
          access: 'public',
          addRandomSuffix: false,
          contentType: file.type,
        });
        publicUrl = blob.url;
        absoluteUrl = blob.url;
      } catch (blobErr: unknown) {
        const msg = blobErr instanceof Error ? blobErr.message : String(blobErr);
        return NextResponse.json(
          {
            error:
              'Vercel Blob yükleme başarısız. Vercel projesinde Storage > Blob store oluşturup BLOB_READ_WRITE_TOKEN tanımlayın. ' +
              (msg ? `(${msg})` : ''),
          },
          { status: 503 }
        );
      }
    } else if (canUseLocalUploads()) {
      const buf = Buffer.from(await file.arrayBuffer());
      const fileName = name.replace(/^products\//, '');
      const dir = path.join(process.cwd(), 'public', 'uploads', 'products');
      await mkdir(dir, { recursive: true });
      const fsPath = path.join(dir, fileName);
      await writeFile(fsPath, buf);
      publicUrl = `/uploads/products/${fileName}`;
      absoluteUrl = toAbsolutePublicUrl(publicUrl, imageBase);
    } else {
      return NextResponse.json(
        {
          error:
            'Bu ortamda dosya diske yazılamaz. Vercel Blob yapılandırın veya HTTPS görsel linki yapıştırın.',
        },
        { status: 503 }
      );
    }

    if (!absoluteUrl.startsWith('http')) {
      absoluteUrl = toAbsolutePublicUrl(publicUrl, imageBase);
    }
    const trendyolReady = isTrendyolPublicImageUrl(absoluteUrl);

    return NextResponse.json({
      success: true,
      url: absoluteUrl,
      absoluteUrl,
      trendyolReady,
      storage: isVercelRuntime() || process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local',
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Yükleme hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
