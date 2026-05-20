import mongoose from 'mongoose';

/** Kullanıcı bazlı bildirim okundu / silindi durumu (özet uyarılar için) */
const NotificationStateSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    /** new-orders | low-stock | ok */
    itemId: { type: String, required: true },
    /** İçerik değişince bildirim yeniden görünür */
    fingerprint: { type: String, default: '' },
    read: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationStateSchema.index({ userId: 1, itemId: 1 }, { unique: true });

export default mongoose.models.NotificationState ||
  mongoose.model('NotificationState', NotificationStateSchema);
