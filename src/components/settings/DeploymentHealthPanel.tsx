"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

type Check = { id: string; label: string; ok: boolean; detail?: string };

type Report = {
  ok: boolean;
  checks: Check[];
  webhookUrlHint?: string;
  cronConfigured?: boolean;
};

export default function DeploymentHealthPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/validate?t=" + Date.now(), {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setReport({
          ok: Boolean(data.ok),
          checks: Array.isArray(data.checks) ? data.checks : [],
          webhookUrlHint: data.webhookUrlHint,
          cronConfigured: data.cronConfigured,
        });
      }
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-900">Canlı ortam kontrolü</h4>
          <p className="text-xs text-slate-500 mt-1">
            MongoDB, cron, webhook ve entegrasyon bilgilerinin doluluk durumu.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </div>

      {loading && !report ? (
        <p className="text-sm text-slate-500">Kontrol ediliyor…</p>
      ) : report ? (
        <>
          <div
            className={`rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 ${
              report.ok
                ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                : "bg-amber-50 text-amber-950 border border-amber-200"
            }`}
          >
            {report.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {report.ok
              ? "Tüm kontroller geçti — modüller açık ve bilgiler tam."
              : "Eksik veya hatalı ayar var — aşağıdaki maddeleri tamamlayın."}
          </div>
          <ul className="space-y-2">
            {report.checks.map((c) => (
              <li
                key={c.id}
                className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 border ${
                  c.ok
                    ? "border-emerald-100 bg-emerald-50/50"
                    : "border-amber-100 bg-amber-50/50"
                }`}
              >
                <span className={c.ok ? "text-emerald-600" : "text-amber-600"}>
                  {c.ok ? "✓" : "!"}
                </span>
                <span>
                  <span className="font-medium text-slate-800">{c.label}</span>
                  {c.detail ? (
                    <span className="block text-xs text-slate-500 mt-0.5">{c.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {report.webhookUrlHint ? (
            <p className="text-xs text-slate-600 break-all">
              <strong>Webhook URL:</strong>{" "}
              <code className="bg-slate-100 px-1 rounded">{report.webhookUrlHint}</code>
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-red-600">Kontrol yüklenemedi.</p>
      )}
    </section>
  );
}
