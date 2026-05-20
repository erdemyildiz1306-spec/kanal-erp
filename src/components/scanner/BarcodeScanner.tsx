"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";

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

import { normalizeBarcode } from "@/lib/barcode-normalize";

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
  const baseVideo = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...baseVideo,
        facingMode: { ideal: "environment" },
      },
    });
  } catch {
    const deviceId = await pickBackCameraId();
    if (!deviceId) {
      throw new Error("Kamera bulunamadı veya izin verilmedi.");
    }
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...baseVideo,
        deviceId: { exact: deviceId },
      },
    });
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
  const [engine, setEngine] = useState<"native" | "zxing" | null>(null);

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
      video.srcObject = mediaStream;

      try {
        await video.play();
      } catch {
        if (!cancelled) onErrorRef.current?.("Kamera önizlemesi başlatılamadı.");
        return;
      }

      if (cancelled) return;
      setLive(true);
      onReadyRef.current?.();

      if (supportsNativeBarcodeDetector()) {
        try {
          const detector = new window.BarcodeDetector!({ formats: NATIVE_FORMATS });
          setEngine("native");

          const tick = async () => {
            if (cancelled || !videoRef.current) return;
            const el = videoRef.current;
            if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              try {
                const codes = await detector.detect(el);
                if (codes.length > 0 && codes[0]?.rawValue) {
                  emitScan(codes[0].rawValue);
                  return;
                }
              } catch {
                /* frame decode miss */
              }
            }
            rafRef.current = requestAnimationFrame(() => {
              void tick();
            });
          };

          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
          return;
        } catch {
          /* fall through to zxing */
        }
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
            {engine === "native" ? "Hızlı tarama" : "Taranıyor…"}
          </span>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Kamera hazırlanıyor…
          </span>
        )}
      </div>
      <p className="text-center pb-2 pt-2 text-xs erp-muted">
        Barkodu yatay tutun, yeşil çerçeveye hizalayın
      </p>
    </div>
  );
}
