import mongoose from 'mongoose';

/** Havale/EFT ile lisans ödeme bildirimi — root onayından sonra lisans uzatılır */
const LicensePaymentRequestSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    packageKey: {
      type: String,
      enum: ['standard', 'efatura'],
      required: true,
    },
    plan: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    senderName: { type: String, default: '' },
    transferReference: { type: String, default: '' },
    note: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    submittedByUserId: { type: String, default: '' },
    reviewedByUserId: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true }
);

LicensePaymentRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export default mongoose.models.LicensePaymentRequest ||
  mongoose.model('LicensePaymentRequest', LicensePaymentRequestSchema);
