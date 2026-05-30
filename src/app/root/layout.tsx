import Link from "next/link";
import { Crown, LogOut } from "lucide-react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/root" className="inline-flex items-center gap-2 font-semibold text-slate-900">
            <Crown size={18} className="text-amber-600" />
            Kanal ERP · Root
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/" className="text-slate-600 hover:text-slate-900">
              ERP paneli
            </Link>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="inline-flex items-center gap-1 text-slate-600 hover:text-red-600"
              >
                <LogOut size={16} />
                Çıkış
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
