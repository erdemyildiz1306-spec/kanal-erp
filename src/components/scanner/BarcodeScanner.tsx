"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
} from "@zxing/library";

const BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
];

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "codabar",
  "itf",
];

const SCAN_INTERVAL_MS = 120;

import { normalizeBarcode } from "@/lib/barcode-normalize";
import {
  ensureNativeCameraPermission,
  mapCameraError,
} from "@/lib/native-camera-permission";

export { normalizeBarcode } from "@/lib/barcode-normalize";

type NativeBarcode = {
  rawValue: string;
};

type NativeBarcodeDetector = {
  detect(source: ImageBitmapSource): Promise<NativeBarcode[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => NativeBarcodeDetector;
  }
}

function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

function isMobileScannerContext(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isNativeShell()) return true;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function supportsNativeBarcodeDetector(): boolean {
  return typeof window !== "undefined" && typeof window.BarcodeDetector === "function";
}

async function pickBackCameraId(): Promise<string | undefined> {
  const devices = await BrowserMultiFormatReader.listVideoInputDevices();
  if (devices.length === 0) return undefined;
  const back = devices.find((device) =>
    /back|rear|environment|arka|wide|tele/i.test(device.label)
  );
  return back?.deviceId ?? devices[devices.length - 1]?.deviceId;
}

export async function requestScannerStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Bu cihazda kamera desteklenmiyor. Manuel barkod girişini kullanın veya uygulamayı güncelleyin."
    );
  }

  await ensureNativeCameraPermission();

  const baseVideo: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: { ideal: "environment" },
  };

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: baseVideo,
    });
  } catch (firstErr) {
    try {
      const deviceId = await pickBackCameraId();
      if (!deviceId) throw firstErr;
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          deviceId: { exact: deviceId },
        },
      });
    } catch (secondErr) {
      throw mapCameraError(secondErr ?? firstErr);
    }
  }
}

async function waitForVideoFrames(video: HTMLVideoElement, timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (video.videoWidth > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return video.videoWidth > 0;
}

function createZxingReader() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, BARCODE_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  return reader;
}

function decodeCanvasWithZxing(reader: MultiFormatReader, canvas: HTMLCanvasElement): string | null {
  try {
    const source = new HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const result = reader.decodeWithState(bitmap);
    return result.getText();
  } catch (err) {
    if (err instanceof NotFoundException) return null;
    return null;
  }
}

type BarcodeScannerProps = {
  active: boolean;
  stream: MediaStream | null;
  onScan: (code: string) => void;
  onError?: (message: string) => void;
  onReady?: () => void;
};

export default function BarcodeScanner({
  active,
  stream,
  onScan,
  onError,
  onReady,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const [live, setLive] = useState(false);
  const [engine, setEngine] = useState<"native" | "zxing" | "hybrid" | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
  }, [onScan, onError, onReady]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    controlsRef.current?.stop();
    controlsRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setLive(false);
    setEngine(null);
  }, []);

  const emitScan = useCallback(
    (raw: string) => {
      const code = normalizeBarcode(raw);
      if (!code || code.length < 4) return;

      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === code && now - last.at < 1500) return;
      lastScanRef.current = { code, at: now };

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(40);
      }

      stop();
      onScanRef.current(code);
    },
    [stop]
  );

  useEffect(() => {
    if (!active || !stream) {
      stop();
      return;
    }

    let cancelled = false;
    lastScanRef.current = null;

    async function attachStream() {
      const video = videoRef.current;
      const mediaStream = stream;
      if (!video || !mediaStream) return;

      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = mediaStream;

      try {
        await video.play();
      } catch {
        if (!cancelled) onErrorRef.current?.("Kamera önizlemesi başlatılamadı.");
        return;
      }

      const framesReady = await waitForVideoFrames(video);
      if (cancelled) return;
      if (!framesReady) {
        onErrorRef.current?.("Kamera görüntüsü hazır değil. Tekrar deneyin.");
        return;
      }

      setLive(true);
      onReadyRef.current?.();

      const useCanvasLoop =
        isMobileScannerContext() ||
        !supportsNativeBarcodeDetector();

      if (useCanvasLoop) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          onErrorRef.current?.("Tarayıcı canvas desteği yok.");
          return;
        }

        const zxingReader = createZxingReader();
        let detector: NativeBarcodeDetector | null = null;
        let mode: "hybrid" | "zxing" = "zxing";

        if (supportsNativeBarcodeDetector()) {
          try {
            detector = new window.BarcodeDetector!({ formats: NATIVE_FORMATS });
            mode = "hybrid";
          } catch {
            detector = null;
          }
        }

        setEngine(mode);

        let lastAttempt = 0;

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          const el = videoRef.current;

          if (el.videoWidth <= 0 || el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            rafRef.current = requestAnimationFrame(() => {
              void tick();
            });
            return;
          }

          const now = Date.now();
          if (now - lastAttempt < SCAN_INTERVAL_MS) {
            rafRef.current = requestAnimationFrame(() => {
              void tick();
            });
            return;
          }
          lastAttempt = now;

          canvas.width = el.videoWidth;
          canvas.height = el.videoHeight;
          ctx.drawImage(el, 0, 0, canvas.width, canvas.height);

          if (detector) {
            try {
              const codes = await detector.detect(canvas);
              const raw = codes[0]?.rawValue;
              if (raw) {
                emitScan(raw);
                return;
              }
            } catch {
              /* ZXing yedek */
            }
          }

          const zxingText = decodeCanvasWithZxing(zxingReader, canvas);
          if (zxingText) {
            emitScan(zxingText);
            return;
          }

          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
        };

        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
        return;
      }

      try {
        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, BARCODE_FORMATS);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 1500,
          tryPlayVideoTimeout: 10000,
        });
        setEngine("zxing");
        const controls = await reader.decodeFromStream(mediaStream, video, (result, error) => {
          if (cancelled) return;
          if (result) {
            emitScan(result.getText());
            return;
          }
          if (error && !(error instanceof NotFoundException)) {
            /* ignore transient decode errors */
          }
        });
        controlsRef.current = controls;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Barkod tarayıcı başlatılamadı.";
        if (!cancelled) {
          onErrorRef.current?.(message);
        }
      }
    }

    void attachStream();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, stream, stop, emitScan]);

  if (!active) return null;

  return (
    <div className="scanner-card overflow-hidden p-2 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)]">
      <div className="relative w-full min-h-[240px] rounded-xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="barcode-scanner-video w-full h-[min(52vh,360px)] object-cover"
          autoPlay
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 h-24 border-2 border-emerald-400/90 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        {live ? (
          <span className="absolute top-3 left-3 text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-600 text-white">
            {engine === "hybrid" ? "Mobil tarama" : engine === "native" ? "Hızlı tarama" : "Taranıyor…"}
          </span>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Kamera hazırlanıyor…
          </span>
        )}
      </div>
      <p className="text-center pb-2 pt-2 text-xs erp-muted">
        Barkodu yatay tutun, yeşil çerçeveye hizalayın · 15–30 cm mesafe
      </p>
    </div>
  );
}
