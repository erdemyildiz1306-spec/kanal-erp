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
  /** Trendyol settlement — komisyon (Sale kayıtlarından) */
  trendyolCommission: { type: Number, default: 0 },
  /** Trendyol settlement — satıcı hakediş */
  trendyolSellerRevenue: { type: Number, default: 0 },
  /** Kargo faturası kalemlerinden (GelirUP tarzı) */
  trendyolCargoFee: { type: Number, default: 0 },
  /** sellerRevenue − maliyet − kargo (finans senkronu) */
  netProfitAmount: { type: Number, default: null },
  financeSyncedAt: { type: Date, default: null },
  /** İptal/iade stok + finans iadesi işlendi (çift işlem engeli) */
  trendyolIadeIslendi: { type: Boolean, default: false },
  
  items: [OrderItemSchema],
  
  trackingNumber: { type: String, default: '' },
  cargoCompany: { type: String, default: '' },
  packageId: { type: String, default: '' },
  cargoLabelUrl: { type: String, default: '' },
  /** Trendyol paket meta — cargoTrackingNumber (common-label için) */
  trendyolMeta: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  /** Trendyol e-fatura / e-arşiv gönderim durumu */
  trendyolInvoice: {
    status: { type: String, default: '' },
    invoiceNumber: { type: String, default: '' },
    invoiceLink: { type: String, default: '' },
    invoiceUuid: { type: String, default: '' },
    invoiceDateTime: { type: Number, default: 0 },
    sentAt: { type: Date, default: null },
    sentVia: { type: String, default: '' },
    erpInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    lastError: { type: String, default: '' },
  },
  
  platformOrderId: { type: String },

  /** Trendyol sync ile stok düşüldüyse true — tekrar sync'te çift düşümü önler */
  stockApplied: { type: Boolean, default: false },
  /** Trendyol iki aşamalı stok — eşik öncesi rezerv */
  stockReserved: { type: Boolean, default: false },
}, { timestamps: true });

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ platform: 1, status: 1, createdAt: -1 });
OrderSchema.index({ customerId: 1, platform: 1, createdAt: -1 });

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
