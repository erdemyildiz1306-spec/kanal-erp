import ActivityLog from '@/models/ActivityLog';
import connectToDatabase from '@/lib/mongodb';
import { DEFAULT_TENANT_ID, normalizeTenantId } from '@/lib/tenant';

export async function logActivity(input: {
  action: string;
  module?: string;
  detail?: string;
  userId?: string;
  userName?: string;
  meta?: Record<string, unknown>;
  tenantId?: string;
}) {
  try {
    await connectToDatabase();
    await ActivityLog.create({
      tenantId: normalizeTenantId(input.tenantId ?? DEFAULT_TENANT_ID),
      action: input.action,      module: input.module ?? 'system',
      detail: input.detail ?? '',
      userId: input.userId ?? '',
      userName: input.userName ?? '',
      meta: input.meta ?? {},
    });
  } catch {
    /* audit log başarısız olsa bile ana işlem devam etsin */
  }
}
