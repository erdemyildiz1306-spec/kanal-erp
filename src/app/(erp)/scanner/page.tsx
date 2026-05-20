"use client";

import { useCallback, useState } from "react";
import { Camera, Package, CheckCircle, Minus, Plus, RotateCcw, AlertCircle } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useToast } from "@/components/providers/ToastProvider";
import BarcodeScanner, {
  normalizeBarcode,
  requestScannerStream,
} from "@/components/scanner/BarcodeScanner";

type ProductRow = {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  stock: number;
  price: number;
};

export default function ScannerPage() {
  const toast = useToast();
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [productDetails, setProductDetails] = useState<ProductRow | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [openingCamera, setOpeningCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const stopCamera = useCallback(() => {
    setCameraStream((prev) => {
      prev?.getTracks().forEach((track) => track.stop());
      return null;
    });
    setScanning(false);
    setOpeningCamera(false);
  }, []);

  const fetchProduct = useCallback(
    async (rawCode: string) => {
      const barcode = normalizeBarcode(rawCode);
      if (!barcode) return;

      setScanResult(barcode);
      setProductDetails(null);
      setLookupError(null);

      try {
        const params = new URLSearchParams({ barcode, sku: barcode });
        const res = await fetch(`/api/inventory/adjust?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
          setLookupError(data.error || "Ürün bulunamadı");
          toast.error("Ürün bulunamadı", data.error);
          return;
        }
        setProductDetails(data.product);
        toast.success("Ürün bulundu", data.product.name);
      } catch {
        setLookupError("Bağlantı hatası");
        toast.error("Bağlantı hatası");
      }
    },
    [toast]
  );

  const openCamera = useCallback(async () => {
    if (openingCamera || scanning) return;
    setOpeningCamera(true);
    setLookupError(null);

    try {
      const stream = await requestScannerStream();
      setCameraStream((prev) => {
        prev?.getTracks().forEach((track) => track.stop());
        return stream;
      });
      setScanning(true);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Kamera açılamadı. Tarayıcı izni verin ve HTTPS kullanın.";
      toast.error("Kamera hatası", message);
      setScanning(false);
    } finally {
      setOpeningCamera(false);
    }
  }, [openingCamera, scanning, toast]);

  const handleScan = useCallback(
    (code: string) => {
      stopCamera();
      void fetchProduct(code);
    },
    [fetchProduct, stopCamera]
  );

  const handleCameraError = useCallback(
    (message: string) => {
      stopCamera();
      toast.error("Kamera hatası", message);
    },
    [stopCamera, toast]
  );

  const updateStock = async (delta: number) => {
    if (!productDetails) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: productDetails.barcode || scanResult,
          sku: productDetails.sku,
          delta,
          syncChannels: true,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error("Stok güncellenemedi", data.error);
        return;
      }
      setProductDetails(data.product);
      toast.success(delta > 0 ? "Stok arttı" : "Stok azaldı", `Yeni stok: ${data.product.stock}`);
    } catch {
      toast.error("Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  };

  const resetScan = () => {
    setScanResult(null);
    setProductDetails(null);
    setLookupError(null);
    setManualCode("");
  };

  const showIdle = !scanning && !scanResult;

  return (
    <div className="erp-page max-w-lg mx-auto w-full">
      <PageHeader
        title="Barkod"
        subtitle="Kamera veya manuel kod ile hızlı stok işlemi"
      />

      {showIdle ? (
        <div className="erp-card p-5 space-y-4">
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <div className="w-20 h-20 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
              <Camera size={40} />
            </div>
            <p className="text-sm erp-muted">Tek elle stok artır/azalt</p>
          </div>
          <button
            type="button"
            disabled={openingCamera}
            onClick={() => void openCamera()}
            className="erp-btn erp-btn-primary w-full text-base disabled:opacity-60"
          >
            <Camera size={22} />
            {openingCamera ? "Kamera açılıyor…" : "Kamerayı Aç"}
          </button>
          <div className="pt-2 border-t border-[var(--erp-border)] space-y-2">
            <label className="text-sm font-semibold text-[var(--erp-text)]">Manuel barkod / SKU</label>
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Barkod numarası"
              className="erp-input font-mono"
              inputMode="numeric"
              autoComplete="off"
            />
            <button
              type="button"
              disabled={!manualCode.trim()}
              onClick={() => void fetchProduct(manualCode)}
              className="erp-btn erp-btn-secondary w-full disabled:opacity-50"
            >
              Ürünü Bul
            </button>
          </div>
        </div>
      ) : null}

      <BarcodeScanner
        active={scanning}
        stream={cameraStream}
        onScan={handleScan}
        onError={handleCameraError}
      />

      {scanning ? (
        <button
          type="button"
          onClick={stopCamera}
          className="erp-btn erp-btn-ghost w-full mt-3"
        >
          Taramayı İptal Et
        </button>
      ) : null}

      {scanResult && lookupError && !productDetails ? (
        <div className="erp-card p-5 space-y-4 animate-fade-in mt-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-red-500/15 text-red-600">
              <AlertCircle size={24} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[var(--erp-text)]">Ürün bulunamadı</h3>
              <p className="text-sm font-mono erp-muted truncate">{scanResult}</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{lookupError}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={resetScan} className="erp-btn erp-btn-ghost">
              Geri
            </button>
            <button
              type="button"
              onClick={() => {
                resetScan();
                void openCamera();
              }}
              className="erp-btn erp-btn-primary"
            >
              Tekrar Tara
            </button>
          </div>
        </div>
      ) : null}

      {scanResult && productDetails ? (
        <div className="erp-card p-5 space-y-5 animate-fade-in mt-3">
          <div className="flex items-center gap-3 pb-4 border-b border-[var(--erp-border)]">
            <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-600">
              <CheckCircle size={24} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[var(--erp-text)]">Barkod Okundu</h3>
              <p className="text-sm font-mono erp-muted truncate">{scanResult}</p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-2)] p-4 flex gap-4">
            <div className="w-16 h-16 rounded-xl bg-[var(--erp-surface)] border border-[var(--erp-border)] flex items-center justify-center shrink-0">
              <Package className="text-[var(--erp-text-muted)]" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-[var(--erp-text)] leading-snug">{productDetails.name}</h4>
              <p className="text-xs erp-muted mt-1">SKU: {productDetails.sku}</p>
              <div className="flex flex-wrap gap-3 mt-2 text-sm">
                <span className="font-bold text-[var(--erp-accent)]">{productDetails.price} ₺</span>
                <span className="font-semibold">Stok: {productDetails.stock}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void updateStock(-1)}
              className="erp-btn erp-btn-ghost min-h-[4rem] text-red-600 border-red-300/50 bg-red-500/5 disabled:opacity-60"
            >
              <Minus size={22} />
              -1 Stok
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void updateStock(1)}
              className="erp-btn erp-btn-primary min-h-[4rem] disabled:opacity-60"
            >
              <Plus size={22} />
              +1 Stok
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              resetScan();
              void openCamera();
            }}
            className="erp-btn erp-btn-secondary w-full"
          >
            <RotateCcw size={20} />
            Yeni Barkod
          </button>
        </div>
      ) : null}
    </div>
  );
}
