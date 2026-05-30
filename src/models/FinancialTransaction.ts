import mongoose from 'mongoose';

/** Trendyol settlements + otherfinancials kayıtları — GelirUP tarzı net kâr analizi */
const FinancialTransactionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, default: 'default', index: true },
    trendyolId: { type: String, required: true },
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
    /** Kargo faturası detay API toplamı (DeductionInvoices — Kargo Faturası) */
    cargoInvoiceTotal: { type: Number, default: null },
  },
  { timestamps: true }
);

FinancialTransactionSchema.index({ tenantId: 1, trendyolId: 1 }, { unique: true });
FinancialTransactionSchema.index({ transactionDate: -1, transactionType: 1 });
FinancialTransactionSchema.index({ tenantId: 1, orderNumber: 1, transactionType: 1 });

export default mongoose.models.FinancialTransaction ||
  mongoose.model('FinancialTransaction', FinancialTransactionSchema);
