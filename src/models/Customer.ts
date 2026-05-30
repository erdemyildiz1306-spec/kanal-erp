import mongoose from 'mongoose';

/** Toptan / B2B müşteri — ayrı panel girişi */
const CustomerSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: 'default', index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    companyName: { type: String, default: '' },
    phone: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    /** Pozitif = müşterinin borcu (TRY) */
    balance: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export default mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);
