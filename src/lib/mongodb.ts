import fs from 'fs';
import mongoose from 'mongoose';
import os from 'os';
import path from 'path';

const MONGODB_URI_RAW = process.env.MONGODB_URI?.trim();

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const cached: MongooseCache = ((global as typeof globalThis & { mongoose?: MongooseCache })
  .mongoose ??= { conn: null, promise: null });

type MongoMemGlobal = {
  uri: string;
  stop?: () => Promise<boolean>;
};

const g = globalThis as typeof globalThis & {
  __kanalMongoMemory?: MongoMemGlobal | null;
};

/** OneDrive klasöründe WiredTiger kilitlenmesin diye yerel AppData kullan */
const DEV_MONGO_DIR = path.join(
  process.env.LOCALAPPDATA || os.tmpdir(),
  'kanal-erp-mongo-dev'
);
const DEV_MONGO_URI_FILE = path.join(DEV_MONGO_DIR, 'uri.txt');

async function probeMongoUri(uri: string): Promise<boolean> {
  if (!uri) return false;
  try {
    const probe = mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 1500,
    });
    await probe.asPromise();
    await probe.close();
    return true;
  } catch {
    return false;
  }
}

async function getInMemoryMongoUri(): Promise<string> {
  if (g.__kanalMongoMemory?.uri) {
    return g.__kanalMongoMemory.uri;
  }

  fs.mkdirSync(DEV_MONGO_DIR, { recursive: true });

  const existingUri = fs.existsSync(DEV_MONGO_URI_FILE)
    ? fs.readFileSync(DEV_MONGO_URI_FILE, 'utf8').trim()
    : '';
  if (existingUri && (await probeMongoUri(existingUri))) {
    g.__kanalMongoMemory = { uri: existingUri };
    return existingUri;
  }

  if (existingUri) {
    try {
      fs.unlinkSync(DEV_MONGO_URI_FILE);
    } catch {
      /* eski URI dosyası silinemedi */
    }
  }

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  let server: Awaited<ReturnType<typeof MongoMemoryServer.create>>;
  try {
    fs.mkdirSync(DEV_MONGO_DIR, { recursive: true });
    server = await MongoMemoryServer.create({
      instance: {
        dbPath: DEV_MONGO_DIR,
        storageEngine: 'wiredTiger',
      },
    });
  } catch (err) {
    console.warn(
      '[Kanal ERP] Kalıcı dev Mongo başlatılamadı; geçici bellek veritabanı kullanılıyor:',
      err instanceof Error ? err.message : err
    );
    server = await MongoMemoryServer.create();
  }
  const uri = server.getUri('kanal-erp');
  fs.writeFileSync(DEV_MONGO_URI_FILE, uri, 'utf8');
  g.__kanalMongoMemory = { uri, stop: () => server.stop() };
  return uri;
}

function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function connRefusedLocalMongo(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return (
    /\bECONNREFUSED\b/i.test(m) ||
    /MongoServerSelectionError/i.test(m) ||
    (/127\.0\.0\.1:27017|localhost:27017|:\s*27017/i.test(m) &&
      /connect|timed out|Server selection/i.test(m))
  );
}

async function openMongoUri(uri: string): Promise<typeof mongoose> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  return mongoose.connect(uri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: isProduction() ? 30_000 : 4_000,
  });
}

async function connectOnce(): Promise<typeof mongoose> {
  const skipEnv =
    !MONGODB_URI_RAW ||
    /^memory$/i.test(MONGODB_URI_RAW) ||
    MONGODB_URI_RAW === '';

  if (!skipEnv && MONGODB_URI_RAW) {
    try {
      return await openMongoUri(MONGODB_URI_RAW);
    } catch (err) {
      if (isProduction() || !connRefusedLocalMongo(err)) {
        throw err;
      }
      console.warn(
        '[Kanal ERP] MongoDB erişilemedi; geliştirme için yerel dosya tabanlı MongoDB’ye geçiliyor (.data/mongo-dev):',
        err instanceof Error ? err.message : err
      );
    }
  } else if (isProduction()) {
    throw new Error(
      'MONGODB_URI üretim ortamında zorunludur. Sunucunuza uygun bağlantı dizgesini tanımlayın.'
    );
  } else {
    console.warn(
      '[Kanal ERP] MONGODB_URI yok veya "memory"; geliştirme için yerel dosya tabanlı MongoDB kullanılıyor (.data/mongo-dev).'
    );
  }

  const uri = await getInMemoryMongoUri();
  return openMongoUri(uri);
}

export default async function connectToDatabase(): Promise<typeof mongoose> {
  if (isConnected() && cached.conn) {
    return cached.conn;
  }

  if (cached.promise) {
    return cached.promise;
  }

  cached.conn = null;
  cached.promise = connectOnce()
    .then((conn) => {
      cached.conn = conn;
      return conn;
    })
    .catch((err) => {
      cached.promise = null;
      cached.conn = null;
      throw err;
    });

  return cached.promise;
}
