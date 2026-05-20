/** Arama: Türkçe karakter ve büyük/küçük harf duyarsız regex deseni */
const TR_CHAR_CLASS: Record<string, string> = {
  i: "[iİIı]",
  İ: "[iİIı]",
  I: "[iİIı]",
  ı: "[iİIı]",
  s: "[sSşŞ]",
  S: "[sSşŞ]",
  ş: "[sSşŞ]",
  Ş: "[sSşŞ]",
  g: "[gGğĞ]",
  G: "[gGğĞ]",
  ğ: "[gGğĞ]",
  Ğ: "[gGğĞ]",
  u: "[uUüÜ]",
  U: "[uUüÜ]",
  ü: "[uUüÜ]",
  Ü: "[uUüÜ]",
  o: "[oOöÖ]",
  O: "[oOöÖ]",
  ö: "[oOöÖ]",
  Ö: "[oOöÖ]",
  c: "[cCçÇ]",
  C: "[cCçÇ]",
  ç: "[cCçÇ]",
  Ç: "[cCçÇ]",
};

function escapeRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildTurkishSearchRegex(query: string): RegExp {
  const q = String(query ?? "").trim();
  let pattern = "";
  for (const ch of q) {
    if (TR_CHAR_CLASS[ch]) {
      pattern += TR_CHAR_CLASS[ch];
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      const lower = ch.toLowerCase();
      const upper = ch.toUpperCase();
      pattern +=
        lower === upper
          ? escapeRegex(ch)
          : `[${escapeRegex(lower)}${escapeRegex(upper)}]`;
      continue;
    }
    pattern += escapeRegex(ch);
  }
  return new RegExp(pattern, "i");
}

export function normalizeSearchQuery(query: string): string {
  return String(query ?? "").trim().replace(/\s+/g, " ");
}

export function turkishTextIncludes(haystack: string, needle: string): boolean {
  const n = normalizeSearchQuery(needle);
  if (!n) return true;
  const h = String(haystack ?? "");
  if (!h) return false;
  try {
    return buildTurkishSearchRegex(n).test(h);
  } catch {
    return h.toLowerCase().includes(n.toLowerCase());
  }
}
