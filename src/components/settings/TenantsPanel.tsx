"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, LogIn, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/ToastProvider";

type TenantRow = {
  tenantId: string;
  name: string;
  slug: string;
  active?: boolean;
};

export default function TenantsPanel() {
  const toast = useToast();
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState("default");
  const [isRoot, setIsRoot] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/tenants?t=" + Date.now(), {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json();
    if (data.success) {
      setTenants(Array.isArray(data.tenants) ? data.tenants : []);
      if (data.currentTenantId) setCurrentTenantId(String(data.currentTenantId));
      setIsRoot(Boolean(data.isRoot));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Kuruluş adı girin.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Kuruluş oluşturulamadı.");
        return;
      }
      toast.success(`Kuruluş oluşturuldu: ${data.tenant?.name ?? trimmed}`);
      setName("");
      await load();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  };

  const switchTenant = async (tenantId: string) => {
    if (tenantId === currentTenantId) return;
    setSwitching(tenantId);
    try {
      const res = await fetch("/api/root/impersonate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Kuruluşa geçilemedi.");
        return;
      }
      toast.success(`${tenantId} kuruluşuna geçildi.`);
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSwitching(null);
    }
  };

  const current = tenants.find((t) => t.tenantId === currentTenantId);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-sky-100 text-sky-700">
          <Building2 size={20} />
        </div>
        <div>
          <h4 className="font-semibold text-slate-900">Kuruluş</h4>
          <p className="text-xs text-slate-500 mt-1">
            {isRoot
              ? "Platform yöneticisi olarak tüm kuruluşları görebilir ve geçiş yapabilirsiniz."
              : "Oturumunuz bu kuruluşa bağlıdır. Paket ve lisans bilgileri kuruluş bazındadır."}
          </p>
          {current ? (
            <p className="text-sm font-medium text-slate-800 mt-2">
              {current.name}{" "}
              <span className="text-xs font-mono text-slate-500">({currentTenantId})</span>
            </p>
          ) : (
            <p className="text-sm font-mono text-slate-600 mt-2">{currentTenantId}</p>
          )}
        </div>
      </div>

      {isRoot && tenants.length > 1 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {tenants.map((t) => (
            <li
              key={t.tenantId}
              className="px-3 py-2.5 text-sm flex justify-between items-center gap-2"
            >
              <span>
                <span className="font-medium text-slate-900">{t.name}</span>
                <span className="block text-xs text-slate-500 font-mono">{t.tenantId}</span>
              </span>
              {t.tenantId === currentTenantId ? (
                <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Aktif
                </span>
              ) : (
                <button
                  type="button"
                  disabled={switching === t.tenantId}
                  onClick={() => void switchTenant(t.tenantId)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sky-200 text-sky-800 text-xs font-semibold hover:bg-sky-50 disabled:opacity-50"
                >
                  <LogIn size={12} />
                  {switching === t.tenantId ? "Geçiliyor…" : "Geç"}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {isRoot ? (
        <div className="flex flex-col sm:flex-row gap-2 border-t border-slate-100 pt-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Yeni kuruluş adı"
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg outline-none text-sm"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void create()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50"
          >
            <Plus size={16} />
            {saving ? "Oluşturuluyor…" : "Kuruluş ekle"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
