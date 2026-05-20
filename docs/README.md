# Kanal ERP — Dokümantasyon

Bu klasör, Kanal ERP projesinin kurulum, deploy, iş akışı ve API referansını içerir.

## İçindekiler

| Doküman | Ne zaman okunur? |
|---------|------------------|
| [kurulum.md](./kurulum.md) | Projeyi ilk kez yerelde çalıştırırken |
| [deployment.md](./deployment.md) | Vercel'e canlı deploy ederken |
| [ortam-degiskenleri.md](./ortam-degiskenleri.md) | `.env.local` veya Vercel env ayarlarken |
| [stok-ve-siparisler.md](./stok-ve-siparisler.md) | Stok düşümü, etiket, varyant sorunları |
| [guvenlik.md](./guvenlik.md) | Production güvenlik yapılandırması |
| [mobil-apk.md](./mobil-apk.md) | Android APK derleme ve dağıtım |
| [api.md](./api.md) | API uç noktalarına hızlı bakış |

## Hızlı bağlantılar

- **Canlı uygulama:** https://erp-stok.vercel.app
- **GitHub:** https://github.com/erdemyildiz1306-spec/kanal-erp
- **APK indirme:** https://erp-stok.vercel.app/kanal-erp.apk
- **Health check:** https://erp-stok.vercel.app/api/health

## Sürüm notları (özet)

Son önemli değişiklikler:

- Varyantlı ürünlerde doğru beden/varyant stok düşümü (`resolveVariantMatch`, yetim depo satırı onarımı)
- Production fail-closed auth (webhook, mağaza API, oturum secret)
- API performans: ürün/sipariş listelerinde limit, dashboard optimizasyonu
- `POST /api/inventory/repair-warehouse` — bozuk depo stoklarını onarma
- `GET /api/health` — DB bağlantı durumu
