# Mobil APK (Capacitor)

Kanal ERP Android uygulaması, canlı web sitesini WebView içinde açan bir **Capacitor shell**'dir. Native kod minimaldir; UI güncellemeleri web deploy ile otomatik yansır.

**Canlı URL:** `https://erp-stok.vercel.app` (`mobile-shell/capacitor.config.json`)

**APK indirme:** https://erp-stok.vercel.app/kanal-erp.apk

## Ne zaman APK yeniden derlenir?

| Değişiklik | APK rebuild gerekli mi? |
|------------|-------------------------|
| React/Next.js UI, API, stok mantığı | Hayır — Vercel deploy yeterli |
| `capacitor.config.json` (URL, scheme) | Evet |
| Android izinleri (kamera vb.) | Evet |
| Capacitor plugin ekleme/kaldırma | Evet |

## Gereksinimler

- Node.js 20+
- JDK 17
- Android SDK (Android Studio önerilir)
- `ANDROID_HOME` ortam değişkeni

## APK derleme

```bash
cd mobile-shell
npm install
npm run build:apk
```

Bu komut sırasıyla:

1. `npx cap sync android`
2. `scripts/patch-android.js` — kamera izinlerini AndroidManifest'e ekler
3. `gradlew assembleDebug`
4. `scripts/copy-apk.js` — APK'yı `public/kanal-erp.apk` konumuna kopyalar

APK'yı dağıtmak için `public/kanal-erp.apk` dosyasını commit + push edin.

## Kamera / barkod tarama

- `@capacitor/camera` plugin yüklü
- AndroidManifest'e `CAMERA` izni `patch-android.js` ile eklenir
- Barkod: WebView'da `BarcodeDetector` + ZXing canvas fallback (`BarcodeScanner.tsx`)

## Geliştirme

Yerel Next.js sunucusunu test etmek için `capacitor.config.json`:

```json
{
  "server": {
    "url": "http://10.0.2.2:3005",
    "cleartext": true
  }
}
```

> Emülatörde `10.0.2.2` = host makinenin localhost'u. Fiziksel cihazda bilgisayarın LAN IP'sini kullanın.

Sonra:

```bash
cd mobile-shell
npm run sync
npm run open   # Android Studio açar
```

## Notlar

- `mobile-shell/android/` gitignore'da — her geliştiricide `npm run sync` ile oluşturulur
- Production APK debug imzalıdır; Play Store için release keystore gerekir
- WebView dark mode ve kontrast düzeltmeleri mobil CSS override'ları ile yapılır
