import connectToDatabase from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import type { SessionUser } from '@/lib/auth';

export const DEFAULT_TENANT_ID = 'default';

export function normalizeTenantId(raw: unknown): string {
  const s = String(raw ?? '').trim();
  return s || DEFAULT_TENANT_ID;
}

export function tenantScope(session?: SessionUser | null): { tenantId: string } {
  return { tenantId: normalizeTenantId(session?.tenantId) };
}

/** Oturum kullanıcısı belge tenant'ına erişebilir mi */
export function belongsToTenant(
  session: SessionUser | null | undefined,
  docTenantId: unknown
): boolean {
  if (!session) return false;
  return normalizeTenantId(session.tenantId) === normalizeTenantId(docTenantId);
}

export async function ensureDefaultTenant(): Promise<void> {
  await connectToDatabase();
  const exists = await Tenant.findOne({ tenantId: DEFAULT_TENANT_ID }).lean();
  if (!exists) {
    await Tenant.create({
      tenantId: DEFAULT_TENANT_ID,
      name: 'Varsayılan Kuruluş',
      slug: 'default',
      active: true,
    });
  }
}

export async function listActiveTenantIds(): Promise<string[]> {
  await ensureDefaultTenant();
  const rows = await Tenant.find({ active: { $ne: false } })
    .select('tenantId')
    .lean();
  const ids = rows.map((r) => String(r.tenantId)).filter(Boolean);
  return ids.length ? ids : [DEFAULT_TENANT_ID];
}

export function slugifyTenant(input: string): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `org-${Date.now().toString(36)}`;
}

export async function createTenantRecord(input: {
  name: string;
  slug?: string;
  tenantId?: string;
}): Promise<{ tenantId: string; slug: string; name: string }> {
  await ensureDefaultTenant();
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Kuruluş adı zorunlu.');
  const slug = slugifyTenant(input.slug || name);
  const tenantId =
    String(input.tenantId ?? '').trim() ||
    `t_${slug.replace(/-/g, '_').slice(0, 24)}_${Date.now().toString(36).slice(-4)}`;

  const dup = await Tenant.findOne({ $or: [{ tenantId }, { slug }] }).lean();
  if (dup) throw new Error('Bu kuruluş kodu veya kısa ad zaten kayıtlı.');

  await Tenant.create({ tenantId, name, slug, active: true });
  return { tenantId, slug, name };
}
