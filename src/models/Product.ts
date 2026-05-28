import mongoose from 'mongoose';

const VariantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    barcode: { type: String, required: true },
    stock: { type: Number, default: 0 },
    sizeLabel: { type: String, default: '' },
    colorLabel: { type: String, default: '' },
  },
  { _id: true }
);

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    /** Ürün açıklaması (liste / kanal kullanımları için) */
    description: { type: String, default: '' },
    sku: { type: String, required: true, unique: true },
    /** Tekil üründe kullanılır; varyantlı modda bileşik tanıma için sentinel veya ilk varyanta kopyalanabilir */
    barcode: {
      type: String,
      default: '',
      unique: true,
      sparse: true,
    },

    images: [
      {
        url: { type: String, required: true },
        sortOrder: { type: Number, default: 0 },
      },
    ],

    hasVariants: { type: Boolean, default: false },
    variants: [VariantSchema],

    costPrice: { type: Number, required: true, default: 0 },
    price: { type: Number, required: true, default: 0 },
    /** Trendyol kargo tahmini — desi / hacim ağırlığı */
    dimensionalWeight: { type: Number, default: 1, min: 0.1 },
    /** Sabit kargo ücreti (₺/adet) — fatura gelmeden kâr hesabında */
    cargoFee: { type: Number, default: 0, min: 0 },
    prices: {
      website: { type: Number, default: 0 },
      trendyol: { type: Number, default: 0 },
    },

    stock: { type: Number, required: true, default: 0 },
    safetyStock: { type: Number, default: 2 },
    warehouseLocation: { type: String, default: '' },

    /** Müşteri portalında gösterilsin mi */
    customerVisible: { type: Boolean, default: true },
    active: { type: Boolean, default: true },

    category: { type: String, default: '' },
    trendyolCategoryId: { type: Number },

    /** Trendyol yayımlama — kategori öznitelikleri (beden, renk vb.) */
    trendyolAttributes: [
      {
        attributeId: { type: Number, required: true },
        attributeName: { type: String, default: '' },
        attributeValueId: { type: Number },
        attributeValue: { type: String, default: '' },
      },
    ],

    platforms: [{ type: String, enum: ['trendyol', 'web'] }],

    integrations: {
      trendyol: {
        productId: { type: String, default: '' },
        /** Trendyol model (productMainId) — varyantları tek üründe gruplamak için */
        productMainId: { type: String, default: '' },
        approved: { type: Boolean, default: false },
        syncActive: { type: Boolean, default: true },
      },
      web: {
        productId: { type: String, default: '' },
        syncActive: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ active: 1, customerVisible: 1, name: 1 });

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
