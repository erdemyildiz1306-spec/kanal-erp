import mongoose from 'mongoose';

/** Trendyol barkod/SKU ↔ yerel ürün eşlemesi */
const ProductLinkSchema = new mongoose.Schema(
  {
    matchType: { type: String, enum: ['barcode', 'sku'], required: true },
    matchKey: { type: String, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantSku: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

ProductLinkSchema.index({ matchType: 1, matchKey: 1 }, { unique: true });

export default mongoose.models.ProductLink ||
  mongoose.model('ProductLink', ProductLinkSchema);
