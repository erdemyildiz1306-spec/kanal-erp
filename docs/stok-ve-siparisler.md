# Stok ve Siparişler

## Depo modeli

Stok **depo bazlı** tutulur (`WarehouseStock` koleksiyonu):

- **Tek SKU ürün:** `variantSku: ''` olan tek satır
- **Varyantlı ürün:** Her beden/renk için ayrı satır (`variantSku = varyant SKU`)
- **Ana depo ID:** `main`

Ürün dokümanındaki (`Product.stock`, `Product.variants[].stock`) değerler depo satırlarından **senkronize edilir** — kaynak depo satırlarıdır.

## Sipariş durumları

| Durum | Açıklama |
|-------|----------|
| Beklemede / Yeni | Trendyol'dan gelen yeni sipariş |
| Hazırlanıyor | Etiket alındı / işleme alındı |
| Kargolandı | Kargo verildi |
| Teslim Edildi | Teslim |
| İptal Edildi / İade Edildi | Stok iadesi (daha önce düşüldüyse) |

## Stok ne zaman düşer?

Trendyol ayarı `trendyolStockDeductAt` ile belirlenir:

| Değer | Stok düşüm anı |
|-------|----------------|
| `processing` (varsayılan) | Hazırlanıyor |
| `pending` | Beklemede |
| `shipped` | Kargolandı |

### Manuel akış (ERP paneli)

| Buton | API | Etki |
|-------|-----|------|
| **Etiket** | `POST /api/orders/process-label?id=...` | Hazırlanıyor + stok düş + Trendyol Picking |
| **İşleme Al** | `PUT /api/orders?id=...` (status: Hazırlanıyor) | Aynı stok düşümü |

**Çift düşüm koruması:** `stockApplied` flag + `StockMovement` kayıtları + satır bazlı idempotency.

## Varyantlı ürünler

Trendyol sipariş satırında genelde:

- `merchantSku` → model SKU veya varyant SKU
- `barcode` → varyant barkodu
- `productName` → beden/renk bilgisi içerebilir (ör. "... - M")

Sistem eşleşme sırası:

1. Varyant barkodu
2. Varyant SKU
3. Sipariş `productName` içinden beden/renk etiketi (`sizeLabel`, `colorLabel`)
4. Tek varyantlı ürünlerde otomatik tek varyant

### Yetim depo satırı sorunu

Eski hatalı düşümlerde tüm stok `variantSku: ''` satırında toplanmış olabilir. Bu durumda:

- Stok düşümü sonrası ürün stoku **0** görünebilir (senkron yetim satırı yok sayar)
- **Onarım:** `POST /api/inventory/repair-warehouse`

```javascript
// Tek ürün
fetch('/api/inventory/repair-warehouse', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sku: 'MODEL-SKU' })
})

// Tüm varyantlı ürünler
fetch('/api/inventory/repair-warehouse', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ all: true })
})
```

Her stok düşümünden önce otomatik yetim satır migrate de çalışır; eski birikmiş veriler için yukarıdaki toplu onarım önerilir.

## Stok hareketleri

Tüm değişiklikler `StockMovement` koleksiyonuna yazılır:

| Alan | Açıklama |
|------|----------|
| `delta` | Negatif = düşüm, pozitif = artış/iade |
| `reason` | `order`, `webhook`, `return`, `adjustment` |
| `reference` | Sipariş numarası |
| `variantSku` | Varyant SKU (varsa) |

Aktivite log ve stok hareketleri sayfasından izlenebilir.

## İptal / iade stok iadesi

Sipariş **İptal Edildi** veya **İade Edildi** olduğunda:

- Daha önce stok düşüldüyse `restoreOrderStockIfApplied` çalışır
- İade idempotent — aynı siparişte bir kez iade edilir (`reference: ORDER:restore`)

## UI'da `sync:0` uyarısı

Ürün listesindeki `sync:0` ifadesi Trendyol senkron hatası **değildir**. Formül:

```
gösterilen = stok - safetyStock (varsayılan 2)
```

Stok güvenlik eşiğinin altındaysa 0 veya negatif görünür.

## Atomik stok güncelleme

Depo stok düşümü MongoDB `$inc` ile atomik yapılır. Yetersiz stokta işlem reddedilir (`Yetersiz stok` hatası) — sessizce 0'a clamp edilmez.
