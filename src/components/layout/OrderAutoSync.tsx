"use client";

import { useEffect, useRef } from "react";

/** ERP açıkken Trendyol siparişlerini periyodik çeker; stok etiket/işleme alındığında düşer. */
const SYNC_INTERVAL_MS = 90_000;

export default function OrderAutoSync() {
  const busy = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const res = await fetch("/api/trendyol/sync-orders", { cache: "no-store" });
        const data = await res.json();
        if (data.success) {
          window.dispatchEvent(
            new CustomEvent("erp-orders-synced", { detail: data })
          );
        }
      } catch {
        /* sessiz — manuel «Trendyol'dan Çek» yedek kalır */
      } finally {
        busy.current = false;
      }
    };

    void run();
    const timer = window.setInterval(run, SYNC_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
