/** Mağaza API yanıt hatalarını kullanıcıya anlaşılır Türkçe mesaja çevirir */

export function formatStorePushError(
  status: number,
  bodyText: string,
  endpoint: string
): string {
  const t = bodyText.trim();
  const isCloudflareHtml =
    t.includes('525') ||
    t.includes('SSL handshake failed') ||
    t.includes('cloudflare') ||
    t.startsWith('<!DOCTYPE') ||
    t.startsWith('<html');

  if (status === 525 || (isCloudflareHtml && t.includes('525'))) {
    return (
      `Mağaza sunucusunda SSL hatası (HTTP 525 — Cloudflare kaynak sunucuya bağlanamıyor). ` +
      `«${endpoint}» adresinde geçerli bir API ve çalışan HTTPS sertifikası olmalı. ` +
      `Cloudflare panelinde SSL/TLS modunu kontrol edin veya Ayarlar > Mağaza API taban adresini doğru API URL’si yapın ` +
      `(ör. https://sizin-erp.vercel.app/api/store).`
    );
  }

  if (status === 404 || t.includes('__next_error__')) {
    return (
      `Mağazada stok/fiyat API'si yok (HTTP 404). ` +
      `«${endpoint}» bulunamadı. Ayarlar > Mağaza API taban adresi: ` +
      `https://erp-stok.vercel.app/api/store (aynı ERP) veya mağaza sitenize ` +
      `src/app/api/store/stock-price/route.ts dosyasını deploy edin. ` +
      `Vitrin adresi (erayalpkids.com.tr) tek başına yetmez.`
    );
  }

  if (status === 401 || status === 403) {
    return (
      `Mağaza erişim reddetti (HTTP ${status}). Ayarlar > Mağaza API erişim token'ını kontrol edin.`
    );
  }

  if (isCloudflareHtml) {
    return (
      `Mağaza HTML hata sayfası döndürdü (HTTP ${status}) — API JSON bekleniyordu. ` +
      `Taban URL yanlış olabilir (vitrin sitesi yerine API adresi girin). Uç: ${endpoint}`
    );
  }

  const snippet = t.replace(/\s+/g, ' ').slice(0, 180);
  return snippet
    ? `Mağaza yanıtı HTTP ${status}: ${snippet}`
    : `Mağaza yanıtı HTTP ${status}. Uç: ${endpoint}`;
}
