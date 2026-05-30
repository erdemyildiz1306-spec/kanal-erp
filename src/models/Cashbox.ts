import mongoose from 'mongoose';

const CashboxSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: 'default', index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['general', 'bank', 'pos'], default: 'general' },
    balance: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CashboxSchema.index({ tenantId: 1, isDefault: 1 });

export default mongoose.models.Cashbox || mongoose.model('Cashbox', CashboxSchema);
