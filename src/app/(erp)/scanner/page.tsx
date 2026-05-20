"use client";

import PageHeader from "@/components/ui/PageHeader";
import StockBarcodePanel from "@/components/scanner/StockBarcodePanel";

export default function ScannerPage() {
  return (
    <div className="erp-page max-w-lg mx-auto w-full">
      <PageHeader
        title="Barkod"
        subtitle="Kamera veya manuel kod ile hızlı stok giriş/çıkış"
      />
      <StockBarcodePanel variant="full" />
    </div>
  );
}
