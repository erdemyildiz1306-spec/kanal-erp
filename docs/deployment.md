# Production Deploy (Vercel)

Kanal ERP, GitHub `main` branch'ine push edildiğinde Vercel üzerinde otomatik deploy edilir.

**Canlı URL:** https://erp-stok.vercel.app

## Deploy akışı

```bash
git add .
git commit -m "Değişiklik açıklaması"
git push origin main
```

Vercel dashboard'dan deploy durumunu izleyin. Build başarılı olduktan sonra 1–2 dakika içinde canlıya yansır.

## Vercel ortam değişkenleri

Vercel → Project → Settings → Environment Variables:

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `MONGODB_URI` | Evet | MongoDB Atlas connection string |
| `AUTH_SESSION_SECRET` | Evet | Güçlü rastgele dize (min. 32 karakter) |
| `STORE_WEBHOOK_SECRET` | Webhook varsa | Mağaza sipariş webhook doğrulama |
| `NEXT_PUBLIC_APP_URL` | Önerilir | `https://erp-stok.vercel.app` |
| `ROOT_ADMIN_EMAILS` | Root panel | Virgülle ayrılmış platform yönetici e-postaları |
| `ROOT_ADMIN_PASSWORD` | Root bootstrap | İlk giriş / şifre sıfırlama (yalnızca ROOT_ADMIN_EMAILS ile eşleşen hesap) |
| `PLATFORM_BANK_NAME` | Lisans ödemesi | Havale banka adı |
| `PLATFORM_ACCOUNT_HOLDER` | Lisans ödemesi | Hesap sahibi |
| `PLATFORM_IBAN` | Lisans ödemesi | IBAN |
| `LICENSE_STANDARD_MONTHLY` | Lisans | Standart paket aylık (TL) |
| `LICENSE_EFATURA_MONTHLY` | Lisans | E-Faturam paketi aylık (TL) |
| `RESEND_API_KEY` | E-posta varsa | Şifre sıfırlama e-postası |
| `MAIL_FROM` | E-posta varsa | Gönderen adresi |

Detaylı liste: [ortam-degiskenleri.md](./ortam-degiskenleri.md)

## Deploy sonrası kontrol listesi

1. **Health check:** `GET /api/health` → `{ "ok": true, "db": "connected" }`
2. **Giriş:** `/login` ile admin oturumu açın
3. **Ayarlar:** Trendyol / mağaza API bilgilerini kaydedin
4. **Depo onarımı** (varyantlı ürünler varsa, bir kez):

```javascript
fetch('/api/inventory/repair-warehouse', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ all: true })
}).then(r => r.json()).then(console.log)
```

5. **Test siparişi:** Etiket al → stok doğru varyanttan düştü mü kontrol edin

## APK ve web deploy

Capacitor APK, canlı Vercel URL'sini WebView içinde açar (`mobile-shell/capacitor.config.json` → `server.url`).

- **Yalnızca web değişikliği:** APK yeniden derlemeye gerek yok; deploy yeterli
- **Native değişiklik** (kamera izni, Capacitor config): APK yeniden derlenmeli → [mobil-apk.md](./mobil-apk.md)

## MongoDB Atlas

Production için MongoDB Atlas önerilir:

1. Cluster oluşturun (M0 free tier yeterli başlangıç için)
2. Network Access → `0.0.0.0/0` (Vercel IP'leri dinamik)
3. Database Access → kullanıcı oluşturun
4. Connection string'i `MONGODB_URI` olarak Vercel'e ekleyin

Index'ler uygulama ilk çalıştığında Mongoose tarafından oluşturulur (`Order`, `Product`, `WarehouseStock`).

## Trendyol sipariş senkronu (3 katman)

Gün içinde gelen siparişler yalnızca günde 1 kez çekilmez:

1. **Otomatik (panel açıkken)** — ERP'de oturum açıkken varsayılan **2 dakikada bir** Trendyol sipariş çekimi (`OrderAutoSync`). Aralık: Ayarlar → Trendyol → «Otomatik sync aralığı (dk)».
2. **Webhook (anında)** — Trendyol webhook URL tanımlıysa sipariş anında düşer.
3. **Vercel cron (yedek)** — Panel kapalıyken günde 1 kez (04:00) yedek senkron. Hobby planda cron günde en fazla 1 kez çalışabilir; asıl akış 1 ve 2 numaralı maddelerdir.

Manuel «Trendyol'dan Çek» butonu her zaman kullanılabilir.

## Rollback

Vercel dashboard → Deployments → önceki başarılı deploy → **Promote to Production**
