import mongoose from 'mongoose';

/** Depo bazlı stok satırı (ürün veya varyant) */
const WarehouseStockSchema = new mongoose.Schema(
  {
    warehouseId: { type: String, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, default: '' },
    barcode: { type: String, default: '' },
    variantSku: { type: String, default: '' },
    stock: { type: Number, default: 0 },
  },
  { timestamps: true }
);

WarehouseStockSchema.index(
  { warehouseId: 1, productId: 1, variantSku: 1 },
  { unique: true }
);

export default mongoose.models.WarehouseStock ||
  mongoose.model('WarehouseStock', WarehouseStockSchema);
