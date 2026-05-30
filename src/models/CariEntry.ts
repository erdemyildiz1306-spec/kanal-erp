import mongoose from 'mongoose';

const CariEntrySchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: 'default', index: true },
    type: { type: String, enum: ['gelir', 'gider', 'tahsilat', 'duzeltme'], required: true },
    amount: { type: Number, required: true },
    description: { type: String, default: '' },
    reference: { type: String, default: '' },
    category: { type: String, default: 'Genel' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    cashboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashbox' },
    direction: { type: String, enum: ['in', 'out'], default: 'in' },
  },
  { timestamps: true }
);

CariEntrySchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.models.CariEntry ||
  mongoose.model('CariEntry', CariEntrySchema);
