import mongoose from "mongoose";

/** Tek fiziksel depo (varsayılan: `warehouseId` = main) */
const WarehouseSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: "default", index: true },
    warehouseId: { type: String, required: true, default: "main" },
    name: { type: String, required: true, default: "Ana Depo" },
    code: { type: String, default: "MAIN" },
    address: { type: String, default: "" },
    notes: { type: String, default: "" },
    isDefault: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

WarehouseSchema.index({ tenantId: 1, warehouseId: 1 }, { unique: true });

export default mongoose.models.Warehouse || mongoose.model("Warehouse", WarehouseSchema);
