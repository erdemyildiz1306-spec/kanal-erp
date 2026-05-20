# Güvenlik

## Production zorunlulukları (fail-closed)

Production ortamında (`NODE_ENV=production` veya `VERCEL_ENV=production`) aşağıdaki kontroller **kapalı bırakılamaz**:

| Kontrol | Davranış |
|---------|----------|
| `AUTH_SESSION_SECRET` | Tanımsızsa oturum imzalama çalışmaz; Edge middleware oturum doğrulayamaz |
| `STORE_WEBHOOK_SECRET` | Tanımsızsa `POST /api/orders/webhook` reddedilir |
| `webApiToken` (Ayarlar) | Tanımsızsa `/api/store/*` Bearer doğrulaması reddedilir |

## Oturum yönetimi

- Cookie: `kanal_erp_session` (httpOnly, sameSite=lax, secure in production)
- HMAC-SHA256 imzalı token, 7 gün TTL
- Middleware tüm `/api/*` ve panel rotalarını korur (public path'ler hariç)

### Roller

| Rol | Erişim |
|-----|--------|
| `admin` | Tam erişim, kullanıcı yönetimi, ayarlar, yedek |
| `operator` | Günlük operasyon (sipariş, stok, ürün) |
| `accountant` | Finans modülleri |
| `customer` | Yalnızca `/portal` ve `/api/portal/*` |

## Admin-only işlemler

| Uç nokta | Koruma |
|----------|--------|
| `PUT /api/settings` | Admin + middleware |
| `GET /api/backup` | Admin + middleware |
| `POST/PUT/DELETE /api/users` | Admin (kendi profil PATCH hariç) |

## Gizli alanlar

Settings GET yanıtında maskelenir:

- `trendyolApiKey`
- `trendyolApiSecret`
- `webApiToken`

Settings PUT yanıtında webhook secret yalnızca **ilk otomatik oluşturmada** bir kez döner; sonrasında `trendyolWebhookSecretSaved: true` flag'i kullanılır.

## Portal güvenliği

- B2B sipariş erişimi yalnızca `customerId` ile (legacy `customerName` eşleşmesi kaldırıldı)
- Portal arama regex'leri escape edilir (ReDoS koruması)

## Public API uç noktaları

Kimlik doğrulama gerektirmez:

- `/api/auth/login`, `/api/auth/register`, `/api/auth/register-config`
- `/api/auth/forgot-password`, `/api/auth/reset-password`
- `/api/trendyol/webhook/[token]`
- `/api/orders/webhook` (secret header gerekli)
- `/api/store/stock-price` (Bearer token gerekli)
- `/api/health`
- `/api/apk/*`

## Webhook doğrulama

### Mağaza sipariş webhook

```
POST /api/orders/webhook
Header: x-webhook-secret: <STORE_WEBHOOK_SECRET>
```

### Trendyol webhook

```
POST /api/trendyol/webhook/<trendyolWebhookSecret>
```

Token, Ayarlar'dan alınır.

## Önerilen ek önlemler

Henüz uygulanmadı; production ölçeğinde değerlendirin:

- Rate limiting (login, webhook) — Vercel WAF veya Upstash Redis
- MongoDB IP allowlist (Atlas)
- Düzenli `GET /api/backup` yedekleri (admin oturumu ile)
- CI/CD pipeline ve otomatik testler

## Secret üretme

```bash
# Node.js ile
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`AUTH_SESSION_SECRET` ve `STORE_WEBHOOK_SECRET` için en az 32 byte rastgele değer kullanın.
