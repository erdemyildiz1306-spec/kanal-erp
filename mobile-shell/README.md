# KanalERP Android APK (Capacitor)

sipariş projesindeki gibi mobil uygulama **Capacitor** ile derlenir. KanalERP Next.js olduğu için APK, canlı sunucu URL'sini WebView içinde açar.

## Gereksinimler

- Node.js 20+
- Android Studio + JDK 17
- KanalERP sunucusu erişilebilir olmalı (yerel: `npm run dev` port 3005)

## Yapılandırma

1. `mobile-shell/capacitor.config.json` içinde `server.url` değerini güncelleyin:
   - Emulator: `http://10.0.2.2:3005`
   - Gerçek cihaz (aynı Wi‑Fi): `http://BILGISAYAR_IP:3005`
   - Canlı: `https://erp.sizin-domain.com`

2. Capacitor kurulumu (ilk sefer):

```bash
cd mobile-shell
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/app
npx cap add android
npx cap sync android
```

3. APK derleme:

```bash
cd mobile-shell/android
./gradlew assembleDebug
```

Çıktı: `android/app/build/outputs/apk/debug/app-debug.apk`

4. İndirme linki için APK'yı kopyalayın:

```bash
copy android\app\build\outputs\apk\debug\app-debug.apk ..\..\public\kanal-erp.apk
```

Giriş sayfasında otomatik indirme banner'ı görünür.

## Hızlı derleme (kurulum tamamlandıktan sonra)

```bash
cd mobile-shell
npm run sync
cd android
./gradlew assembleDebug   # Windows: gradlew.bat assembleDebug
cd ..
node scripts/copy-apk.js
```

Veya tek satır (Windows PowerShell):

```powershell
cd mobile-shell/android; .\gradlew.bat assembleDebug; cd ..; node scripts/copy-apk.js
```

Canlı URL: `capacitor.config.json` → `server.url` = `https://erp-stok.vercel.app`

## Ortam değişkeni

`.env.local`:

```
APK_VERSION=1.0.0
```
