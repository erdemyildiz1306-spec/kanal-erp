const PDF = Buffer.from('%PDF');
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(buf: Buffer, prefix: Buffer): boolean {
  return buf.length >= prefix.length && buf.subarray(0, prefix.length).equals(prefix);
}

/** İstemci MIME beyanı yerine dosya imzasına bak */
export function detectAllowedInvoiceMime(buf: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (startsWith(buf, PDF)) return 'application/pdf';
  if (startsWith(buf, JPEG)) return 'image/jpeg';
  if (startsWith(buf, PNG)) return 'image/png';
  return null;
}

/** Ürün görseli yükleme — JPEG, PNG, GIF, WebP */
export function detectProductImageMime(
  buf: Buffer
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  if (startsWith(buf, JPEG)) return 'image/jpeg';
  if (startsWith(buf, PNG)) return 'image/png';
  if (buf.length >= 6 && buf.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
