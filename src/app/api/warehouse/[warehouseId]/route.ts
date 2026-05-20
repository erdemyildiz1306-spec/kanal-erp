import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Warehouse from '@/models/Warehouse';
import WarehouseStock from '@/models/WarehouseStock';
import Product from '@/models/Product';
import { requireSession } from '@/lib/auth';
import { MAIN_WAREHOUSE_ID } from '@/lib/warehouse-stock';

export async function GET(
  request: Request,
  ctx: { params: Promise<{ warehouseId: string }> }
) {
  try {
    await connectToDatabase();
    const { warehouseId } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get('q') ?? '').trim().toLowerCase();

    const wh = await Warehouse.findOne({ warehouseId }).lean();
    if (!wh) {
      return NextResponse.json({ success: false, error: 'Depo bulunamadı.' }, { status: 404 });
    }

    const rows = await WarehouseStock.find({ warehouseId }).lean();
    const productIds = [...new Set(rows.map((r) => String(r.productId)))];
    const products = await Product.find({ _id: { $in: productIds } })
      .select('name sku barcode hasVariants variants stock price')
      .lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    let items = rows
      .map((r) => {
        const p = productMap.get(String(r.productId));
        if (!p) return null;
        const variantSku = String(r.variantSku ?? '');
        const variant =
          variantSku && p.hasVariants
            ? (p.variants ?? []).find((v: { sku?: string }) => String(v.sku) === variantSku)
            : null;
        return {
          productId: String(r.productId),
          name: p.name,
          sku: variantSku || r.sku || p.sku,
          barcode: r.barcode || (variant as { barcode?: string } | null)?.barcode || p.barcode,
          variantSku,
          stock: Number(r.stock) || 0,
          price: Number(p.price) || 0,
        };
      })
      .filter(Boolean) as Array<{
      productId: string;
      name: string;
      sku: string;
      barcode?: string;
      variantSku: string;
      stock: number;
      price: number;
    }>;

    if (q) {
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          String(i.barcode ?? '').toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    return NextResponse.json({ success: true, warehouse: wh, items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ warehouseId: string }> }
) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof Response) return session;

    const { warehouseId } = await ctx.params;
    const data = await request.json();

    const wh = await Warehouse.findOneAndUpdate(
      { warehouseId },
      {
        $set: {
          name: data.name,
          code: data.code,
          address: data.address ?? '',
          notes: data.notes ?? '',
          active: data.active !== undefined ? Boolean(data.active) : true,
        },
      },
      { new: true }
    );
    if (!wh) {
      return NextResponse.json({ success: false, error: 'Depo bulunamadı.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, warehouse: wh });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ warehouseId: string }> }
) {
  try {
    await connectToDatabase();
    const session = requireSession(request, ['admin']);
    if (session instanceof Response) return session;

    const { warehouseId } = await ctx.params;
    if (warehouseId === MAIN_WAREHOUSE_ID) {
      return NextResponse.json(
        { success: false, error: 'Ana depo silinemez.' },
        { status: 400 }
      );
    }

    const wh = await Warehouse.findOne({ warehouseId });
    if (!wh) {
      return NextResponse.json({ success: false, error: 'Depo bulunamadı.' }, { status: 404 });
    }

    const rows = await WarehouseStock.find({ warehouseId }).lean();
    if (rows.some((r) => Number(r.stock) > 0)) {
      return NextResponse.json(
        { success: false, error: 'Stoklu depo silinemez. Önce stokları transfer edin.' },
        { status: 400 }
      );
    }

    await WarehouseStock.deleteMany({ warehouseId });
    await Warehouse.deleteOne({ warehouseId });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
