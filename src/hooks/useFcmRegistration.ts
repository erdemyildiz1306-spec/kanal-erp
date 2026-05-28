"use client";

import { useEffect, useRef } from "react";

/**
 * Capacitor APK — FCM token kaydı (/api/fcm/register).
 * Web tarayıcıda OrderNotifyPoller polling kullanır; native push burada devreye girer.
 */
export function useFcmRegistration(enabled: boolean) {
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;

    const init = async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { PushNotifications } = await import("@capacitor/push-notifications");

        if (Capacitor.getPlatform() === "android") {
          await PushNotifications.createChannel({
            id: "erp_orders_v1",
            name: "Sipariş bildirimleri",
            description: "Yeni Trendyol siparişleri",
            importance: 5,
            visibility: 1,
            vibration: true,
            sound: "default",
          });
        }

        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== "granted") return;

        await PushNotifications.addListener("registration", async (ev) => {
          if (cancelled) return;
          tokenRef.current = ev.value;
          try {
            await fetch("/api/fcm/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                token: ev.value,
                platform: Capacitor.getPlatform(),
              }),
            });
          } catch {
            /* sessiz */
          }
        });

        await PushNotifications.addListener("registrationError", () => {
          /* google-services.json yoksa veya FCM yapılandırılmamışsa */
        });

        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const data = (action.notification?.data ?? {}) as Record<string, string>;
          const orderId = data.orderId || data.order_id;
          const url =
            data.url ||
            (orderId ? `/orders?orderId=${encodeURIComponent(orderId)}` : "/orders");
          window.location.href = url;
        });

        await PushNotifications.register();
      } catch {
        /* Capacitor push plugin yok veya native değil */
      }
    };

    void init();

    return () => {
      cancelled = true;
      void import("@capacitor/push-notifications")
        .then(({ PushNotifications }) => PushNotifications.removeAllListeners())
        .catch(() => {});
    };
  }, [enabled]);
}
