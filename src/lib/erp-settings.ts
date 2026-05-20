import connectToDatabase from '@/lib/mongodb';
import Setting from '@/models/Setting';
import mongoose from 'mongoose';

function parseStoredBrandId(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  const s = String(raw).trim().replace(/\s/g, '');
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Ayar koleksiyonunda tek doğru kaynak belge bırakır.
 * Birden fazla Setting kaydı oluşmuşsa Trendyol alanları birleştirilir, fazlalıklar silinir.
 */
export async function resolveSingletonSettingDocument(): Promise<mongoose.Document> {
  await connectToDatabase();

  let all = await Setting.find({});
  if (all.length === 0) {
    const created = await Setting.create({
      settingsId: 'global',
    });
    return created;
  }

  const sorted = [...all].sort((a, b) => {
    const sa =
      Number(Boolean(String(a.get('trendyolSellerId') ?? '').trim())) * 4 +
      Number(Boolean(String(a.get('trendyolApiKey') ?? '').trim())) * 2 +
      Number(Boolean(String(a.get('trendyolApiSecret') ?? '').trim())) * 2;
    const sb =
      Number(Boolean(String(b.get('trendyolSellerId') ?? '').trim())) * 4 +
      Number(Boolean(String(b.get('trendyolApiKey') ?? '').trim())) * 2 +
      Number(Boolean(String(b.get('trendyolApiSecret') ?? '').trim())) * 2;
    if (sb !== sa) return sb - sa;
    const ta = new Date(String(a.updatedAt ?? 0)).getTime();
    const tb = new Date(String(b.updatedAt ?? 0)).getTime();
    return tb - ta;
  });

  const primary = sorted[0]!;

  if (String(primary.get('settingsId') ?? '').trim() !== 'global') {
    primary.set('settingsId', 'global');
  }

  const mergeField = (
    doc: mongoose.Document,
    extras: mongoose.Document[],
    path: string
  ) => {
    if (String(doc.get(path) ?? '').trim() !== '') return;
    for (const s of extras) {
      const v = s.get(path);
      const t = String(v ?? '').trim();
      if (t !== '') {
        doc.set(path, t);
        return;
      }
    }
  };

  mergeField(primary, sorted.slice(1), 'trendyolSellerId');
  mergeField(primary, sorted.slice(1), 'trendyolApiKey');
  mergeField(primary, sorted.slice(1), 'trendyolApiSecret');
  mergeField(primary, sorted.slice(1), 'trendyolBrandName');
  mergeField(primary, sorted.slice(1), 'webApiToken');
  mergeField(primary, sorted.slice(1), 'publicAppUrl');

  const primaryBrandId = parseStoredBrandId(primary.get('trendyolBrandId'));
  if (primaryBrandId <= 0) {
    for (const s of sorted.slice(1)) {
      const bid = parseStoredBrandId(s.get('trendyolBrandId'));
      if (bid > 0) {
        primary.set('trendyolBrandId', bid);
        break;
      }
    }
  }

  if (!String(primary.get('webApiUrl') ?? '').trim()) {
    for (const s of sorted.slice(1)) {
      const w = String(s.get('webApiUrl') ?? '').trim();
      if (w !== '') {
        primary.set('webApiUrl', w);
        break;
      }
    }
  }

  const hadDuplicates = sorted.length > 1;

  /* Yalnızca alan gerçekten değiştiyse yaz; gereksiz her-GET yazımından kaçınılır */
  if (primary.isModified()) {
    await primary.save();
  }

  if (hadDuplicates) {
    await Setting.deleteMany({
      _id: { $nin: [primary._id] },
    }).exec();
  }

  const fresh = await Setting.findById(primary._id);
  return fresh ?? primary;
}
