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

## Rollback

Vercel dashboard → Deployments → önceki başarılı deploy → **Promote to Production**
