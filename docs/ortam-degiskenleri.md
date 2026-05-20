# Ortam Değişkenleri

Tüm değişkenler `.env.local` (geliştirme) veya Vercel Environment Variables (production) içinde tanımlanır.

## Zorunlu (production)

| Değişken | Açıklama |
|----------|----------|
| `MONGODB_URI` | MongoDB bağlantı dizgesi. Örn. `mongodb+srv://user:pass@cluster/kanal-erp` |
| `AUTH_SESSION_SECRET` | Oturum cookie imza anahtarı. Production'da tanımsızsa uygulama reddeder |

## Webhook & mağaza API

| Değişken | Açıklama |
|----------|----------|
| `STORE_WEBHOOK_SECRET` | `POST /api/orders/webhook` isteklerinde `x-webhook-secret` header ile eşleşmeli. Production'da tanımsızsa webhook reddedilir |
| `webApiToken` | Ayarlar sayfasından girilir (env değil). Mağaza API Bearer token. Production'da tanımsızsa `/api/store/*` reddedilir |

## Uygulama URL

| Değişken | Açıklama |
|----------|----------|
| `NEXT_PUBLIC_APP_URL` | Canlı HTTPS adresi. Trendyol görsel yayımlama, e-posta linkleri için gerekli |

## E-posta (opsiyonel)

| Değişken | Açıklama |
|----------|----------|
| `RESEND_API_KEY` | Resend API anahtarı |
| `MAIL_FROM` | Gönderen. Örn. `Kanal ERP <noreply@domain.com>` |

## Trendyol geliştirme / test

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `TRENDYOL_ALLOW_SYNC_MOCK` | kapalı | API hata/boş dönünce mock ürün verisi |
| `TRENDYOL_ALLOW_ORDER_SYNC_MOCK` | kapalı | Mock sipariş senkronu (production'da kapalı tutun) |
| `TRENDYOL_SYNC_ONLY_MOCK` | kapalı | Yalnızca mock ürün, canlı API çağrısı yok |
| `TRENDYOL_PRODUCT_LIST_LEGACY_FIRST` | kapalı | Önce eski sapigw ürün listesini dene |

## Trendyol ayarları (veritabanı)

Aşağıdakiler Ayarlar sayfasından kaydedilir, env değil:

- `trendyolSellerId`
- `trendyolApiKey` / `trendyolApiSecret`
- `trendyolBrandId` / `trendyolBrandName`
- `trendyolWebhookSecret` (Trendyol webhook URL token'ı)
- `trendyolStockDeductAt` — `pending` | `processing` | `shipped`
- `webApiUrl`, `webApiToken`, `webApiPushUrl`

## Örnek `.env.local`

```env
MONGODB_URI=mongodb://127.0.0.1:27017/kanal-erp
AUTH_SESSION_SECRET=dev-icin-en-az-32-karakterlik-rastgele-dize

NEXT_PUBLIC_APP_URL=http://localhost:3005

# Geliştirme mock
TRENDYOL_ALLOW_SYNC_MOCK=true
TRENDYOL_ALLOW_ORDER_SYNC_MOCK=true

# Production webhook (canlıda zorunlu)
# STORE_WEBHOOK_SECRET=guclu-webhook-secret
```

## Production davranışı

`NODE_ENV=production` veya `VERCEL_ENV=production` olduğunda:

- `AUTH_SESSION_SECRET` yoksa oturum doğrulama çalışmaz
- `STORE_WEBHOOK_SECRET` yoksa mağaza webhook'ları reddedilir
- `webApiToken` (Ayarlar) yoksa mağaza API istekleri reddedilir

Detay: [guvenlik.md](./guvenlik.md)
