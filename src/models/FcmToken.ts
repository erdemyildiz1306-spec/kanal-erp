import mongoose from 'mongoose';

const FcmTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    userId: { type: String, default: '', index: true },
    platform: { type: String, default: 'web' },
  },
  { timestamps: true }
);

export default mongoose.models.FcmToken ||
  mongoose.model('FcmToken', FcmTokenSchema);
