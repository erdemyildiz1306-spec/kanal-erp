/** Barkod okuma / arama için aday anahtarlar (EAN baştaki sıfır vb.) */
export function normalizeBarcode(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

export function barcodeLookupKeys(raw: string): string[] {
  const base = normalizeBarcode(raw);
  if (!base) return [];

  const keys = new Set<string>([base]);
  if (/^\d+$/.test(base)) {
    if (base.length === 12) keys.add(`0${base}`);
    if (base.length === 13 && base.startsWith("0")) keys.add(base.slice(1));
    if (base.length < 13) keys.add(base.padStart(13, "0"));
    if (base.length < 12) keys.add(base.padStart(12, "0"));
  }
  return [...keys];
}

export function barcodesMatch(a: string, b: string): boolean {
  const ka = barcodeLookupKeys(a);
  const kb = barcodeLookupKeys(b);
  return ka.some((x) => kb.includes(x));
}
