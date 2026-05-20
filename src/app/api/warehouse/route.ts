import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Warehouse from '@/models/Warehouse';
import Product from '@/models/Product';
import WarehouseStock from '@/models/WarehouseStock';
import {
  ensureMainWarehouse,
  listWarehouses,
  getWarehouseStockSummary,
  seedWarehouseFromProduct,
  MAIN_WAREHOUSE_ID,
} from '@/lib/warehouse-stock';
import { requireSession } from '@/lib/auth';

export async function GET() {
  try {
    await connectToDatabase();
    await ensureMainWarehouse();

    const mainCount = await WarehouseStock.countDocuments({ warehouseId: MAIN_WAREHOUSE_ID });
    if (mainCount === 0) {
      const products = await Product.find({}).select('_id').lean();
      for (const p of products) {
        await seedWarehouseFromProduct(MAIN_WAREHOUSE_ID, String(p._id));
      }
    }

    const warehouses = await listWarehouses();
    const enriched = await Promise.all(
      warehouses.map(async (w) => {
        const summary = await getWarehouseStockSummary(String(w.warehouseId));
        return { ...w, ...summary };
      })
    );
    return NextResponse.json({ success: true, warehouses: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof Response) return session;

    const data = await request.json();
    const name = String(data.name ?? '').trim();
    if (!name) {
      return NextResponse.json({ success: false, error: 'Depo adı zorunlu.' }, { status: 400 });
    }

    const code = String(data.code ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    const warehouseId = code || `wh_${Date.now().toString(36)}`;

    const exists = await Warehouse.findOne({ warehouseId });
    if (exists) {
      return NextResponse.json({ success: false, error: 'Depo kodu kullanımda.' }, { status: 409 });
    }

    const wh = await Warehouse.create({
      warehouseId,
      name,
      code: code || warehouseId.toUpperCase(),
      address: String(data.address ?? ''),
      notes: String(data.notes ?? ''),
      isDefault: false,
      active: true,
    });

    const products = await Product.find({}).select('_id').lean();
    for (const p of products) {
      await seedWarehouseFromProduct(warehouseId, String(p._id));
    }

    return NextResponse.json({ success: true, warehouse: wh });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** Tek depo güncelleme (legacy + çoklu depo) */
export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof Response) return session;

    const data = await request.json();
    const warehouseId = String(data.warehouseId ?? MAIN_WAREHOUSE_ID);
    await ensureMainWarehouse();

    const wh = await Warehouse.findOneAndUpdate(
      { warehouseId },
      {
        $set: {
          name: data.name ?? 'Ana Depo',
          code: data.code ?? warehouseId.toUpperCase(),
          address: data.address ?? '',
          notes: data.notes ?? '',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json({ success: true, warehouse: wh });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
