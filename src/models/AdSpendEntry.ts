import mongoose from 'mongoose';

/** Trendyol reklam harcaması — manuel veya finans ekstresinden */
const AdSpendEntrySchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, default: 'default', index: true },
    spendDate: { type: Date, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    platform: { type: String, default: 'trendyol', index: true },
    campaign: { type: String, default: '' },
    note: { type: String, default: '' },
    source: {
      type: String,
      enum: ['manual', 'trendyol_finance'],
      default: 'manual',
    },
    trendyolId: { type: String, default: undefined, sparse: true },
  },
  { timestamps: true }
);

AdSpendEntrySchema.index({ tenantId: 1, trendyolId: 1 }, { unique: true, sparse: true });
AdSpendEntrySchema.index({ tenantId: 1, spendDate: -1, platform: 1 });

export default mongoose.models.AdSpendEntry ||
  mongoose.model('AdSpendEntry', AdSpendEntrySchema);
