import mongoose from 'mongoose';

/** Trendyol kargo faturası kalemi — sipariş bazlı (kuruluş bazlı) */
const CargoChargeSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: 'default', index: true },
    orderNumber: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    chargeType: { type: String, default: '' },
    invoiceId: { type: String, default: '', index: true },
    parcelUniqueId: { type: String, default: '' },
  },
  { timestamps: true }
);

CargoChargeSchema.index(
  { tenantId: 1, orderNumber: 1, invoiceId: 1, parcelUniqueId: 1 },
  { unique: true }
);

export default mongoose.models.CargoCharge ||
  mongoose.model('CargoCharge', CargoChargeSchema);
