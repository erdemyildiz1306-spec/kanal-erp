/** Trendyol / giyim ERP — hazır varyant listeleri (sade) */

export const PRESET_VARIANT_COLORS = [
  'Siyah',
  'Beyaz',
  'Kırmızı',
  'Mavi',
  'Lacivert',
  'Gri',
  'Pembe',
  'Yeşil',
  'Sarı',
  'Bej',
  'Ekru',
  'Turuncu',
  'Mor',
  'Bordo',
  'Haki',
] as const;

/** Çocuk — yaş / ay (14-15 Yaş dahil) */
export const PRESET_VARIANT_SIZES_KIDS = [
  '0-3 Ay',
  '3-6 Ay',
  '6-9 Ay',
  '9-12 Ay',
  '12-18 Ay',
  '18-24 Ay',
  '2-3 Yaş',
  '3-4 Yaş',
  '4-5 Yaş',
  '5-6 Yaş',
  '6-7 Yaş',
  '7-8 Yaş',
  '8-9 Yaş',
  '9-10 Yaş',
  '10-11 Yaş',
  '11-12 Yaş',
  '12-13 Yaş',
  '13-14 Yaş',
  '14-15 Yaş',
] as const;

/** Yetişkin giyim bedenleri */
export const PRESET_VARIANT_SIZES_ADULT = [
  'S',
  'M',
  'L',
  'XL',
  'XXL',
] as const;

/** Ayakkabı numarası 16–46 */
export const PRESET_VARIANT_SIZES_SHOES = [
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '39',
  '40',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
] as const;

export type SizePresetKind = 'kids' | 'adult' | 'shoes';

export function presetSizesForKind(kind: SizePresetKind): readonly string[] {
  if (kind === 'shoes') return PRESET_VARIANT_SIZES_SHOES;
  if (kind === 'adult') return PRESET_VARIANT_SIZES_ADULT;
  return PRESET_VARIANT_SIZES_KIDS;
}

export function sizePresetLabel(kind: SizePresetKind): string {
  if (kind === 'shoes') return 'Ayakkabı no';
  if (kind === 'adult') return 'Yetişkin beden';
  return 'Çocuk / yaş';
}

export function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = String(raw ?? '').trim();
    if (!t) continue;
    const key = t.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function normKey(s: string): string {
  return s.trim().toLocaleLowerCase('tr-TR');
}

export function toggleInList(list: string[], value: string): string[] {
  const v = value.trim();
  if (!v) return list;
  const key = normKey(v);
  if (list.some((x) => normKey(x) === key)) {
    return list.filter((x) => normKey(x) !== key);
  }
  return [...list, v];
}

export function isSelectedInList(list: string[], value: string): boolean {
  return list.some((x) => normKey(x) === normKey(value));
}
