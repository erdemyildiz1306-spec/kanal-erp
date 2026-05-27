import mongoose from 'mongoose';

/** Trendyol settlements + otherfinancials kayıtları — GelirUP tarzı net kâr analizi */
const FinancialTransactionSchema = new mongoose.Schema(
  {
    trendyolId: { type: String, required: true, unique: true },
    source: {
      type: String,
      enum: ['settlement', 'otherfinancial'],
      required: true,
    },
    transactionType: { type: String, required: true, index: true },
    transactionDate: { type: Date, required: true, index: true },
    barcode: { type: String, default: '', index: true },
    orderNumber: { type: String, default: '', index: true },
    shipmentPackageId: { type: String, default: '' },
    paymentOrderId: { type: Number, default: null },
    commissionAmount: { type: Number, default: 0 },
    commissionRate: { type: Number, default: null },
    sellerRevenue: { type: Number, default: 0 },
    debt: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

FinancialTransactionSchema.index({ transactionDate: -1, transactionType: 1 });
FinancialTransactionSchema.index({ orderNumber: 1, transactionType: 1 });

export default mongoose.models.FinancialTransaction ||
  mongoose.model('FinancialTransaction', FinancialTransactionSchema);
