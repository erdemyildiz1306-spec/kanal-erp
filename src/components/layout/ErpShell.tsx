"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import MobileMoreSheet from "@/components/layout/MobileMoreSheet";
import OrderAutoSync from "@/components/layout/OrderAutoSync";
import OrderNotifyPoller from "@/components/layout/OrderNotifyPoller";
import FcmBootstrap from "@/components/layout/FcmBootstrap";

export default function ErpShell({ children }: { children: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setSessionReady(Boolean(d.success)))
      .catch(() => setSessionReady(false));
  }, []);

  return (
    <div className="flex h-[100dvh] overflow-hidden print:min-h-screen print:h-auto print:overflow-visible">
      <aside className="print:hidden hidden lg:flex h-full w-[13rem] xl:w-56 shrink-0">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="print:hidden shrink-0 sticky top-0 z-40">
          <Header />
        </div>
        <OrderAutoSync />
        <OrderNotifyPoller />
        <FcmBootstrap enabled={sessionReady} />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--erp-bg)] px-3 py-4 md:px-5 md:py-5 lg:px-6 lg:py-6 safe-pb-nav print:overflow-visible print:p-0 print:pb-0">
          {children}
        </main>
      </div>

      <MobileBottomNav onOpenMore={() => setMoreOpen(true)} />
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
