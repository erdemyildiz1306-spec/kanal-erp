"use client";

type EfaturamFields = {
  efaturamEnabled?: boolean;
  efaturamUseStage?: boolean;
  efaturamPartnerId?: string;
  efaturamPartnerUsername?: string;
  efaturamPartnerPassword?: string;
  efaturamCustomerEmail?: string;
  efaturamCustomerPassword?: string;
  efaturamCompanyId?: string;
  efaturamUserId?: string;
  efaturamInvoicePrefix?: string;
  efaturamXsltCode?: string;
  efaturamInvoiceLinkTemplate?: string;
  efaturamDefaultVatRate?: number;
  efaturamAutoMarkInvoiced?: boolean;
};

type Props = {
  values: EfaturamFields;
  hints?: {
    efaturamPartnerPasswordSaved?: boolean;
    efaturamCustomerPasswordSaved?: boolean;
  };
  onChange: (patch: Partial<EfaturamFields>) => void;
  onTestConnection: () => void;
  testing: boolean;
};

export default function EfaturamSettingsPanel({
  values,
  hints,
  onChange,
  onTestConnection,
  testing,
}: Props) {
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-4">
      <div>
        <h4 className="font-semibold text-slate-900 text-sm">Trendyol E-Faturam</h4>
        <p className="text-xs text-slate-600 mt-1">
          E-Arşiv kesip Trendyol&apos;a fatura linki/dosyası göndermek için. API:{" "}
          <a
            href="https://developers.trendyolefaturam.com/"
            target="_blank"
            rel="noreferrer"
            className="text-orange-700 underline"
          >
            developers.trendyolefaturam.com
          </a>
          {" · "}
          <a
            href="https://developers.trendyol.com/reference/sendinvoicelink.md"
            target="_blank"
            rel="noreferrer"
            className="text-orange-700 underline"
          >
            sendInvoiceLink
          </a>
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.efaturamEnabled === true}
          onChange={(e) => onChange({ efaturamEnabled: e.target.checked })}
        />
        E-Faturam otomatik fatura kesmeyi etkinleştir
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.efaturamUseStage === true}
          onChange={(e) => onChange({ efaturamUseStage: e.target.checked })}
        />
        Test ortamı (stage-apigateway)
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-700">Partner ID</span>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={values.efaturamPartnerId ?? ""}
            onChange={(e) => onChange({ efaturamPartnerId: e.target.value })}
            placeholder="Trendyol E-Faturam partner ID"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">Fatura öneki (3 karakter)</span>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2 uppercase"
            maxLength={3}
            value={values.efaturamInvoicePrefix ?? "ERP"}
            onChange={(e) => onChange({ efaturamInvoicePrefix: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">Partner kullanıcı adı</span>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={values.efaturamPartnerUsername ?? ""}
            onChange={(e) => onChange({ efaturamPartnerUsername: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">
            Partner şifre {hints?.efaturamPartnerPasswordSaved ? "(kaydedildi)" : ""}
          </span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={values.efaturamPartnerPassword ?? ""}
            onChange={(e) => onChange({ efaturamPartnerPassword: e.target.value })}
            placeholder={hints?.efaturamPartnerPasswordSaved ? "Değiştirmek için yazın" : ""}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">Müşteri e-posta (E-Faturam hesabı)</span>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={values.efaturamCustomerEmail ?? ""}
            onChange={(e) => onChange({ efaturamCustomerEmail: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">
            Müşteri şifre {hints?.efaturamCustomerPasswordSaved ? "(kaydedildi)" : ""}
          </span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={values.efaturamCustomerPassword ?? ""}
            onChange={(e) => onChange({ efaturamCustomerPassword: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">companyId (opsiyonel — test ile dolar)</span>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={values.efaturamCompanyId ?? ""}
            onChange={(e) => onChange({ efaturamCompanyId: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">userId (opsiyonel)</span>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={values.efaturamUserId ?? ""}
            onChange={(e) => onChange({ efaturamUserId: e.target.value })}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-slate-700">XSLT kodu (opsiyonel)</span>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2"
          value={values.efaturamXsltCode ?? ""}
          onChange={(e) => onChange({ efaturamXsltCode: e.target.value })}
        />
      </label>

      <label className="block text-sm">
        <span className="text-slate-700">Fatura link şablonu (Trendyol sendInvoiceLink için)</span>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs"
          value={values.efaturamInvoiceLinkTemplate ?? ""}
          onChange={(e) => onChange({ efaturamInvoiceLinkTemplate: e.target.value })}
          placeholder="https://...?uuid={uuid}"
        />
        <span className="text-xs text-slate-500">
          Yer tutucular: {"{uuid}"}, {"{invoiceNumber}"}, {"{invoiceId}"}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.efaturamAutoMarkInvoiced !== false}
            onChange={(e) => onChange({ efaturamAutoMarkInvoiced: e.target.checked })}
          />
          Fatura gönderince Trendyol&apos;a Invoiced bildir
        </label>
        <label className="text-sm flex items-center gap-2">
          KDV %
          <input
            type="number"
            min={0}
            max={100}
            className="w-16 rounded border px-2 py-1"
            value={values.efaturamDefaultVatRate ?? 20}
            onChange={(e) =>
              onChange({ efaturamDefaultVatRate: Number(e.target.value) || 20 })
            }
          />
        </label>
        <button
          type="button"
          onClick={onTestConnection}
          disabled={testing}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {testing ? "Test ediliyor…" : "Bağlantıyı test et"}
        </button>
      </div>
    </div>
  );
}
