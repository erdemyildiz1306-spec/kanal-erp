import mongoose from 'mongoose';

const StockMovementSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, default: 'default', index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, default: '' },
    barcode: { type: String, default: '' },
    variantSku: { type: String, default: '' },
    delta: { type: Number, required: true },
    stockAfter: { type: Number, required: true },
    reason: {
      type: String,
      enum: [
        'order',
        'order_reserve',
        'webhook',
        'manual',
        'scanner',
        'sync',
        'adjustment',
        'return',
      ],
      default: 'adjustment',
    },
    reference: { type: String, default: '' },
    userId: { type: String, default: '' },
    userName: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

StockMovementSchema.index({ tenantId: 1, createdAt: -1 });
StockMovementSchema.index({ createdAt: -1 });
StockMovementSchema.index({ productId: 1, createdAt: -1 });
StockMovementSchema.index({ reference: 1, barcode: 1 });
StockMovementSchema.index({ reference: 1, variantSku: 1 });

export default mongoose.models.StockMovement ||
  mongoose.model('StockMovement', StockMovementSchema);
