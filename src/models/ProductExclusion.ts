import mongoose from 'mongoose';

/** ERP'den silinen ürünler — kanal senkronunda tekrar oluşturulmasın */
const ProductExclusionSchema = new mongoose.Schema(
  {
    sku: { type: String, default: '', index: true },
    barcode: { type: String, default: '', index: true },
    trendyolProductId: { type: String, default: '' },
    trendyolProductMainId: { type: String, default: '' },
    stockCode: { type: String, default: '' },
    productName: { type: String, default: '' },
    reason: { type: String, default: 'manual_delete' },
  },
  { timestamps: true }
);

ProductExclusionSchema.index(
  { sku: 1, barcode: 1, trendyolProductId: 1 },
  { unique: false }
);

export default mongoose.models.ProductExclusion ||
  mongoose.model('ProductExclusion', ProductExclusionSchema);
