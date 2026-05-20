# Mağaza (Next.js / web) API sözleşmesi

ERP, harici mağaza uygulamanızla **Ayarlar > Next.js Mağaza API** üzerinden konuşur:

- **Taban URL:** `webApiUrl` (ör. `https://magaza.example.com/api/erp`)
- **Bearer token:** `webApiToken` (opsiyonel; tanımlıysa tüm isteklerde `Authorization: Bearer …` gönderilir)

Kod: `src/app/api/store/**`, `src/lib/channel-sync.ts`.

---

## ERP → Mağaza: stok ve fiyat push

**Route (ERP içi):** `POST /api/store/push-stock-price`  
**Mağaza uç noktası:** `POST {webApiUrl}/stock-price`

### İstek gövdesi

```json
{
  "source": "kanal-erp",
  "items": [
    {
      "sku": "EAY-0001",
      "barcode": "8681234567890",
      "salePrice": 299.9,
      "listPrice": 349.9,
      "stock": 12
    }
  ]
}
```

| Alan | Tip | Açıklama |
| --- | --- | --- |
| `source` | string | Sabit: `"kanal-erp"` |
| `items[].sku` | string | Model veya varyant SKU |
| `items[].barcode` | string | GTIN/EAN; varyantlı ürünlerde satır barkodu |
| `items[].salePrice` | number | Mağaza satış fiyatı (ERP `prices.website`) |
| `items[].listPrice` | number | Liste fiyatı (ERP ana `price`) |
| `items[].stock` | number | Güncel stok adedi (≥ 0) |

### Beklenen yanıt

- **2xx** — kabul edildi (gövde şeması serbest; ERP yalnızca HTTP durumuna bakar)
- **4xx/5xx** — ERP kullanıcıya hata mesajı gösterir

Varyantlı ürünlerde her varyant ayrı `items` satırı olarak gider.

---

## Mağaza → ERP: ürün çekme

**Route (ERP içi):** `GET /api/store/sync-products`  
**Mağaza uç noktası:** `GET {webApiUrl}/products`

### Beklenen yanıt

JSON dizi veya sarmalayıcı:

```json
{ "products": [ … ] }
```

veya

```json
[ { "sku": "…", "name": "…", … } ]
```

Desteklenen kök anahtarlar: (dizi kök), `items`, `products`.

### Ürün satırı alanları

| Alan | Zorunlu | ERP eşlemesi |
| --- | --- | --- |
| `sku` veya `merchantSku` | evet | `Product.sku` |
| `name` veya `title` | hayır | `Product.name` |
| `barcode` veya `gtin` | hayır | `Product.barcode` (yoksa otomatik EAN13) |
| `price`, `salePrice`, `listPrice` | hayır | `Product.price`, `prices.website` |
| `stock` veya `quantity` | hayır | `Product.stock` |
| `description` | hayır | `Product.description` |
| `category` / `categoryName` | hayır | `Product.category` |
| `id` | hayır | `integrations.web.productId` |

Upsert anahtarı: **SKU**.

---

## Mağaza → ERP: sipariş çekme

**Route (ERP içi):** `GET /api/store/sync-orders`  
**Mağaza uç noktası:** `GET {webApiUrl}/orders`

### Beklenen yanıt

```json
{ "orders": [ … ] }
```

veya doğrudan dizi.

### Sipariş satırı

| Alan | Tip | Açıklama |
| --- | --- | --- |
| `orderNumber` veya `id` | string | Benzersiz sipariş no |
| `status` | string | ERP’de olduğu gibi saklanır (varsayılan: `Yeni`) |
| `customerName` | string | |
| `customerAddress` veya `address` | string | |
| `totalAmount` veya `total` | number | |
| `platformOrderId` veya `id` | string | Harici ID |
| `items` | array | Satır listesi |

### Sipariş kalemi (`items[]`)

| Alan | Tip |
| --- | --- |
| `sku` | string |
| `barcode` | string (opsiyonel) |
| `quantity` | number |
| `unitPrice` veya `price` | number |
| `productName` veya `name` | string |

**Not:** Mağaza sipariş sync şu an yalnızca sipariş kaydı oluşturur; stok düşümü webhook veya manuel iş akışı ile yapılabilir. Trendyol sipariş sync’inde stok otomatik düşer (`/api/trendyol/sync-orders`).

---

## Mağaza → ERP: sipariş webhook (anlık)

**ERP uç noktası:** `POST /api/orders/webhook`  
**Kimlik:** `STORE_WEBHOOK_SECRET` ortam değişkeni tanımlıysa istekte doğrulanır (`x-webhook-secret` veya `x-kanal-webhook-secret` başlığı).

### İstek gövdesi (örnek)

```json
{
  "platform": "web",
  "orderNumber": "WEB-10042",
  "customerName": "Ada Lovelace",
  "customerAddress": "İstanbul",
  "totalAmount": 599.8,
  "trackingNumber": "",
  "cargoCompany": "",
  "items": [
    {
      "sku": "EAY-0001",
      "barcode": "8681234567890",
      "productName": "Tişört",
      "quantity": 2,
      "unitPrice": 299.9
    }
  ]
}
```

### Davranış

1. Aynı `orderNumber` varsa **idempotent** — 200, çift kayıt/stok düşümü yok.
2. Yeni siparişte stok düşülür, `StockMovement` yazılır, kanallara stok push edilir.
3. `platform` yoksa `orderNumber` `TY` ile başlıyorsa `trendyol`, aksi halde `web` kabul edilir.

---

## Ortam değişkenleri

| Değişken | Açıklama |
| --- | --- |
| `STORE_WEBHOOK_SECRET` | Webhook isteklerini doğrulamak için paylaşılan sır |

---

## Hızlı kontrol listesi (mağaza geliştirici)

- [ ] `GET /products` — ERP ürün çekimi
- [ ] `GET /orders` — ERP sipariş çekimi
- [ ] `POST /stock-price` — ERP’den gelen stok/fiyat güncellemeleri
- [ ] (Opsiyonel) Mağaza yeni siparişte `POST {ERP}/api/orders/webhook` + `STORE_WEBHOOK_SECRET`

Mağaza uygulaması bu repoda değildir; yalnızca yukarıdaki sözleşmeye uymanız yeterlidir.
