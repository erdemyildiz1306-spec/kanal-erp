# Yerel Kurulum

## Gereksinimler

- **Node.js** 20+
- **npm** 10+
- **MongoDB** 6+ (yerel veya Atlas)
- Android APK derlemek için: **JDK 17**, **Android SDK** (opsiyonel)

## Adımlar

### 1. Bağımlılıkları yükle

```bash
npm install
```

### 2. Ortam değişkenlerini ayarla

```bash
cp .env.example .env.local
```

Minimum zorunlu değerler:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/kanal-erp
AUTH_SESSION_SECRET=gelistirme-icin-uzun-rastgele-dize
```

Tüm değişkenler için [ortam-degiskenleri.md](./ortam-degiskenleri.md) dosyasına bakın.

### 3. MongoDB'yi başlat

Yerel MongoDB:

```bash
# Windows — MongoDB servisi çalışıyor olmalı
# veya Docker:
docker run -d -p 27017:27017 --name mongo mongo:7
```

MongoDB yoksa geliştirme ortamı `.data/mongo-dev` altında yedek veritabanına düşebilir (proje davranışına bağlı).

### 4. Geliştirme sunucusunu başlat

```bash
npm run dev
```

Tarayıcıda [http://localhost:3005](http://localhost:3005) adresini açın.

### 5. İlk kullanıcı

`/login` sayfasından **Kayıt Ol** ile ilk hesabı oluşturun. İlk kayıt olan kullanıcı otomatik **admin** rolü alır.

## Trendyol entegrasyonu (geliştirme)

Trendyol API anahtarları olmadan test etmek için `.env.local`:

```env
TRENDYOL_ALLOW_SYNC_MOCK=true
TRENDYOL_ALLOW_ORDER_SYNC_MOCK=true
```

Gerçek API için Ayarlar sayfasından `trendyolSellerId`, `trendyolApiKey`, `trendyolApiSecret` girin.

## Sorun giderme

| Belirti | Çözüm |
|---------|-------|
| `AUTH_SESSION_SECRET üretim ortamında zorunludur` | `.env.local`'de secret tanımlayın |
| MongoDB bağlantı hatası | `MONGODB_URI` ve MongoDB servisini kontrol edin |
| Port 3005 meşgul | `npm run dev -- -p 3006` veya meşgul süreci kapatın |
| Trendyol sync boş | Mock flag'leri açın veya API anahtarlarını doğrulayın |

Health check: `GET http://localhost:3005/api/health`
