"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import MobileMoreSheet from "@/components/layout/MobileMoreSheet";
import OrderAutoSync from "@/components/layout/OrderAutoSync";
import OrderNotifyPoller from "@/components/layout/OrderNotifyPoller";

export default function ErpShell({ children }: { children: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] overflow-hidden print:min-h-screen print:h-auto print:overflow-visible">
      <aside className="print:hidden hidden lg:flex h-full w-64 shrink-0">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="print:hidden shrink-0 sticky top-0 z-40">
          <Header />
        </div>
        <OrderAutoSync />
        <OrderNotifyPoller />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--erp-bg)] px-4 py-4 md:px-6 md:py-6 lg:p-8 safe-pb-nav print:overflow-visible print:p-0 print:pb-0">
          {children}
        </main>
      </div>

      <MobileBottomNav onOpenMore={() => setMoreOpen(true)} />
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
