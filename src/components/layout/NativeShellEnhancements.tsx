"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** APK WebView — çevrimdışı banner + aşağı çekince yenile */
export default function NativeShellEnhancements() {
  const [online, setOnline] = useState(true);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(isNativeShell());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      window.location.reload();
    } finally {
      setRefreshing(false);
      setPullY(0);
    }
  }, [refreshing]);

  useEffect(() => {
    if (!native) return;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 8) return;
      startY = e.touches[0]?.clientY ?? 0;
      tracking = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const y = e.touches[0]?.clientY ?? 0;
      setPullY(Math.max(0, Math.min(80, y - startY)));
    };
    const onTouchEnd = () => {
      if (pullY >= 56) void refresh();
      else setPullY(0);
      tracking = false;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [native, pullY, refresh]);

  if (!native) return null;

  return (
    <>
      {!online ? (
        <div className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 bg-amber-600 text-white text-xs font-semibold py-2 px-3 safe-area-top">
          <WifiOff size={14} />
          Çevrimdışı — bağlantı gelince sayfa yenilenebilir
        </div>
      ) : null}
      {pullY > 0 ? (
        <div
          className="fixed top-12 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-1 text-xs font-semibold text-slate-600 bg-white/95 border border-slate-200 rounded-full px-3 py-1 shadow"
          style={{ opacity: Math.min(1, pullY / 56) }}
        >
          <RefreshCw size={12} className={pullY >= 56 ? "animate-spin" : ""} />
          {pullY >= 56 ? "Bırakın, yenileniyor…" : "Yenilemek için bırakın"}
        </div>
      ) : null}
    </>
  );
}
