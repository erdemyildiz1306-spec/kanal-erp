import mongoose from 'mongoose';

/** Trendyol kargo faturası kalemi — sipariş bazlı */
const CargoChargeSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    chargeType: { type: String, default: '' },
    invoiceId: { type: String, default: '', index: true },
    parcelUniqueId: { type: String, default: '' },
  },
  { timestamps: true }
);

CargoChargeSchema.index({ orderNumber: 1, invoiceId: 1, parcelUniqueId: 1 }, { unique: true });

export default mongoose.models.CargoCharge ||
  mongoose.model('CargoCharge', CargoChargeSchema);
