import mongoose from 'mongoose';

const VariantTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    values: { type: [String], default: [] },
    trendyolCategoryId: { type: Number, default: null },
    trendyolAttributeId: { type: Number, default: null },
  },
  { timestamps: true }
);

VariantTemplateSchema.index({ name: 1 }, { unique: true });

export default mongoose.models.VariantTemplate ||
  mongoose.model('VariantTemplate', VariantTemplateSchema);
