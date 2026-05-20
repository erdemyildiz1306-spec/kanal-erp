import mongoose from 'mongoose';

const CariEntrySchema = new mongoose.Schema(
  {
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

export default mongoose.models.CariEntry ||
  mongoose.model('CariEntry', CariEntrySchema);
