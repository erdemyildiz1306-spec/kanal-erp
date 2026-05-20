/**
 * cap sync sonrası AndroidManifest'e kamera izni ekler.
 * android/ gitignore'da olduğu için her sync/build öncesi çalıştırılır.
 */
const fs = require("fs");
const path = require("path");

const manifestPath = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "AndroidManifest.xml"
);

if (!fs.existsSync(manifestPath)) {
  console.warn("AndroidManifest bulunamadı, patch atlandı:", manifestPath);
  process.exit(0);
}

let xml = fs.readFileSync(manifestPath, "utf8");
let changed = false;

const permissions = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />',
];

for (const line of permissions) {
  const key = line.match(/android:name="([^"]+)"/)?.[1];
  if (!key) continue;
  if (xml.includes(`android:name="${key}"`)) continue;
  xml = xml.replace(
    /(\s*<!-- Permissions -->\s*\n\s*<uses-permission android:name="android.permission.INTERNET" \/>)/,
    `$1\n    ${line}`
  );
  if (!xml.includes(`android:name="${key}"`)) {
    xml = xml.replace(
      "</manifest>",
      `    ${line}\n</manifest>`
    );
  }
  changed = true;
  console.log("Eklendi:", key);
}

if (changed) {
  fs.writeFileSync(manifestPath, xml, "utf8");
  console.log("AndroidManifest güncellendi.");
} else {
  console.log("AndroidManifest zaten güncel.");
}
