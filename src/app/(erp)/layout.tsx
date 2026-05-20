import Sidebar from "@/components/layout/Sidebar";
import ErpShell from "@/components/layout/ErpShell";

export default function ErpLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ErpShell>{children}</ErpShell>;
}
