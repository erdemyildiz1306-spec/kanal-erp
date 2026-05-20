/**
 * Model SKU: EAY ile kısa prefix; Trendyol merchantSku ile uyumlu [A-Z0-9-_].
 */

function randomSkuSuffix(len: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function slugifyPart(s: string, max = 12): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .toUpperCase() || 'X';
}

/** Örn: EAY-X7KA2 · kısa, EAY ile başlar */
export function generateModelSku(opts?: {
  /** Geriye uyumluluk için bırakıldı — çıktı her zaman EAY‑prefixed olur */
  nameHint?: string;
  categoryHint?: string;
}): string {
  void opts;
  return `EAY-${randomSkuSuffix(5)}`;
}

/** EAN-13 (ülke kodu 869/868). Geçerli kontrol rakamı üretir. */
export function generateEan13(): string {
  const prefix = Math.random() > 0.5 ? '868' : '869';
  let body = prefix;
  for (let i = 0; i < 9; i++) body += Math.floor(Math.random() * 10).toString();
  const check = eanCheckDigit(body);
  return body + String(check);
}

export function eanCheckDigit(body12: string): number {
  if (body12.length !== 12) return 0;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(body12[i]!, 10);
    sum += i % 2 === 1 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10;
}

export function variantSkuFromParts(
  modelSku: string,
  colorLabel: string,
  sizeLabel: string,
  rowIdx: number
): string {
  let base = modelSku.split(/[\/]/)[0]?.trim() || '';
  base = /^EAY-/i.test(base) ? base : `EAY-${slugifyPart(base, 6)}`;
  /** satır SKU: kısa renk/beden kodları */
  const c = slugifyPart(colorLabel || `C${rowIdx + 1}`, 3);
  const s = slugifyPart(sizeLabel || `S${rowIdx + 1}`, 3);
  return `${base}-${c}-${s}`.slice(0, 28);
}

