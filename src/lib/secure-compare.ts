import { timingSafeEqual } from 'crypto';

/** Sabit süreli string karşılaştırma (webhook / token) */
export function secureCompareStrings(a: string, b: string): boolean {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
