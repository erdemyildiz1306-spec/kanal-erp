/**
 * Varsayılan kuruluşa 14 günlük deneme uygular.
 * Kullanım: MONGODB_URI=... node scripts/apply-default-trial.mjs
 */
import mongoose from 'mongoose';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile(name) {
  const p = resolve(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile('.env.production.local');
loadEnvFile('.env.local');

const uri = process.env.MONGODB_URI;
if (!uri || /^memory$/i.test(uri)) {
  console.error('MONGODB_URI gerekli.');
  process.exit(1);
}

const expiresAt = new Date();
expiresAt.setDate(expiresAt.getDate() + 14);

const trial = {
  plan: 'trial',
  packageKey: 'trial',
  expiresAt,
  modules: {
    trendyolSeller: true,
    webStoreApi: true,
    trendyolEfaturam: true,
    wordpress: true,
  },
  suspended: false,
  notes: '14 günlük deneme — tüm modüller açık',
};

await mongoose.connect(uri);
const r = await mongoose.connection.db
  .collection('tenants')
  .updateOne({ tenantId: 'default' }, { $set: { license: trial } });
console.log('default tenant:', r.matchedCount ? 'trial uygulandı' : 'kuruluş bulunamadı');
await mongoose.disconnect();
