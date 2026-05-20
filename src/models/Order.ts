import mongoose from 'mongoose';

const OrderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String },
  sku: { type: String },
  barcode: { type: String },
  /** Trendyol sipariş satırı — Picking bildirimi için */
  lineId: { type: String, default: '' },
  quantity: { type: Number, required: true },
  costPrice: { type: Number, default: 0 },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true }
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  platform: {
    type: String,
    enum: ['trendyol', 'web', 'retail', 'b2b'],
    required: true
  },
  status: {
    type: String,
    enum: ['Beklemede', 'Yeni', 'Hazırlanıyor', 'Kargolandı', 'Teslim Edildi', 'İptal Edildi', 'İade Edildi'],
    default: 'Beklemede'
  },
  
  customerName: { type: String, required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerAddress: { type: String },
  notes: { type: String, default: '' },
  warehouseId: { type: String, default: 'main' },
  
  costAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  profitAmount: { type: Number, default: 0 },
  
  items: [OrderItemSchema],
  
  trackingNumber: { type: String, default: '' },
  cargoCompany: { type: String, default: '' },
  packageId: { type: String, default: '' },
  cargoLabelUrl: { type: String, default: '' },
  
  platformOrderId: { type: String },

  /** Trendyol sync ile stok düşüldüyse true — tekrar sync'te çift düşümü önler */
  stockApplied: { type: Boolean, default: false },
}, { timestamps: true });

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ platform: 1, status: 1, createdAt: -1 });
OrderSchema.index({ customerId: 1, platform: 1, createdAt: -1 });

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
