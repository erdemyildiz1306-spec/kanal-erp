"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Crown,
  LogIn,
  Plus,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";
import {
  INTEGRATION_MODULE_LABELS,
  type IntegrationModuleKey,
} from "@/lib/integration-modules";

type TenantLicense = {
  plan: string;
  expiresAt: string | null;
  modules: Record<IntegrationModuleKey, boolean>;
  suspended: boolean;
  notes: string;
};

type TenantRow = {
  tenantId: string;
  name: string;
  slug: string;
  active?: boolean;
  userCount?: number;
  licenseExpired?: boolean;
  license: TenantLicense;
};

type Stats = {
  tenantCount: number;
  userCount: number;
  orderCount: number;
  productCount: number;
  expiredLicenses: number;
  suspendedLicenses: number;
  activeTenants: number;
};

const MODULE_KEYS = Object.keys(INTEGRATION_MODULE_LABELS) as IntegrationModuleKey[];

type PaymentRequestRow = {
  _id: string;
  tenantId: string;
  tenantName?: string;
  packageKey?: string;
  packageLabel?: string;
  plan: string;
  amount: number;
  senderName: string;
  transferReference: string;
  note?: string;
  status: string;
  createdAt: string;
};

type PlatformBank = {
  bankName: string;
  accountHolder: string;
  iban: string;
  configured: boolean;
};

export default function RootPanel() {
  const toast = useToast();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestRow[]>([]);
  const [platformBank, setPlatformBank] = useState<PlatformBank | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, sRes, pRes] = await Promise.all([
        fetch("/api/root/tenants?t=" + Date.now(), { credentials: "include", cache: "no-store" }),
        fetch("/api/root/stats?t=" + Date.now(), { credentials: "include", cache: "no-store" }),
        fetch("/api/root/payment-requests?status=pending", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const tData = await tRes.json();
      const sData = await sRes.json();
      const pData = await pRes.json();
      if (tData.success) setTenants(Array.isArray(tData.tenants) ? tData.tenants : []);
      if (sData.success) setStats(sData.stats ?? null);
      if (pData.success) {
        setPaymentRequests(Array.isArray(pData.requests) ? pData.requests : []);
        setPlatformBank(pData.bank ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createTenant = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Kuruluş adı girin.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/root/tenants", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, plan: "trial" }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Oluşturulamadı.");
        return;
      }
      toast.success(`Kuruluş oluşturuldu: ${trimmed}`);
      setName("");
      await load();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  };

  const patchTenant = async (tenantId: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/root/tenants/${encodeURIComponent(tenantId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Güncellenemedi.");
      return false;
    }
    await load();
    return true;
  };

  const extendLicense = async (tenantId: string, plan: "trial" | "monthly" | "yearly") => {
    setSaving(true);
    try {
      const ok = await patchTenant(tenantId, { license: { extend: true, plan } });
      if (ok) toast.success("Lisans uzatıldı.");
    } finally {
      setSaving(false);
    }
  };

  const toggleSuspended = async (tenant: TenantRow) => {
    setSaving(true);
    try {
      await patchTenant(tenant.tenantId, {
        license: { suspended: !tenant.license.suspended },
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = async (tenant: TenantRow, key: IntegrationModuleKey) => {
    const next = !tenant.license.modules[key];
    setSaving(true);
    try {
      await patchTenant(tenant.tenantId, {
        license: { modules: { [key]: next } },
      });
    } finally {
      setSaving(false);
    }
  };

  const impersonate = async (tenantId: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/root/impersonate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Impersonation başarısız.");
        return;
      }
      window.location.href = data.redirect || "/";
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  };

  const reviewPayment = async (id: string, action: "approve" | "reject") => {
    setSaving(true);
    try {
      const res = await fetch("/api/root/payment-requests", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "İşlem başarısız.");
        return;
      }
      toast.success(action === "approve" ? "Ödeme onaylandı, lisans uzatıldı." : "Bildirim reddedildi.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
            <Crown size={14} />
            Platform Yönetimi
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Root Panel</h1>
          <p className="text-sm text-slate-500 mt-1">
            Kuruluşlar, lisanslar, modül erişimi ve impersonation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </header>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Kuruluş", value: stats.tenantCount, icon: Building2 },
            { label: "Kullanıcı", value: stats.userCount, icon: Users },
            { label: "Süresi dolmuş lisans", value: stats.expiredLicenses, icon: Shield },
            { label: "Askıda lisans", value: stats.suspendedLicenses, icon: Shield },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase">
                <Icon size={14} />
                {label}
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {platformBank?.configured ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm space-y-1 font-mono">
          <h2 className="font-semibold text-slate-900 font-sans mb-2">Platform IBAN (müşterilere gösterilen)</h2>
          <p>Banka: {platformBank.bankName}</p>
          <p>Alıcı: {platformBank.accountHolder}</p>
          <p>IBAN: {platformBank.iban}</p>
        </section>
      ) : null}

      {paymentRequests.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <h2 className="font-semibold text-slate-900">Bekleyen ödeme bildirimleri</h2>
          {paymentRequests.map((p) => (
            <article
              key={p._id}
              className="rounded-lg border border-amber-100 bg-white p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div className="text-sm">
                <p className="font-medium">{p.tenantName ?? p.tenantId}</p>
                <p className="text-xs text-slate-500">
                  {p.packageLabel ?? p.packageKey ?? "Paket"} · {p.plan === "yearly" ? "yıllık" : "aylık"} · {p.amount} TL · {p.senderName} · ref: {p.transferReference}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void reviewPayment(p._id, "approve")}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                >
                  Onayla
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void reviewPayment(p._id, "reject")}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold"
                >
                  Reddet
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Yeni kuruluş</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kuruluş adı"
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void createTenant()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50"
          >
            <Plus size={16} />
            Ekle
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {tenants.map((t) => (
          <article
            key={t.tenantId}
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">{t.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{t.tenantId}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Plan: <span className="font-medium">{t.license.plan}</span>
                  {t.license.expiresAt ? (
                    <>
                      {" "}
                      · Bitiş:{" "}
                      <span
                        className={
                          t.licenseExpired ? "text-red-600 font-semibold" : "text-slate-700"
                        }
                      >
                        {new Date(t.license.expiresAt).toLocaleDateString("tr-TR")}
                      </span>
                    </>
                  ) : (
                    " · Süresiz"
                  )}
                  {t.license.suspended ? (
                    <span className="ml-2 text-red-600 font-bold uppercase text-[10px]">
                      Askıda
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-400 mt-1">{t.userCount ?? 0} kullanıcı</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void extendLicense(t.tenantId, "monthly")}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  +1 ay
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void extendLicense(t.tenantId, "yearly")}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
                >
                  +1 yıl
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void toggleSuspended(t)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                >
                  {t.license.suspended ? "Askıyı kaldır" : "Askıya al"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void impersonate(t.tenantId)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  <LogIn size={14} />
                  ERP&apos;ye gir
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MODULE_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50"
                >
                  <span className="text-slate-700">{INTEGRATION_MODULE_LABELS[key]}</span>
                  <input
                    type="checkbox"
                    checked={t.license.modules[key] !== false}
                    disabled={saving}
                    onChange={() => void toggleModule(t, key)}
                    className="w-4 h-4"
                  />
                </label>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
