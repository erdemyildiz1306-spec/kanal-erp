export const MIN_PASSWORD_LENGTH = 8;

export function normalizeAuthEmail(raw: unknown): string {
  return String(raw ?? '').toLowerCase().trim();
}

export function validateAuthEmail(email: string): string | null {
  if (!email) return 'E-posta zorunludur.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Geçerli bir e-posta adresi girin.';
  }
  return null;
}

export function validateAuthPassword(password: string): string | null {
  const p = String(password ?? '');
  if (!p) return 'Şifre zorunludur.';
  if (p.length < MIN_PASSWORD_LENGTH) {
    return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`;
  }
  return null;
}

export function validateAuthName(name: string): string | null {
  const n = String(name ?? '').trim();
  if (!n) return 'Ad soyad zorunludur.';
  if (n.length < 2) return 'Ad soyad en az 2 karakter olmalıdır.';
  return null;
}
