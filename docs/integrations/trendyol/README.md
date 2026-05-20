# Trendyol entegrasyonu

Resmi referans: [Trendyol Integration — API Reference](https://developers.trendyol.com/reference).

Kod: `src/lib/trendyol.ts`, `src/lib/trendyol-endpoints.ts`, `src/lib/trendyol-attributes.ts`, `src/app/api/trendyol/**`.

## Kimlik doğrulama

- **HTTP Basic Auth:** API Key (kullanıcı adı) + API Secret (şifre)
- **User-Agent:** Trendyol’un istediği formatta satıcı ID ile birlikte gönderilir (`src/lib/trendyol.ts`)
- Kimlik bilgileri **Ayarlar > Trendyol** ekranından kaydedilir; boş alan gönderildiğinde mevcut sırlar silinmez.

## Uç noktalar (ERP)

| Alan | Endpoint | ERP route |
| --- | --- | --- |
| Kategori ağacı | `GET .../sapigw/product-categories` | `POST /api/trendyol/sync-categories` |
| Kategori öznitelikleri | `GET .../product-categories/{id}/attributes` | `GET /api/trendyol/create-product?categoryId=` |
| Ürün listesi | `GET .../suppliers/{supplierId}/products` | `GET /api/trendyol/sync-products` |
| Ürün oluşturma (v2) | `POST .../suppliers/{supplierId}/v2/products` | `POST /api/trendyol/create-product` |
| Stok & fiyat | `POST .../suppliers/{supplierId}/products/price-and-inventory` | `POST /api/trendyol/push-stock-price` |
| Sipariş paketleri | `GET .../suppliers/{supplierId}/orders` | `GET /api/trendyol/sync-orders` |

## Kategori öznitelikleri (attribute UI)

Trendyol’da ürün yayımlamak için kategoriye bağlı **zorunlu öznitelikler** (beden, renk, cinsiyet vb.) doldurulmalıdır.

1. **Kategori Ağacını Eşitle** ile yaprak kategoriler MongoDB’ye alınır.
2. Ürün formunda **Trendyol kategori yolu** seçilince ERP, Trendyol’dan öznitelik listesini çeker.
3. Zorunlu alanlar (`*`) formda gösterilir; kayıt ve **Trendyol’a Yayımla** öncesinde doğrulanır.
4. Seçimler üründe `trendyolAttributes[]` olarak saklanır ve create API’ye `attributes` dizisi olarak gider.

Öznitelik mantığı: `src/lib/trendyol-attributes.ts`.

## Ürün senkronizasyonu (Trendyol → ERP)

- `GET /api/trendyol/sync-products` onaylı ürünleri çeker ve SKU/barkod ile upsert eder.
- Upsert filtresi kök alanlar (`sku`, isteğe bağlı `barcode`) üzerinden yapılır; nested `integrations.*` upsert filtresinde kullanılmaz.

## Sipariş senkronizasyonu ve stok düşümü

`GET /api/trendyol/sync-orders`:

1. Trendyol sipariş paketlerini çeker (veya geliştirmede mock).
2. Siparişi `Order` koleksiyonuna upsert eder.
3. **Yeni** siparişlerde ve durum **İptal Edildi** değilse:
   - Her satır için `decrementForOrderItem` (`src/lib/inventory.ts`) ile stok düşer.
   - `StockMovement` kaydı oluşur.
   - Güncellenen ürün stoku Trendyol / mağaza kanallarına `pushStockAfterOrder` ile iletilir.
4. Aynı sipariş tekrar sync edildiğinde `stockApplied: true` olduğu için **çift düşüm yapılmaz**.

İptal eşlemesi: Trendyol `Cancelled` → ERP `İptal Edildi`.

## Ortam değişkenleri

| Değişken | Açıklama |
| --- | --- |
| `TRENDYOL_ALLOW_SYNC_MOCK=1` | Ürün çekimi başarısız olsa bile örnek kayıt (sadece geliştirme) |
| `TRENDYOL_ALLOW_ORDER_SYNC_MOCK=true` | Sipariş sync’te mock sipariş kullan (sadece geliştirme) |

Production’da mock bayrakları kapalı tutun.

## Bilinen sınırlamalar

- Create API’de `brandId: 0` placeholder kullanılıyor; canlı ortamda geçerli marka ID gerekebilir.
- Kategori öznitelikleri Trendyol API yanıtına bağlıdır; API erişimi yoksa form alanları boş kalır.

## SKU

Yerel otomatik SKU üretimi **EAY-xxxx** formatındadır (`src/lib/codes.ts`).
