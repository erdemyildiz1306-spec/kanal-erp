import mongoose from 'mongoose';

const ActivityLogSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: 'default', index: true },
    action: { type: String, required: true },
    module: { type: String, default: 'system' },
    detail: { type: String, default: '' },
    userId: { type: String, default: '' },
    userName: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ActivityLogSchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.models.ActivityLog ||
  mongoose.model('ActivityLog', ActivityLogSchema);
