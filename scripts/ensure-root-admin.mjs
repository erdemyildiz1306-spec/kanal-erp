/**
 * Root yönetici hesabını oluşturur / günceller.
 * Kullanım: node scripts/ensure-root-admin.mjs
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const DEV_MONGO_DIR = resolve(process.env.LOCALAPPDATA || os.tmpdir(), 'kanal-erp-mongo-dev');
const DEV_MONGO_URI_FILE = resolve(DEV_MONGO_DIR, 'uri.txt');

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

loadEnvFile('.env.local');
loadEnvFile('.env');

const email = String(process.env.ROOT_ADMIN_EMAIL ?? 'erdemyildizz@outlook.com')
  .toLowerCase()
  .trim();
const password = String(process.env.ROOT_ADMIN_PASSWORD ?? '145983');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['root', 'admin', 'operator', 'accountant'], default: 'admin' },
  active: { type: Boolean, default: true },
  tenantId: { type: String, default: 'default' },
  signupSource: { type: String, default: 'admin' },
});
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

async function probeMongoUri(uri) {
  if (!uri) return false;
  try {
    const probe = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 2000 });
    await probe.asPromise();
    await probe.close();
    return true;
  } catch {
    return false;
  }
}

async function resolveMongoUri() {
  const raw = String(process.env.MONGODB_URI ?? '').trim();
  if (raw && !/^memory$/i.test(raw)) return raw;

  if (existsSync(DEV_MONGO_URI_FILE)) {
    const saved = readFileSync(DEV_MONGO_URI_FILE, 'utf8').trim();
    if (await probeMongoUri(saved)) return saved;
  }

  mkdirSync(DEV_MONGO_DIR, { recursive: true });
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const server = await MongoMemoryServer.create({
    instance: { dbPath: DEV_MONGO_DIR, storageEngine: 'wiredTiger' },
  });
  const uri = server.getUri();
  writeFileSync(DEV_MONGO_URI_FILE, uri, 'utf8');
  console.log('Yerel geliştirme MongoDB başlatıldı.');
  return uri;
}

async function main() {
  const uri = await resolveMongoUri();
  await mongoose.connect(uri);
  const User = mongoose.models.User || mongoose.model('User', UserSchema);
  const passwordHash = await bcrypt.hash(password, 10);
  const name = email.split('@')[0] || 'Root Admin';

  const existing = await User.findOne({ email });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'admin';
    existing.active = true;
    existing.name = name;
    await existing.save();
    console.log(`Güncellendi: ${email}`);
  } else {
    await User.create({
      email,
      name,
      passwordHash,
      role: 'admin',
      active: true,
      tenantId: 'default',
      signupSource: 'admin',
    });
    console.log(`Oluşturuldu: ${email}`);
  }

  console.log('Root erişimi için .env.local içinde ROOT_ADMIN_EMAILS tanımlı olmalı.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
