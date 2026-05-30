"use client";

import { useEffect, useRef } from "react";
import { useModuleSettings } from "@/components/providers/ModuleSettingsProvider";

/** ERP açıkken Trendyol siparişlerini periyodik çeker; stok etiket/işleme alındığında düşer. */
export default function OrderAutoSync() {
  const busy = useRef(false);
  const { integrationModules, trendyolAutoSyncIntervalMinutes, ready } = useModuleSettings();
  const intervalMs = Math.max(60_000, (trendyolAutoSyncIntervalMinutes || 2) * 60_000);

  useEffect(() => {
    if (!ready || integrationModules.trendyolSeller === false) return;

    const run = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const res = await fetch("/api/trendyol/sync-orders", { cache: "no-store" });
        const data = await res.json();
        if (data.success) {
          const changed =
            (Number(data.count) || 0) > 0 ||
            (Number(data.stockAdjusted) || 0) > 0 ||
            (Number(data.stockRestored) || 0) > 0;
          if (changed) {
            window.dispatchEvent(
              new CustomEvent("erp-orders-synced", { detail: data })
            );
          }
        }
      } catch {
        /* sessiz — manuel «Trendyol'dan Çek» yedek kalır */
      } finally {
        busy.current = false;
      }
    };

    void run();
    const timer = window.setInterval(run, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready, integrationModules.trendyolSeller, intervalMs]);

  return null;
}
