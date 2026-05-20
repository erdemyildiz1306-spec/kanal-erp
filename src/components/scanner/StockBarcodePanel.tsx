"use client";

import { useCallback, useState } from "react";
import {
  Camera,
  Package,
  CheckCircle,
  Minus,
  Plus,
  RotateCcw,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ScanBarcode,
} from "lucide-react";
import BarcodeScanner, { requestScannerStream } from "@/components/scanner/BarcodeScanner";
import { normalizeBarcode } from "@/lib/barcode-normalize";
import { applyStockDelta, lookupStockProduct, type ScannedStockProduct } from "@/lib/stock-barcode-api";
import { useToast } from "@/components/providers/ToastProvider";

export type StockBarcodePanelProps = {
  warehouseId?: string;
  syncChannels?: boolean;
  defaultNote?: string;
  reason?: string;
  onStockChanged?: (product: ScannedStockProduct) => void;
  variant?: "full" | "embedded";
  className?: string;
};

export default function StockBarcodePanel({
  warehouseId,
  syncChannels = true,
  defaultNote,
  reason = "adjustment",
  onStockChanged,
  variant = "full",
  className = "",
}: StockBarcodePanelProps) {
  const toast = useToast();
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [productDetails, setProductDetails] = useState<ScannedStockProduct | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [openingCamera, setOpeningCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState(defaultNote ?? "");

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
      const code = normalizeBarcode(rawCode);
      if (!code) return;

      setScanResult(code);
      setProductDetails(null);
      setLookupError(null);

      const result = await lookupStockProduct(code);
      if (!result.success) {
        setLookupError(result.error);
        toast.error("Ürün bulunamadı", result.error);
        return;
      }
      setProductDetails(result.product);
      toast.success("Ürün bulundu", result.product.name);
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

  const applyDelta = async (sign: 1 | -1) => {
    if (!productDetails) return;
    const qty = Math.max(1, Math.floor(quantity) || 1);
    const delta = sign * qty;
    setBusy(true);
    try {
      const result = await applyStockDelta({
        barcode: productDetails.barcode || scanResult || undefined,
        sku: productDetails.sku,
        delta,
        warehouseId,
        syncChannels,
        reason,
        note: note.trim() || defaultNote,
      });
      if (!result.success) {
        toast.error("Stok güncellenemedi", result.error);
        return;
      }
      setProductDetails(result.product);
      onStockChanged?.(result.product);
      toast.success(
        delta > 0 ? "Stok girişi yapıldı" : "Stok çıkışı yapıldı",
        `${result.product.name} · Yeni stok: ${result.product.stock}`
      );
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
    setQuantity(1);
  };

  const showIdle = !scanning && !scanResult;
  const cardClass = variant === "embedded" ? "erp-card" : "erp-card";

  return (
    <div className={className}>
      {showIdle ? (
        <div className={`${cardClass} p-5 space-y-4`}>
          {variant === "embedded" ? (
            <div className="flex items-center gap-2 pb-1">
              <ScanBarcodeIcon />
              <div>
                <h3 className="font-bold text-[var(--erp-text)]">Barkod ile stok giriş/çıkış</h3>
                <p className="text-xs erp-muted">Okut → adet seç → giriş veya çıkış</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-20 h-20 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
                <Camera size={40} />
              </div>
              <p className="text-sm erp-muted">Barkod okutarak stok ekle veya düş</p>
            </div>
          )}
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
        <button type="button" onClick={stopCamera} className="erp-btn erp-btn-ghost w-full mt-3">
          Taramayı İptal Et
        </button>
      ) : null}

      {scanResult && lookupError && !productDetails ? (
        <div className={`${cardClass} p-5 space-y-4 animate-fade-in mt-3`}>
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
        <div className={`${cardClass} p-5 space-y-5 animate-fade-in mt-3`}>
          <div className="flex items-center gap-3 pb-4 border-b border-[var(--erp-border)]">
            <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-600">
              <CheckCircle size={24} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[var(--erp-text)]">Ürün seçildi</h3>
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

          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--erp-text)]">Adet</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="erp-btn erp-btn-ghost min-h-[3rem] min-w-[3rem] px-0"
              >
                <Minus size={20} />
              </button>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="erp-input text-center font-bold text-lg flex-1"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => setQuantity((q) => q + 1)}
                className="erp-btn erp-btn-ghost min-h-[3rem] min-w-[3rem] px-0"
              >
                <Plus size={20} />
              </button>
            </div>
            <div className="flex gap-2">
              {[1, 5, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => setQuantity(n)}
                  className={`erp-btn erp-btn-ghost flex-1 text-sm ${quantity === n ? "ring-2 ring-[var(--erp-accent)]" : ""}`}
                >
                  {n} ad.
                </button>
              ))}
            </div>
          </div>

          {(variant === "embedded" || warehouseId) && (
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Not (isteğe bağlı)"
              className="erp-input text-sm"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyDelta(-1)}
              className="erp-btn erp-btn-ghost min-h-[4rem] text-red-600 border-red-300/50 bg-red-500/5 disabled:opacity-60"
            >
              <ArrowUpFromLine size={22} />
              Stok Çıkışı
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyDelta(1)}
              className="erp-btn erp-btn-primary min-h-[4rem] disabled:opacity-60"
            >
              <ArrowDownToLine size={22} />
              Stok Girişi
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
            Sonraki Barkod
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ScanBarcodeIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
      <ScanBarcode size={20} />
    </div>
  );
}
