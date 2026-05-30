import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["root", "admin", "operator", "accountant"],
      default: "operator",
    },
    active: { type: Boolean, default: true },
    /** Kuruluş — çok kiracılı veri ayrımı */
    tenantId: { type: String, default: 'default', index: true },
    /** admin | signup — kayıt kaynağı */
    signupSource: {
      type: String,
      enum: ['admin', 'signup'],
      default: 'admin',
    },
  },
  { timestamps: true }
);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export default mongoose.models.User || mongoose.model("User", UserSchema);
