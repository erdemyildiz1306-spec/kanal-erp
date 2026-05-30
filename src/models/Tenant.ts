import mongoose from 'mongoose';

const LicenseModulesSchema = new mongoose.Schema(
  {
    trendyolSeller: { type: Boolean, default: true },
    webStoreApi: { type: Boolean, default: true },
    trendyolEfaturam: { type: Boolean, default: false },
    wordpress: { type: Boolean, default: false },
  },
  { _id: false }
);

const TenantLicenseSchema = new mongoose.Schema(
  {
    plan: {
      type: String,
      enum: ['trial', 'monthly', 'yearly', 'custom'],
      default: 'trial',
    },
    packageKey: {
      type: String,
      enum: ['trial', 'standard', 'efatura'],
      default: 'trial',
    },
    expiresAt: { type: Date, default: null },
    modules: { type: LicenseModulesSchema, default: () => ({}) },
    suspended: { type: Boolean, default: false },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const TenantSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    active: { type: Boolean, default: true },
    notes: { type: String, default: '' },
    license: { type: TenantLicenseSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.models.Tenant || mongoose.model('Tenant', TenantSchema);
