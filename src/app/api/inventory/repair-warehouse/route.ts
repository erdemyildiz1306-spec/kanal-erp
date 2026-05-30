import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireSession } from '@/lib/auth';
import { tenantScope, belongsToTenant } from '@/lib/tenant';
import { mergeTenant } from '@/lib/tenant-query';
import {
  migrateOrphanVariantWarehouseRows,
  repairOrphanVariantWarehouseStockBatch,
  ensureAllVariantWarehouseRows,
  syncProductStockFromWarehouses,
} from '@/lib/warehouse-stock';
import { findProductBySkuOrBarcode } from '@/lib/inventory';

/** Yetim depo satırlarını onarır ve ürün stok toplamlarını yeniden hesaplar. */
export async function POST(request: Request) {
  try {
    const session = requireSession(request, ['admin', 'operator']);
    if (session instanceof NextResponse) return session;

    await connectToDatabase();
    const { tenantId } = tenantScope(session);
    const body = (await request.json()) as { productId?: string; sku?: string; all?: boolean };

    if (body.all) {
      const variantProducts = await Product.find(
        mergeTenant(tenantId, { hasVariants: true })
      )
        .select('_id')
        .lean();
      for (const p of variantProducts) {
        await migrateOrphanVariantWarehouseRows(String(p._id));
        await ensureAllVariantWarehouseRows(String(p._id));
      }
      const repaired = await repairOrphanVariantWarehouseStockBatch(
        variantProducts.map((p) => String(p._id))
      );
      return NextResponse.json({
        success: true,
        repaired,
        message: `${repaired} varyantlı ürünün depo stokları onarıldı.`,
      });
    }

    let productId = String(body.productId ?? '').trim();
    if (!productId && body.sku) {
      const match = await findProductBySkuOrBarcode(String(body.sku).trim(), undefined, tenantId);
      if (match?.product?._id) productId = String(match.product._id);
    }

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId veya sku gerekli.' },
        { status: 400 }
      );
    }

    const owned = await Product.findById(productId).lean();
    if (!owned) {
      return NextResponse.json({ success: false, error: 'Ürün bulunamadı.' }, { status: 404 });
    }
    if (!belongsToTenant(session, owned.tenantId)) {
      return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 403 });
    }

    await migrateOrphanVariantWarehouseRows(productId);
    await ensureAllVariantWarehouseRows(productId);
    const product = await syncProductStockFromWarehouses(productId);
    if (!product) {
      return NextResponse.json({ success: false, error: 'Ürün bulunamadı.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      product: {
        id: String(product._id),
        sku: product.sku,
        stock: product.stock,
        variants: product.variants,
      },
      message: 'Depo stokları onarıldı ve ürün toplamları güncellendi.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Onarım hatası';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
