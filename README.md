# Kanal ERP

Trendyol, web mağazası ve B2B müşteri portalını tek panelden yöneten stok & sipariş ERP uygulaması.

**Canlı:** [https://erp-stok.vercel.app](https://erp-stok.vercel.app)

## Özellikler

| Modül | Açıklama |
|-------|----------|
| **Ürünler** | Tek SKU ve varyantlı ürünler, barkod, Trendyol kategori/öznitelik, kanal fiyatları |
| **Depo** | Çoklu depo, depo bazlı stok, transfer, barkod tarayıcı |
| **Siparişler** | Trendyol / web / perakende / B2B; etiket, işleme al, stok düşümü |
| **Trendyol** | Ürün & sipariş senkronu, stok/fiyat push, webhook, picking bildirimi |
| **Mağaza API** | Web sitesi stok/fiyat çekme ve webhook ile sipariş alma |
| **Müşteri portalı** | B2B katalog, sipariş, bakiye, profil |
| **Raporlar** | Satış, kâr, kanal dağılımı, kritik stok |
| **Mobil APK** | Capacitor shell — canlı siteyi WebView içinde açar |

## Teknoloji

- **Next.js 16** (App Router) + **React 19**
- **MongoDB** + Mongoose
- **Tailwind CSS v4**
- **Capacitor 7** (Android APK)
- **Vercel** (production deploy)

## Hızlı başlangıç

```bash
git clone https://github.com/erdemyildiz1306-spec/kanal-erp.git
cd kanal-erp
npm install
cp .env.example .env.local
# .env.local içinde MONGODB_URI ve AUTH_SESSION_SECRET ayarlayın
npm run dev
```

Uygulama varsayılan olarak [http://localhost:3005](http://localhost:3005) adresinde açılır.

İlk kayıt olan kullanıcı otomatik **yönetici (admin)** olur.

## Komutlar

| Komut | Açıklama |
|-------|----------|
| `npm run dev` | Geliştirme sunucusu (port 3005) |
| `npm run build` | Production build |
| `npm run start` | Production sunucusu |
| `npm run lint` | ESLint |

Mobil APK için `mobile-shell/` klasörüne bakın → [docs/mobil-apk.md](docs/mobil-apk.md)

## Dokümantasyon

| Dosya | Konu |
|-------|------|
| [docs/README.md](docs/README.md) | Dokümantasyon indeksi |
| [docs/kurulum.md](docs/kurulum.md) | Yerel geliştirme ortamı |
| [docs/deployment.md](docs/deployment.md) | Vercel production deploy |
| [docs/ortam-degiskenleri.md](docs/ortam-degiskenleri.md) | Tüm ortam değişkenleri |
| [docs/stok-ve-siparisler.md](docs/stok-ve-siparisler.md) | Stok düşümü, sipariş akışı, varyantlar |
| [docs/guvenlik.md](docs/guvenlik.md) | Production güvenlik gereksinimleri |
| [docs/mobil-apk.md](docs/mobil-apk.md) | Android APK derleme |
| [docs/api.md](docs/api.md) | API uç noktaları özeti |

## Proje yapısı

```
src/
  app/
    (erp)/          # Yönetici paneli sayfaları
    portal/         # B2B müşteri portalı
    api/            # REST API route'ları
    login/          # Giriş
  components/       # UI bileşenleri
  lib/              # İş mantığı (stok, sipariş, Trendyol, auth)
  models/           # Mongoose şemaları
mobile-shell/       # Capacitor Android projesi
public/             # Statik dosyalar (kanal-erp.apk)
```

## Production checklist

Canlıya almadan önce Vercel ortam değişkenlerinde şunların tanımlı olduğundan emin olun:

- `MONGODB_URI`
- `AUTH_SESSION_SECRET`
- `STORE_WEBHOOK_SECRET` (mağaza webhook kullanılıyorsa)
- Ayarlar → `webApiToken` (mağaza API kullanılıyorsa)

Detaylar: [docs/guvenlik.md](docs/guvenlik.md)

## Lisans

Private — tüm hakları saklıdır.
