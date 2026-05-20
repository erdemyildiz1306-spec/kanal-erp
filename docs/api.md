# API Özeti

Tüm `/api/*` uç noktaları (public olanlar hariç) geçerli oturum cookie'si gerektirir.

Base URL: `https://erp-stok.vercel.app`

## Sağlık

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/health` | Public | DB bağlantı durumu |

## Kimlik doğrulama

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/api/auth/login` | Personel girişi |
| POST | `/api/auth/customer-login` | Müşteri portal girişi |
| POST | `/api/auth/register` | İlk kayıt (sonrasında admin onayı gerekebilir) |
| GET | `/api/auth/register-config` | Kayıt formu yapılandırması |
| POST | `/api/auth/logout` | Çıkış |
| GET | `/api/auth/me` | Oturum bilgisi |
| POST | `/api/auth/forgot-password` | Şifre sıfırlama e-postası |
| POST | `/api/auth/reset-password` | Yeni şifre belirleme |

## Ürünler

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/products` | Tüm ürünler (`.lean()`) |
| POST | `/api/products` | Yeni ürün |
| PUT | `/api/products?id=` | Ürün güncelle |
| DELETE | `/api/products?id=` | Ürün sil |
| POST | `/api/products/import` | Toplu içe aktarma |
| GET | `/api/products/export` | Dışa aktarma |
| POST | `/api/products/bulk-delete` | Toplu silme |

## Stok & depo

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/inventory/adjust?barcode=&sku=` | Barkod/SKU ile ürün sorgula |
| POST | `/api/inventory/adjust` | Stok artır/azalt (`delta`) |
| POST | `/api/inventory/repair-warehouse` | Yetim depo satırı onarımı |
| GET | `/api/warehouse` | Depo listesi |
| GET | `/api/warehouse/[id]` | Depo detay & stok |
| POST | `/api/warehouse/transfer` | Depolar arası transfer |
| GET | `/api/stock-movements` | Stok hareket geçmişi |

### Repair warehouse body

```json
{ "productId": "..." }
{ "sku": "MODEL-SKU" }
{ "all": true }
```

## Siparişler

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/orders?limit=500` | Sipariş listesi (max 2000) |
| POST | `/api/orders` | Manuel sipariş |
| PUT | `/api/orders?id=` | Durum güncelle |
| POST | `/api/orders/process-label?id=` | Etiket / işleme al + stok düş |
| POST | `/api/orders/webhook` | Mağaza sipariş webhook (secret header) |

## Trendyol

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/trendyol/sync-orders` | Sipariş çek |
| GET | `/api/trendyol/sync-products` | Ürün çek |
| POST | `/api/trendyol/push-stock-price` | Stok/fiyat gönder |
| POST | `/api/trendyol/create-product` | Trendyol'a ürün aç |
| GET | `/api/trendyol/picking-list` | Toplama listesi |
| POST | `/api/trendyol/webhook/[token]` | Trendyol webhook |

## Mağaza (web sitesi)

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/store/stock-price` | Bearer | Stok/fiyat çek |
| POST | `/api/store/push-stock-price` | Session | ERP → mağaza push |
| POST | `/api/store/sync-orders` | Session | Mağaza sipariş çek |
| POST | `/api/store/sync-products` | Session | Mağaza ürün çek |

## Müşteri portalı

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/portal/products` | Customer | Katalog |
| GET/POST | `/api/portal/orders` | Customer | Siparişler |
| GET/PATCH | `/api/portal/orders/[id]` | Customer | Sipariş detay |
| GET | `/api/portal/summary` | Customer | Özet |
| GET/PATCH | `/api/portal/profile` | Customer | Profil |

## Yönetim

| Method | Path | Rol | Açıklama |
|--------|------|-----|----------|
| GET/PUT | `/api/settings` | Session / Admin PUT | ERP ayarları |
| GET | `/api/backup` | Admin | JSON yedek indir |
| GET/POST | `/api/users` | Admin | Kullanıcı yönetimi |
| GET | `/api/dashboard` | Session | Ana sayfa istatistikleri |
| GET | `/api/reports` | Session | Raporlar |
| GET | `/api/activity-log` | Session | Aktivite log |
| GET | `/api/search?q=` | Session | Global arama |

## Yanıt formatı

Başarılı:

```json
{ "success": true, ... }
```

Hata:

```json
{ "success": false, "error": "Mesaj" }
```

HTTP durum kodları: `400` doğrulama, `401` oturum yok, `403` yetki yok, `404` bulunamadı, `409` çakışma, `502` dış servis hatası.
