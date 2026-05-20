import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import OrderAutoSync from "@/components/layout/OrderAutoSync";

export default function ErpLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen overflow-hidden print:min-h-screen print:h-auto print:overflow-visible">
      <aside className="print:hidden flex h-full w-64 shrink-0">
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="print:hidden shrink-0">
          <Header />
        </div>
        <OrderAutoSync />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#f6f4f0] p-6 md:p-8 print:overflow-visible print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
