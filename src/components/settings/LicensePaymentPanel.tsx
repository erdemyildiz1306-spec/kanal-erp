"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle, Clock, CreditCard, Sparkles } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";

type BankInfo = {
  bankName: string;
  accountHolder: string;
  iban: string;
  description: string;
  configured: boolean;
};

type LicensePackage = {
  key: "standard" | "efatura";
  name: string;
  shortName: string;
  description: string;
  includesEfaturam: boolean;
  monthlyAmount: number;
  yearlyAmount: number;
};

type LicenseInfo = {
  plan: string;
  packageKey: string;
  expiresAt: string | null;
  suspended: boolean;
  expired: boolean;
  isTrial: boolean;
  trialDaysRemaining: number | null;
};

type PaymentRequest = {
  _id: string;
  packageKey?: string;
  plan: string;
  amount: number;
  status: string;
  createdAt: string;
  reviewNote?: string;
};

const PACKAGE_LABELS: Record<string, string> = {
  standard: "Standart",
  efatura: "E-Faturam",
};

export default function LicensePaymentPanel() {
  const toast = useToast();
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [packages, setPackages] = useState<LicensePackage[]>([]);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [packageKey, setPackageKey] = useState<"standard" | "efatura">("standard");
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [senderName, setSenderName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [bRes, rRes] = await Promise.all([
      fetch("/api/license/bank-info", { credentials: "include", cache: "no-store" }),
      fetch("/api/license/payment-request", { credentials: "include", cache: "no-store" }),
    ]);
    const bData = await bRes.json();
    const rData = await rRes.json();
    if (bData.success) {
      setBank(bData.bank);
      setLicense(bData.license);
      setPackages(Array.isArray(bData.packages) ? bData.packages : []);
    }
    if (rData.success) setRequests(Array.isArray(rData.requests) ? rData.requests : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPackage = packages.find((p) => p.key === packageKey);
  const amount =
    selectedPackage && plan === "yearly"
      ? selectedPackage.yearlyAmount
      : selectedPackage?.monthlyAmount ?? 0;

  const submit = async () => {
    if (!senderName.trim() || !transferReference.trim()) {
      toast.error("Gönderen adı ve havale referansı zorunlu.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/license/payment-request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageKey, plan, senderName, transferReference, note }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Bildirim gönderilemedi.");
        return;
      }
      toast.success("Ödeme bildiriminiz alındı. Onay sonrası lisansınız aktifleşir.");
      setTransferReference("");
      setNote("");
      await load();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  };

  if (!bank) return null;

  const pending = requests.find((r) => r.status === "pending");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
          <CreditCard size={20} />
        </div>
        <div>
          <h4 className="font-semibold text-slate-900">Lisans &amp; paketler</h4>
          <p className="text-xs text-slate-500 mt-1">
            Yeni üyelikte 14 gün tüm özellikler açık deneme. Devam etmek için paket seçip havale
            bildirimi gönderin.
          </p>
          {license?.isTrial && license.trialDaysRemaining != null ? (
            <p className="text-xs text-indigo-700 font-semibold mt-1 flex items-center gap-1">
              <Sparkles size={14} />
              Deneme: {license.trialDaysRemaining} gün kaldı (tüm modüller açık)
            </p>
          ) : license?.expired || license?.suspended ? (
            <p className="text-xs text-red-600 font-semibold mt-1">
              Lisansınız {license.suspended ? "askıda" : "süresi dolmuş"}.
            </p>
          ) : license?.expiresAt ? (
            <p className="text-xs text-slate-600 mt-1">
              Paket: {PACKAGE_LABELS[license.packageKey] ?? license.packageKey} · Bitiş:{" "}
              {new Date(license.expiresAt).toLocaleDateString("tr-TR")}
            </p>
          ) : null}
        </div>
      </div>

      {bank.configured ? (
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1.5 font-mono">
          <p>
            <span className="text-slate-500">Banka:</span> {bank.bankName}
          </p>
          <p>
            <span className="text-slate-500">Alıcı:</span> {bank.accountHolder}
          </p>
          <p>
            <span className="text-slate-500">IBAN:</span> {bank.iban}
          </p>
          <p>
            <span className="text-slate-500">Açıklama:</span> {bank.description}
          </p>
        </div>
      ) : (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Platform banka bilgileri henüz tanımlı değil. Yöneticinize başvurun.
        </p>
      )}

      {pending ? (
        <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <Clock size={16} />
          Bekleyen ödeme bildiriminiz var (
          {PACKAGE_LABELS[pending.packageKey ?? ""] ?? pending.packageKey} · {pending.plan} ·{" "}
          {pending.amount} TL).
        </div>
      ) : bank.configured && packages.length > 0 ? (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Paket seçin</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {packages.map((pkg) => (
                <button
                  key={pkg.key}
                  type="button"
                  onClick={() => setPackageKey(pkg.key)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    packageKey === pkg.key
                      ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p className="font-semibold text-sm text-slate-900">{pkg.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{pkg.description}</p>
                  <p className="text-xs font-medium text-emerald-700 mt-2">
                    {pkg.monthlyAmount} TL/ay · {pkg.yearlyAmount} TL/yıl
                  </p>
                  {pkg.includesEfaturam ? (
                    <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                      E-Faturam dahil
                    </span>
                  ) : (
                    <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      E-Faturam yok
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Ödeme dönemi</p>
            <div className="flex gap-2">
              {(["monthly", "yearly"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlan(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    plan === p
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  {p === "monthly" ? "Aylık" : "Yıllık"}
                  {amount > 0 ? ` — ${amount} TL` : ""}
                </button>
              ))}
            </div>
          </div>

          <input
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Gönderen adı (hesap sahibi)"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <input
            type="text"
            value={transferReference}
            onChange={(e) => setTransferReference(e.target.value)}
            placeholder="Havale referans / dekont no"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Not (opsiyonel)"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            Ödeme yaptım — bildir ({amount} TL)
          </button>
        </div>
      ) : null}

      {requests.length > 0 ? (
        <ul className="text-xs text-slate-600 space-y-1 border-t border-slate-100 pt-3">
          {requests.slice(0, 5).map((r) => (
            <li key={r._id} className="flex items-center gap-2">
              {r.status === "approved" ? (
                <CheckCircle size={14} className="text-emerald-600" />
              ) : r.status === "pending" ? (
                <Clock size={14} className="text-amber-600" />
              ) : (
                <Building2 size={14} className="text-slate-400" />
              )}
              {new Date(r.createdAt).toLocaleDateString("tr-TR")} —{" "}
              {PACKAGE_LABELS[r.packageKey ?? ""] ?? r.packageKey ?? "—"} · {r.plan} — {r.status}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
