"use client";

import { useEffect, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";

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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">İşlem Günlüğü</h2>
          <p className="text-sm text-slate-500 mt-1">
            Sipariş, stok ve entegrasyon işlemlerinin kaydı.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-slate-500">Yükleniyor…</p>
        ) : logs.length === 0 ? (
          <p className="p-6 text-slate-500">Henüz kayıt yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
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
                  <tr key={row._id} className="border-t border-slate-100">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {row.createdAt
                        ? new Date(row.createdAt).toLocaleString("tr-TR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{row.module || "—"}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {row.action}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-md truncate">
                      {row.detail || "—"}
                    </td>
                    <td className="px-4 py-3">{row.userName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 flex items-center gap-1">
        <ClipboardList size={14} />
        Son 100 kayıt gösterilir.
      </p>
    </div>
  );
}
