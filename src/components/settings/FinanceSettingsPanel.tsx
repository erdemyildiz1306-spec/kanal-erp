"use client";

import { DEFAULT_CARGO_TARIFF } from "@/lib/cargo-estimate";

export type FinanceSettingsForm = {
  financeDefaultCommissionPct: string;
  financeStopajRatePct: string;
  financeServiceFeePerOrder: string;
  financeDefaultDesi: string;
  financeDefaultCargoFee: string;
  cargoTariffText: string;
};

export function defaultFinanceSettingsForm(): FinanceSettingsForm {
  return {
    financeDefaultCommissionPct: "20",
    financeStopajRatePct: "1",
    financeServiceFeePerOrder: "0",
    financeDefaultDesi: "1",
    financeDefaultCargoFee: "0",
    cargoTariffText: DEFAULT_CARGO_TARIFF.map((t) => `${t.maxDesi}:${t.fee}`).join("\n"),
  };
}

export function financeSettingsFromApi(s: Record<string, unknown>): FinanceSettingsForm {
  const tiers = Array.isArray(s.cargoDesiTariff) ? s.cargoDesiTariff : DEFAULT_CARGO_TARIFF;
  return {
    financeDefaultCommissionPct: String(s.financeDefaultCommissionPct ?? 20),
    financeStopajRatePct: String(s.financeStopajRatePct ?? 1),
    financeServiceFeePerOrder: String(s.financeServiceFeePerOrder ?? 0),
    financeDefaultDesi: String(s.financeDefaultDesi ?? 1),
    financeDefaultCargoFee: String(s.financeDefaultCargoFee ?? 0),
    cargoTariffText: tiers
      .map((t: { maxDesi?: number; fee?: number }) => `${t.maxDesi}:${t.fee}`)
      .join("\n"),
  };
}

export function parseCargoTariffText(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [d, f] = line.split(/[:;,]/);
      return { maxDesi: Number(d), fee: Number(f) };
    })
    .filter((t) => Number.isFinite(t.maxDesi) && t.maxDesi > 0 && Number.isFinite(t.fee));
}

export function financeSettingsToPayload(form: FinanceSettingsForm) {
  return {
    financeDefaultCommissionPct: Number(form.financeDefaultCommissionPct.replace(",", ".")),
    financeStopajRatePct: Number(form.financeStopajRatePct.replace(",", ".")),
    financeServiceFeePerOrder: Number(form.financeServiceFeePerOrder.replace(",", ".")),
    financeDefaultDesi: Number(form.financeDefaultDesi.replace(",", ".")),
    financeDefaultCargoFee: Number(form.financeDefaultCargoFee.replace(",", ".")),
    cargoDesiTariff: parseCargoTariffText(form.cargoTariffText),
  };
}

export default function FinanceSettingsPanel({
  form,
  onChange,
}: {
  form: FinanceSettingsForm;
  onChange: (next: FinanceSettingsForm) => void;
}) {
  const fields: Array<{
    key: keyof FinanceSettingsForm;
    label: string;
    hint?: string;
  }> = [
    { key: "financeDefaultCommissionPct", label: "Varsayılan komisyon %", hint: "Simülatör ve tahminler" },
    { key: "financeStopajRatePct", label: "Stopaj %", hint: "Brüt satış üzerinden" },
    { key: "financeServiceFeePerOrder", label: "Hizmet bedeli (₺/sipariş)", hint: "Sabit tahmin" },
    { key: "financeDefaultDesi", label: "Varsayılan desi", hint: "Sabit kargo yoksa desi baremi" },
    { key: "financeDefaultCargoFee", label: "Varsayılan sabit kargo (₺/adet)", hint: "Ürün kargo fiyatı boşsa" },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h3 className="text-lg font-bold text-slate-900">Finans &amp; Kargo Tahmini</h3>
        <p className="text-sm text-slate-500">
          Öncelik: gerçek kargo faturası → ürün sabit kargo → ayar varsayılanı → desi baremi.
          Fatura gelince otomatik güncellenir.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(({ key, label, hint }) => (
          <div key={key} className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {label}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={form[key]}
              onChange={(e) => onChange({ ...form, [key]: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Desi kargo tarifesi
        </label>
        <p className="text-xs text-slate-500 mb-2">
          Her satır: <code className="bg-slate-100 px-1 rounded">maxDesi:ücret</code> (KDV dahil ₺)
        </p>
        <textarea
          rows={8}
          value={form.cargoTariffText}
          onChange={(e) => onChange({ ...form, cargoTariffText: e.target.value })}
          className="w-full px-4 py-3 border border-slate-200 rounded-lg font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
    </div>
  );
}
