/** Sunucu tarafı outbound fetch için URL doğrulama (SSRF azaltma) */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'metadata.google',
]);

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.startsWith('fc') ||
    h.startsWith('fd') ||
    h.startsWith('fe80') ||
    h === '::1' ||
    h.startsWith('::ffff:127.') ||
    h.startsWith('::ffff:10.') ||
    h.startsWith('::ffff:192.168.')
  );
}

export class OutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundUrlError';
  }
}

/** HTTPS dış URL — localhost / RFC1918 / metadata engellenir */
export function assertSafeOutboundHttpsUrl(raw: string, label = 'URL'): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    throw new OutboundUrlError(`${label} boş olamaz.`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new OutboundUrlError(`${label} geçersiz.`);
  }

  if (url.protocol !== 'https:') {
    throw new OutboundUrlError(`${label} yalnızca HTTPS olabilir.`);
  }

  if (url.username || url.password) {
    throw new OutboundUrlError(`${label} kullanıcı adı veya parola içeremez.`);
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    throw new OutboundUrlError(`${label} yerel veya engelli bir adrese işaret ediyor.`);
  }

  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new OutboundUrlError(`${label} özel ağ adresine işaret ediyor.`);
  }

  return url.href;
}

export function assertHttpsInvoiceLink(link: string): string {
  return assertSafeOutboundHttpsUrl(link, 'Fatura linki');
}
