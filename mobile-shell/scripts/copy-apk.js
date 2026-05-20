const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const dest = path.join(__dirname, "..", "..", "public", "kanal-erp.apk");

if (!fs.existsSync(src)) {
  console.error("APK bulunamadı:", src);
  process.exit(1);
}

fs.copyFileSync(src, dest);
console.log("Kopyalandı:", dest);
