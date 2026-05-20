"use client";

import { useEffect, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Spinner from "@/components/ui/Spinner";
import MobileListCard from "@/components/ui/MobileListCard";

type LogRow = {
  _id: string;
  action: string;
  module?: string;
  detail?: string;
  userName?: string;
  createdAt?: string;
};

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity-log?limit=100");
      const data = await res.json();
      if (data.success) setLogs(data.logs ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="erp-page max-w-5xl mx-auto">
      <PageHeader
        title="İşlem Günlüğü"
        subtitle="Son 100 kayıt"
        action={
          <button type="button" onClick={() => void load()} className="erp-btn erp-btn-secondary text-sm">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            Yenile
          </button>
        }
      />

      {loading ? (
        <Spinner label="Kayıtlar yükleniyor…" />
      ) : logs.length === 0 ? (
        <p className="erp-muted text-center py-10">Henüz kayıt yok.</p>
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {logs.map((row) => (
              <MobileListCard
                key={row._id}
                title={row.action}
                subtitle={row.detail || undefined}
                meta={
                  <>
                    <span className="px-2 py-0.5 rounded-md bg-[var(--erp-surface-2)]">
                      {row.module || "genel"}
                    </span>
                    <span className="erp-muted">
                      {row.createdAt
                        ? new Date(row.createdAt).toLocaleString("tr-TR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </span>
                    {row.userName ? (
                      <span className="px-2 py-0.5 rounded-md bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]">
                        {row.userName}
                      </span>
                    ) : null}
                  </>
                }
              />
            ))}
          </div>
          <div className="hidden md:block erp-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--erp-surface-2)] erp-muted text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Tarih</th>
                    <th className="text-left px-4 py-3">Modül</th>
                    <th className="text-left px-4 py-3">İşlem</th>
                    <th className="text-left px-4 py-3">Detay</th>
                    <th className="text-left px-4 py-3">Kullanıcı</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row._id} className="border-t border-[var(--erp-border)]">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString("tr-TR") : "—"}
                      </td>
                      <td className="px-4 py-3">{row.module || "—"}</td>
                      <td className="px-4 py-3 font-medium">{row.action}</td>
                      <td className="px-4 py-3 max-w-md truncate">{row.detail || "—"}</td>
                      <td className="px-4 py-3">{row.userName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p className="text-xs erp-muted flex items-center gap-1">
        <ClipboardList size={14} />
        Son 100 kayıt gösterilir.
      </p>
    </div>
  );
}
