import { DEFAULT_TENANT_ID, normalizeTenantId } from '@/lib/tenant';

/** Mongo filtrelerine tenantId ekler */
export function mergeTenant<T extends Record<string, unknown>>(
  tenantId: string | undefined,
  filter: T
): T & { tenantId?: string } {
  const tid = String(tenantId ?? '').trim();
  if (!tid) return filter;
  return { ...filter, tenantId: normalizeTenantId(tid) };
}

export function orderByNumber(tenantId: string | undefined, orderNumber: string) {
  return mergeTenant(tenantId, { orderNumber: String(orderNumber ?? '').trim() });
}

export function tenantOnly(tenantId?: string): { tenantId: string } {
  return { tenantId: normalizeTenantId(tenantId) };
}

export type ProductDocWithTenant = {
  _id: unknown;
  tenantId?: string;
  sku?: string;
  platforms?: string[];
};

export function readProductTenantId(
  product: ProductDocWithTenant | null | undefined
): string {
  return normalizeTenantId(product?.tenantId ?? DEFAULT_TENANT_ID);
}
