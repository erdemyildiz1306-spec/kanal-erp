import { jsPDF } from "jspdf";
import bwipjs from "bwip-js";

export type PackageLabelOrder = {
  orderNumber?: string;
  platform?: string;
  customerName?: string;
  customerAddress?: string;
  trackingNumber?: string;
  packageId?: string;
  cargoCompany?: string;
  totalAmount?: number;
  items?: Array<{
    barcode?: string;
    sku?: string;
    productName?: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
  }>;
  trendyolMeta?: { cargoTrackingNumber?: string };
};

export type PackageLabelSettings = {
  storeName?: string;
  printPackageContents?: boolean;
};

function pdfText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFC")
    .replace(/\s+/g, " ");
}

function pickTracking(order: PackageLabelOrder): string {
  return pdfText(order.trackingNumber || order.trendyolMeta?.cargoTrackingNumber);
}

function barcodeFormat(code: string): string {
  if (/^\d{13}$/.test(code)) return "ean13";
  if (/^\d{12}$/.test(code)) return "upca";
  if (/^\d{8}$/.test(code)) return "ean8";
  return "code128";
}

async function renderBarcodePng(code: string): Promise<string | null> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: barcodeFormat(code),
      text: code,
      scale: 2,
      height: 14,
      includetext: true,
      textxalign: "center",
    });
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function buildPackageLabelPdf(
  order: PackageLabelOrder,
  settings: PackageLabelSettings
): Promise<Uint8Array> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const storeName = pdfText(settings.storeName) || "Stok ERP";
  const cargo = pdfText(order.cargoCompany) || "Kargo";
  const tracking = pickTracking(order);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(storeName, margin, y);
  pdf.setFontSize(11);
  pdf.text(cargo, pageWidth - margin, y, { align: "right" });
  y += 8;

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.4);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 8;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Alici bilgileri", margin, y);
  y += 6;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const rows: string[] = [
    `Siparis no: ${pdfText(order.orderNumber) || "-"}`,
    `Ad-soyad: ${pdfText(order.customerName) || "-"}`,
    `Adres: ${pdfText(order.customerAddress) || "-"}`,
    `Takip no: ${tracking || "-"}`,
  ];
  const packageId = pdfText(order.packageId);
  if (packageId) rows.push(`Paket ID: ${packageId}`);

  for (const row of rows) {
    const lines = pdf.splitTextToSize(row, contentWidth);
    pdf.text(lines, margin, y);
    y += lines.length * 5 + 1;
  }

  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.text("Kargo barkodu", margin, y);
  y += 5;

  if (tracking) {
    const img = await renderBarcodePng(tracking);
    if (img) {
      pdf.addImage(img, "PNG", margin, y, contentWidth, 28);
      y += 32;
    } else {
      pdf.setFont("courier", "bold");
      pdf.setFontSize(12);
      pdf.text(tracking, margin, y);
      y += 10;
    }
  } else {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Takip numarasi henuz yok.", margin, y);
    y += 8;
  }

  if (settings.printPackageContents !== false && order.items?.length) {
    y += 4;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("Paket ici — urun ozeti", margin, y);
    y += 6;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    for (const item of order.items) {
      if (y > 270) {
        pdf.addPage();
        y = margin;
      }
      const qty = Number(item.quantity) || 1;
      const total = Number(item.totalPrice);
      const unit =
        item.unitPrice !== undefined
          ? Number(item.unitPrice)
          : Number.isFinite(total)
            ? total / qty
            : undefined;
      const line = [
        pdfText(item.productName) || "-",
        `SKU: ${pdfText(item.sku) || "-"}`,
        `Barkod: ${pdfText(item.barcode) || "-"}`,
        `Adet: ${qty}`,
        unit !== undefined ? `Birim: ${unit.toFixed(2)} TL` : "",
        Number.isFinite(total) ? `Tutar: ${total.toFixed(2)} TL` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      const wrapped = pdf.splitTextToSize(line, contentWidth);
      pdf.text(wrapped, margin, y);
      y += wrapped.length * 4.5 + 2;
    }

    if (order.totalAmount !== undefined && Number.isFinite(order.totalAmount)) {
      y += 2;
      pdf.setFont("helvetica", "bold");
      pdf.text(`Genel toplam: ${order.totalAmount.toFixed(2)} TL`, margin, y);
    }
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Lutfen barkodu katlamayiniz.", pageWidth / 2, 290, { align: "center" });

  return pdf.output("arraybuffer") as unknown as Uint8Array;
}
