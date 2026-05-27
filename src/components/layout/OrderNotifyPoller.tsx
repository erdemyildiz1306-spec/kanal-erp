"use client";

import { useEffect, useRef } from "react";

const POLL_MS = 15_000;

type OrderEventRow = {
  id: string;
  title: string;
  body: string;
  url?: string;
  orderId?: string;
  createdAt?: string;
};

/** Yeni Trendyol siparişlerini poll eder; tarayıcı bildirimi + header yenileme. */
export default function OrderNotifyPoller() {
  const sinceRef = useRef(new Date().toISOString());
  const seenRef = useRef(new Set<string>());
  const busy = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const requestPermission = async () => {
      if (!("Notification" in window)) return;
      if (Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          /* kullanıcı reddetti */
        }
      }
    };
    void requestPermission();

    const poll = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const res = await fetch(
          `/api/order-events?since=${encodeURIComponent(sinceRef.current)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!data.success || !Array.isArray(data.events)) return;

        const fresh: OrderEventRow[] = [];
        for (const ev of data.events as OrderEventRow[]) {
          if (!ev?.id || seenRef.current.has(ev.id)) continue;
          seenRef.current.add(ev.id);
          fresh.push(ev);
        }

        if (fresh.length === 0) return;

        const newest = fresh[0]?.createdAt;
        if (newest) sinceRef.current = newest;

        window.dispatchEvent(new CustomEvent("erp-orders-synced"));
        window.dispatchEvent(
          new CustomEvent("erp-order-notify", { detail: { events: fresh } })
        );

        if ("Notification" in window && Notification.permission === "granted") {
          for (const ev of fresh.slice(0, 3)) {
            const n = new Notification(ev.title || "Yeni sipariş", {
              body: ev.body || "",
              tag: ev.id,
            });
            n.onclick = () => {
              window.focus();
              if (ev.url) window.location.href = ev.url;
              n.close();
            };
          }
        }

        const ids = fresh.map((e) => e.id).filter(Boolean);
        if (ids.length) {
          void fetch("/api/order-events", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
        }
      } catch {
        /* sessiz */
      } finally {
        busy.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
