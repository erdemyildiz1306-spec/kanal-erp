"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const READER_ID = "barcode-reader-viewport";

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

export function normalizeBarcode(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

type BarcodeScannerProps = {
  active: boolean;
  onScan: (code: string) => void;
  onError?: (message: string) => void;
};

export default function BarcodeScanner({ active, onScan, onError }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onScan, onError]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {
      /* already stopped */
    }
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!active) {
      void stopScanner();
      setCameraError(null);
      setStarting(false);
      return;
    }

    let cancelled = false;

    async function start() {
      setStarting(true);
      setCameraError(null);
      lastScanRef.current = null;

      await stopScanner();
      if (cancelled) return;

      await new Promise((resolve) => setTimeout(resolve, 200));
      if (cancelled || !document.getElementById(READER_ID)) return;

      const viewWidth = Math.min(window.innerWidth - 40, 420);
      const scanConfig = {
        fps: 12,
        qrbox: { width: viewWidth, height: Math.max(100, Math.round(viewWidth * 0.32)) },
        aspectRatio: 1.777778,
        disableFlip: false,
        videoConstraints: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        } as MediaTrackConstraints,
      };

      const scannerConfig = {
        formatsToSupport: BARCODE_FORMATS,
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      };

      const handleSuccess = (decodedText: string) => {
        const code = normalizeBarcode(decodedText);
        if (!code || code.length < 4) return;

        const now = Date.now();
        const last = lastScanRef.current;
        if (last && last.code === code && now - last.at < 2000) return;
        lastScanRef.current = { code, at: now };

        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(40);
        }

        void stopScanner().then(() => {
          if (!cancelled) onScanRef.current(code);
        });
      };

      const handleFrameError = () => {
        /* expected while searching */
      };

      async function tryStart(
        cameraIdOrConfig: string | MediaTrackConstraints
      ): Promise<boolean> {
        const scanner = new Html5Qrcode(READER_ID, scannerConfig);
        scannerRef.current = scanner;
        await scanner.start(cameraIdOrConfig, scanConfig, handleSuccess, handleFrameError);
        return true;
      }

      try {
        await tryStart({ facingMode: "environment" });
        if (!cancelled) setStarting(false);
        return;
      } catch {
        await stopScanner();
      }

      if (cancelled) return;

      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras.length === 0) throw new Error("Kamera bulunamadı.");

        const backCamera = cameras.find((camera) =>
          /back|rear|environment|arka|wide/i.test(camera.label)
        );
        const cameraId = backCamera?.id ?? cameras[cameras.length - 1]?.id;
        if (!cameraId) throw new Error("Kamera seçilemedi.");

        await tryStart(cameraId);
        if (!cancelled) setStarting(false);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Kamera açılamadı. İzin verildiğinden emin olun.";
        if (!cancelled) {
          setCameraError(message);
          onErrorRef.current?.(message);
          setStarting(false);
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [active, stopScanner]);

  useEffect(() => {
    if (!active) return;

    const onVisibilityChange = () => {
      const scanner = scannerRef.current;
      if (!scanner?.isScanning) return;
      if (document.hidden) {
        scanner.pause(true);
      } else {
        try {
          scanner.resume();
        } catch {
          /* ignore */
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [active]);

  if (!active) return null;

  return (
    <div className="erp-card overflow-hidden p-2">
      <div id={READER_ID} className="barcode-scanner-viewport w-full min-h-[220px] rounded-xl overflow-hidden bg-black" />
      {starting ? (
        <p className="text-center py-3 text-sm erp-muted">Kamera açılıyor…</p>
      ) : null}
      {cameraError ? (
        <p className="text-center px-3 py-3 text-sm text-red-600 dark:text-red-400">{cameraError}</p>
      ) : null}
      {!starting && !cameraError ? (
        <p className="text-center pb-2 text-xs erp-muted">Barkodu yatay tutun, iyi aydınlatılmış alanda tarayın</p>
      ) : null}
    </div>
  );
}
