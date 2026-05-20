"use client";

import { useEffect, useState } from "react";
import { Wallet, Receipt } from "lucide-react";

function fmt(n: number) {
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PortalPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<
    Array<{ amount: number; description?: string; createdAt?: string }>
  >([]);
  const [balance, setBalance] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    void fetch("/api/portal/summary")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setPayments(d.payments ?? []);
          setBalance(Number(d.summary?.balance) || 0);
          setTotalPaid(Number(d.summary?.totalPayments) || 0);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-rose-500/30 to-orange-500/20 border border-white/15 p-5">
          <p className="text-violet-200 text-sm flex items-center gap-1">
            <Wallet size={14} /> Güncel borç
          </p>
          <p className="text-3xl font-black mt-1 tabular-nums">{fmt(balance)}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500/30 to-teal-500/20 border border-white/15 p-5">
          <p className="text-violet-200 text-sm flex items-center gap-1">
            <Receipt size={14} /> Toplam tahsilat
          </p>
          <p className="text-3xl font-black mt-1 tabular-nums text-emerald-100">{fmt(totalPaid)}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 font-bold">Tahsilat geçmişi</div>
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-white/10" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <p className="p-6 text-violet-200 text-sm">Kayıtlı ödeme yok.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {payments.map((p, i) => (
              <li key={i} className="px-4 py-3.5 flex justify-between items-center text-sm hover:bg-white/5">
                <div>
                  <p className="font-medium">{p.description || "Tahsilat"}</p>
                  {p.createdAt ? (
                    <p className="text-xs text-violet-300 mt-0.5">
                      {new Date(p.createdAt).toLocaleString("tr-TR")}
                    </p>
                  ) : null}
                </div>
                <span className="font-bold text-emerald-300 tabular-nums">{fmt(Number(p.amount) || 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
