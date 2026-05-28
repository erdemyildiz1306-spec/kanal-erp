"use client";

import Link from "next/link";
import { FileText, ExternalLink, HelpCircle } from "lucide-react";

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

function FieldHelp({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
      {children}
    </p>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div>
        <h4 className="font-semibold text-slate-900">{title}</h4>
        {description ? <p className="text-sm text-slate-500 mt-1">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

const inputCls =
  "mt-1 w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500 text-sm";

export default function EfaturamSettingsPanel({
  values,
  hints,
  onChange,
  onTestConnection,
  testing,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-violet-100 text-violet-700 shrink-0">
            <HelpCircle size={20} />
          </div>
          <div className="space-y-2 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Trendyol E-Faturam nedir?</p>
            <p>
              <strong>Trendyol Satıcı API</strong> sipariş ve ürün içindir.{" "}
              <strong>E-Faturam</strong> ise yasal e-Arşiv / e-Fatura kesmek içindir — ayrı bir
              hizmet ve ayrı giriş bilgileri gerektirir.
            </p>
            <p>
              Siparişe fatura kestikten sonra Trendyol&apos;a{" "}
              <a
                href="https://developers.trendyol.com/docs/fatura-linki-gönderme-sendinvoicelink.md"
                target="_blank"
                rel="noreferrer"
                className="text-violet-700 underline inline-flex items-center gap-0.5"
              >
                fatura linki veya PDF
                <ExternalLink size={12} />
              </a>{" "}
              göndermeniz gerekir. Bu sayfadaki ayarlar otomatik kesim ve gönderim içindir.
            </p>
            <p className="text-xs text-slate-600">
              Resmi dokümantasyon:{" "}
              <a
                href="https://developers.trendyolefaturam.com/"
                target="_blank"
                rel="noreferrer"
                className="text-violet-700 underline"
              >
                developers.trendyolefaturam.com
              </a>
            </p>
            <Link
              href="/invoices/trendyol"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-800 hover:underline mt-1"
            >
              <FileText size={16} />
              Trendyol Fatura sayfasına git →
            </Link>
          </div>
        </div>
      </div>

      <SectionCard
        title="Genel"
        description="Otomatik e-Arşiv kesmeyi açın. İlk kurulumda test ortamını deneyebilirsiniz."
      >
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={values.efaturamEnabled === true}
            onChange={(e) => onChange({ efaturamEnabled: e.target.checked })}
          />
          <span>
            <span className="font-medium text-slate-800">E-Faturam ile otomatik fatura kes</span>
            <FieldHelp>
              Kapalıyken yalnızca «Trendyol Fatura» sayfasından manuel link veya PDF
              gönderebilirsiniz. Açıkken «E-Faturam» butonu API üzerinden e-Arşiv oluşturur.
            </FieldHelp>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={values.efaturamUseStage === true}
            onChange={(e) => onChange({ efaturamUseStage: e.target.checked })}
          />
          <span>
            <span className="font-medium text-slate-800">Test ortamı kullan</span>
            <FieldHelp>
              Gerçek fatura kesmeye başlamadan önce Trendyol&apos;un test sunucusunu
              (`stage-apigateway`) kullanın. Canlıya geçince bu kutuyu kapatın.
            </FieldHelp>
          </span>
        </label>
      </SectionCard>

      <SectionCard
        title="Partner (entegratör) bilgileri"
        description="Pazaryeri entegratörü olarak Trendyol E-Faturam API'sine bağlanmak için."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Partner ID
            </span>
            <input
              className={inputCls}
              value={values.efaturamPartnerId ?? ""}
              onChange={(e) => onChange({ efaturamPartnerId: e.target.value })}
              placeholder="Örn: 12345"
            />
            <FieldHelp>
              Trendyol E-Faturam entegrasyon başvurunuz onaylandığında Trendyol tarafından
              verilen sayısal partner kimliği.{" "}
              <a
                href="https://developers.trendyolefaturam.com/marketplace-docs"
                target="_blank"
                rel="noreferrer"
                className="text-violet-700 underline"
              >
                Pazaryeri entegratörü dokümantasyonu
              </a>{" "}
              ve Trendyol entegrasyon ekibinden alınır. Bireysel satıcı panelinde görünmez.
            </FieldHelp>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Partner kullanıcı adı
            </span>
            <input
              className={inputCls}
              value={values.efaturamPartnerUsername ?? ""}
              onChange={(e) => onChange({ efaturamPartnerUsername: e.target.value })}
              autoComplete="off"
            />
            <FieldHelp>E-Faturam entegratör API hesabınızın kullanıcı adı (signIn için).</FieldHelp>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Partner şifre{" "}
              {hints?.efaturamPartnerPasswordSaved ? (
                <span className="text-emerald-700 normal-case font-normal">— kaydedildi</span>
              ) : null}
            </span>
            <input
              type="password"
              className={inputCls}
              value={values.efaturamPartnerPassword ?? ""}
              onChange={(e) => onChange({ efaturamPartnerPassword: e.target.value })}
              placeholder={hints?.efaturamPartnerPasswordSaved ? "Değiştirmek için yazın" : ""}
            />
            <FieldHelp>
              Partner API şifresi. Güvenlik nedeniyle kayıttan sonra kutuda gösterilmez; değiştirmek
              için yeniden yazıp «Kaydet» deyin.
            </FieldHelp>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        title="Satıcı E-Faturam hesabı"
        description="Kendi şirketinizin Trendyol E-Faturam aboneliği — fatura kesmek için."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              E-Faturam giriş e-postası
            </span>
            <input
              type="email"
              className={inputCls}
              value={values.efaturamCustomerEmail ?? ""}
              onChange={(e) => onChange({ efaturamCustomerEmail: e.target.value })}
              placeholder="sizin@firma.com"
            />
            <FieldHelp>
              Trendyol E-Faturam satıcı paneline giriş yaptığınız e-posta. Trendyol Satıcı Paneli
              (sipariş/ürün) hesabından <strong>farklıdır</strong> — E-Faturam aboneliği ayrı
              açılır.
            </FieldHelp>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              E-Faturam şifre{" "}
              {hints?.efaturamCustomerPasswordSaved ? (
                <span className="text-emerald-700 normal-case font-normal">— kaydedildi</span>
              ) : null}
            </span>
            <input
              type="password"
              className={inputCls}
              value={values.efaturamCustomerPassword ?? ""}
              onChange={(e) => onChange({ efaturamCustomerPassword: e.target.value })}
            />
            <FieldHelp>
              Aynı E-Faturam panel şifresi. «Genel & Firma» sekmesindeki VKN/TCKN ile birlikte API
              oturumu açılır.
            </FieldHelp>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              companyId
            </span>
            <input
              className={inputCls}
              value={values.efaturamCompanyId ?? ""}
              onChange={(e) => onChange({ efaturamCompanyId: e.target.value })}
              placeholder="Boş bırakılabilir"
            />
            <FieldHelp>
              «Bağlantıyı test et» sonrası otomatik dolar. Manuel girmeniz genelde gerekmez.
            </FieldHelp>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">userId</span>
            <input
              className={inputCls}
              value={values.efaturamUserId ?? ""}
              onChange={(e) => onChange({ efaturamUserId: e.target.value })}
              placeholder="Boş bırakılabilir"
            />
            <FieldHelp>Test bağlantısı ile otomatik doldurulur.</FieldHelp>
          </label>
        </div>
        <button
          type="button"
          onClick={onTestConnection}
          disabled={testing}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {testing ? "Test ediliyor…" : "Bağlantıyı test et"}
        </button>
        <FieldHelp>
          Önce bilgileri kaydedin, sonra test edin. Başarılı olursa companyId / userId alanları
          dolar. Hata alırsanız partner bilgilerini ve «Genel & Firma» VKN&apos;yi kontrol edin.
        </FieldHelp>
      </SectionCard>

      <SectionCard
        title="Fatura serisi ve şablon"
        description="GİB fatura numarası ve görünüm ayarları."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Fatura öneki (3 karakter)
            </span>
            <input
              className={`${inputCls} uppercase font-mono`}
              maxLength={3}
              value={values.efaturamInvoicePrefix ?? "ERP"}
              onChange={(e) => onChange({ efaturamInvoicePrefix: e.target.value.toUpperCase() })}
              placeholder="ERP"
            />
            <FieldHelp>
              GİB&apos;te tanımlı fatura serinizin ilk 3 harfi/rakamı. Trendyol&apos;a giden fatura
              numarası örneği: <span className="font-mono">ERP2026000000001</span> (3 + yıl + 9
              rakam).
            </FieldHelp>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              KDV oranı (%)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              className={inputCls}
              value={values.efaturamDefaultVatRate ?? 20}
              onChange={(e) =>
                onChange({ efaturamDefaultVatRate: Number(e.target.value) || 20 })
              }
            />
            <FieldHelp>Sipariş satırlarında KDV oranı belirtilmemişse bu değer kullanılır.</FieldHelp>
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            XSLT / fatura görünüm kodu (opsiyonel)
          </span>
          <input
            className={inputCls}
            value={values.efaturamXsltCode ?? ""}
            onChange={(e) => onChange({ efaturamXsltCode: e.target.value })}
            placeholder="E-Faturam panelinizdeki şablon kodu"
          />
          <FieldHelp>
            E-Faturam hesabınızda tanımlı fatura tasarım kodu. Boş bırakılırsa varsayılan şablon
            kullanılır (hesabınıza göre değişir).
          </FieldHelp>
        </label>
      </SectionCard>

      <SectionCard
        title="Fatura linki — Trendyol'a gönderim"
        description="Otomatik e-Arşiv sonrası Trendyol sendInvoiceLink API'sine iletilecek HTTPS adres."
      >
        <label className="block text-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Fatura link şablonu
          </span>
          <input
            className={`${inputCls} font-mono text-xs`}
            value={values.efaturamInvoiceLinkTemplate ?? ""}
            onChange={(e) => onChange({ efaturamInvoiceLinkTemplate: e.target.value })}
            placeholder="https://.../fatura/{uuid}"
          />
          <FieldHelp>
            <strong>Ne işe yarar?</strong> E-Arşiv kesildikten sonra müşterinin faturayı
            internetten açtığı kalıcı HTTPS adres. Trendyol bu linki müşteriye iletir; link{" "}
            <strong>en az 10 yıl erişilebilir</strong> olmalıdır.
            <br />
            <br />
            <strong>Nereden bulunur?</strong> E-Faturam panelinde kesilmiş bir faturayı açıp
            «paylaş / görüntüle» linkini kopyalayın ve sabit kısmına bakın. Veya Trendyol E-Faturam
            destek / entegrasyon dokümanındaki public URL formatını kullanın.
            <br />
            <br />
            <strong>Şablonda yer tutucular:</strong>{" "}
            <span className="font-mono">{`{uuid}`}</span> fatura UUID,{" "}
            <span className="font-mono">{`{invoiceNumber}`}</span> fatura no,{" "}
            <span className="font-mono">{`{invoiceId}`}</span> sistem ID — ERP kesim sonrası otomatik
            yerleştirir.
            <br />
            <br />
            <strong>Örnek:</strong>{" "}
            <span className="font-mono break-all">
              https://efaturam.example.com/arsiv/{`{uuid}`}
            </span>
            <br />
            <br />
            Şablonu bilmiyorsanız otomatik E-Faturam yerine «Trendyol Fatura» sayfasında{" "}
            <strong>Link</strong> veya <strong>PDF</strong> ile manuel gönderim yapabilirsiniz.
          </FieldHelp>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={values.efaturamAutoMarkInvoiced !== false}
            onChange={(e) => onChange({ efaturamAutoMarkInvoiced: e.target.checked })}
          />
          <span>
            <span className="font-medium text-slate-800">
              Fatura gönderilince Trendyol paketini «Invoiced» işaretle
            </span>
            <FieldHelp>
              Trendyol sipariş API&apos;sine fatura kesildi bilgisini bildirir. Kapalıysa yalnızca
              fatura linki/dosyası gider; paket statüsünü siz güncellersiniz.
            </FieldHelp>
          </span>
        </label>
      </SectionCard>
    </div>
  );
}
