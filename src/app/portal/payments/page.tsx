"use client";

import { useEffect, useState } from "react";
import { Wallet, Receipt } from "lucide-react";
import { fmtMoney } from "@/lib/portal-ui";

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
        <div className="erp-card p-5 border-l-4 border-l-red-400">
          <p className="text-sm erp-muted flex items-center gap-1">
            <Wallet size={14} /> Güncel borç
          </p>
          <p className="text-3xl font-black mt-1 tabular-nums text-[var(--erp-text)]">{fmtMoney(balance)}</p>
        </div>
        <div className="erp-card p-5 border-l-4 border-l-emerald-500">
          <p className="text-sm erp-muted flex items-center gap-1">
            <Receipt size={14} /> Toplam tahsilat
          </p>
          <p className="text-3xl font-black mt-1 tabular-nums text-emerald-700 dark:text-emerald-300">
            {fmtMoney(totalPaid)}
          </p>
        </div>
      </div>

      <div className="erp-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--erp-border)] font-bold text-[var(--erp-text)]">
          Tahsilat geçmişi
        </div>
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-[var(--erp-surface-2)]" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <p className="p-6 erp-muted text-sm">Kayıtlı ödeme yok.</p>
        ) : (
          <ul className="divide-y divide-[var(--erp-border)]">
            {payments.map((p, i) => (
              <li
                key={i}
                className="px-4 py-3.5 flex justify-between items-center text-sm hover:bg-[var(--erp-surface-2)]"
              >
                <div>
                  <p className="font-medium text-[var(--erp-text)]">{p.description || "Tahsilat"}</p>
                  {p.createdAt ? (
                    <p className="text-xs erp-muted mt-0.5">
                      {new Date(p.createdAt).toLocaleString("tr-TR")}
                    </p>
                  ) : null}
                </div>
                <span className="font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {fmtMoney(Number(p.amount) || 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
