import mongoose from 'mongoose';

const CategorySchema = new mongoose.Schema({
  categoryId: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  parentId: { type: Number, default: null },
  isLeaf: { type: Boolean, default: false } // Sadece en alt seviyedeki yaprak kategorilere ürün eklenebilir.
}, { timestamps: true });

export default mongoose.models.Category || mongoose.model('Category', CategorySchema);
