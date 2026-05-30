/** Barkod okuma / arama için aday anahtarlar (EAN baştaki sıfır vb.) */

export function normalizeBarcode(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function barcodeLookupKeys(raw: string): string[] {
  const base = normalizeBarcode(raw);
  if (!base) return [];

  const keys = new Set<string>([base]);
  const digits = digitsOnly(base);

  if (digits) {
    keys.add(digits);
    if (digits !== base) keys.add(digits);
  }

  if (/^\d+$/.test(base)) {
    if (base.length === 12) keys.add(`0${base}`);
    if (base.length === 13 && base.startsWith("0")) keys.add(base.slice(1));
    if (base.length === 13 && !base.startsWith("0")) keys.add(`0${base}`);
    if (base.length < 13) keys.add(base.padStart(13, "0"));
    if (base.length < 12) keys.add(base.padStart(12, "0"));
    const trimmed = base.replace(/^0+/, "");
    if (trimmed && trimmed !== base) keys.add(trimmed);
    if (trimmed.length === 12) keys.add(`0${trimmed}`);
    if (trimmed.length === 13 && trimmed.startsWith("0")) keys.add(trimmed.slice(1));
  }

  if (digits && /^\d+$/.test(digits) && digits !== base) {
    if (digits.length === 12) keys.add(`0${digits}`);
    if (digits.length === 13 && digits.startsWith("0")) keys.add(digits.slice(1));
    if (digits.length < 13) keys.add(digits.padStart(13, "0"));
    const trimmedDigits = digits.replace(/^0+/, "");
    if (trimmedDigits) keys.add(trimmedDigits);
  }

  return [...keys].filter(Boolean);
}

export function barcodesMatch(a: string, b: string): boolean {
  const ka = barcodeLookupKeys(a);
  const kb = barcodeLookupKeys(b);
  return ka.some((x) => kb.includes(x));
}
