import mongoose from 'mongoose';

const OrderEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true },
    orderId: { type: String, default: '', index: true },
    orderNumber: { type: String, default: '' },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    source: { type: String, default: '' },
    url: { type: String, default: '' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

OrderEventSchema.index({ createdAt: -1 });

export default mongoose.models.OrderEvent ||
  mongoose.model('OrderEvent', OrderEventSchema);
