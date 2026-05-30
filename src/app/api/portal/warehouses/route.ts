import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Warehouse from '@/models/Warehouse';
import { getSessionFromRequest } from '@/lib/auth';
import { tenantScope } from '@/lib/tenant';
import { ensureMainWarehouse } from '@/lib/warehouse-stock';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const session = getSessionFromRequest(request);
    if (!session || session.role !== 'customer') {
      return NextResponse.json({ success: false, error: 'Müşteri oturumu gerekli.' }, { status: 401 });
    }

    const { tenantId } = tenantScope(session);
    await ensureMainWarehouse(tenantId);
    const warehouses = await Warehouse.find({ tenantId, active: { $ne: false } })
      .sort({ isDefault: -1, name: 1 })
      .select('warehouseId name code isDefault')
      .lean();

    return NextResponse.json({ success: true, warehouses });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
