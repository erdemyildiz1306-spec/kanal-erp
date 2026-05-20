import mongoose from "mongoose";

const InvoiceLineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, default: 0 },
    /** Yüzde (örn. 20 için KDV %20) */
    vatRate: { type: Number, required: true, default: 20 },
    lineNet: { type: Number, default: 0 },
    lineVat: { type: Number, default: 0 },
    lineGross: { type: Number, default: 0 },
  },
  { _id: true }
);

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    /** İsteğe bağlı ERP sipariş numarası / platform referansı */
    orderRef: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Taslak", "Kesildi", "İptal"],
      default: "Taslak",
    },
    customerName: { type: String, default: "" },
    /** B2C için TCKN / B2B için VKN (opsiyonel) */
    customerTaxId: { type: String, default: "" },
    customerAddress: { type: String, default: "" },

    lines: [InvoiceLineSchema],

    netTotal: { type: Number, default: 0 },
    vatTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    /** e-Belge / entegrasyon referansları (ileride doldurulur) */
    externalDocumentId: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.Invoice || mongoose.model("Invoice", InvoiceSchema);
