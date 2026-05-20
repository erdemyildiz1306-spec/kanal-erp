"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Save,
  Store,
  Link as LinkIcon,
  Printer,
  User,
  Key,
  Building2,
  Mail,
  Download,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Spinner from "@/components/ui/Spinner";
import MobileAccordion from "@/components/ui/MobileAccordion";
import { useToast } from "@/components/providers/ToastProvider";

type SettingsPayload = {
  trendyolSellerId?: string;
  trendyolApiKey?: string;
  trendyolApiSecret?: string;
  webApiUrl?: string;
  trendyolBrandId?: string;
  trendyolBrandName?: string;
  trendyolStockDeductAt?: string;
  trendyolWebhookSecret?: string;
  publicAppUrl?: string;
  webApiToken?: string;
  storeName?: string;
  printPackageContents?: boolean;
  companyLegalTitle?: string;
  companyTaxId?: string;
  companyTaxOffice?: string;
  companyAddress?: string;
  portalSupportPhone?: string;
  portalSupportEmail?: string;
  portalWhatsapp?: string;
};

type IntegrationHints = {
  trendyolSellerIdSaved: boolean;
  trendyolApiKeySaved: boolean;
  trendyolApiSecretSaved: boolean;
  webApiTokenSaved: boolean;
  trendyolBrandIdSaved?: boolean;
  trendyolBrandNameSaved?: boolean;
};

const PUBLIC_SETTINGS_STORAGE_KEY = "kanal-erp-settings-public-v1";

function emptyIntegrationDefaults(): SettingsPayload {
  return {
    trendyolSellerId: "",
    trendyolApiKey: "",
    trendyolApiSecret: "",
    webApiUrl: "",
    webApiToken: "",
    trendyolBrandId: "",
    trendyolBrandName: "",
    trendyolStockDeductAt: "processing",
    trendyolWebhookSecret: "",
    publicAppUrl: "",
    storeName: "",
    printPackageContents: true,
    companyLegalTitle: "",
    companyTaxId: "",
    companyTaxOffice: "",
    companyAddress: "",
    portalSupportPhone: "",
    portalSupportEmail: "",
    portalWhatsapp: "",
  };
}

/** Sırları asla yazma — ekranda tekrar gösterilen alanlar (localStorage kalıcı). */
function readPublicSettingsFromBrowser(): Partial<SettingsPayload> {
  if (typeof window === "undefined") return {};
  try {
    const raw =
      localStorage.getItem(PUBLIC_SETTINGS_STORAGE_KEY) ??
      sessionStorage.getItem(PUBLIC_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<SettingsPayload>;
    if (!localStorage.getItem(PUBLIC_SETTINGS_STORAGE_KEY)) {
      localStorage.setItem(PUBLIC_SETTINGS_STORAGE_KEY, raw);
      sessionStorage.removeItem(PUBLIC_SETTINGS_STORAGE_KEY);
    }
    return parsed;
  } catch {
    return {};
  }
}

function persistPublicSettings(p: SettingsPayload) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      PUBLIC_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        trendyolSellerId: String(p.trendyolSellerId ?? "").trim(),
        trendyolBrandId: String(p.trendyolBrandId ?? "").trim(),
        trendyolBrandName: String(p.trendyolBrandName ?? "").trim(),
        trendyolStockDeductAt: String(p.trendyolStockDeductAt ?? "processing").trim(),
        trendyolWebhookSecret: String(p.trendyolWebhookSecret ?? "").trim(),
        webApiUrl: String(p.webApiUrl ?? "").trim(),
        storeName: String(p.storeName ?? "").trim(),
        printPackageContents: Boolean(p.printPackageContents ?? true),
        companyLegalTitle: String(p.companyLegalTitle ?? "").trim(),
        companyTaxId: String(p.companyTaxId ?? "").trim(),
        companyTaxOffice: String(p.companyTaxOffice ?? "").trim(),
        companyAddress: String(p.companyAddress ?? "").trim(),
      })
    );
  } catch {
    /* ignore quota / privacy mode */
  }
}

type SavedPublicSettings = {
  trendyolSellerId?: string;
  trendyolBrandId?: number;
  trendyolBrandName?: string;
  trendyolStockDeductAt?: string;
  trendyolWebhookSecret?: string;
  publicAppUrl?: string;
  webApiUrl?: string;
  storeName?: string;
};

function brandPendingServerSave(
  integration: SettingsPayload,
  hints: IntegrationHints
): boolean {
  const hasFormBrand = Boolean(
    integration.trendyolBrandId?.trim() || integration.trendyolBrandName?.trim()
  );
  const savedOnServer = Boolean(
    hints.trendyolBrandIdSaved || hints.trendyolBrandNameSaved
  );
  return hasFormBrand && !savedOnServer;
}

function friendlyDatabaseError(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return `Sunucu yanıt kodu: ${raw}. Veritabanı veya API hatası olabilir; ağ sekmesinde yanıt gövdesini kontrol edin.`;
  }
  const msg =
    typeof raw === "string" ? raw : raw instanceof Error ? raw.message : "";
  const lower = msg.toLowerCase();
  if (
    lower.includes("econnrefused") ||
    lower.includes("127.0.0.1:27017") ||
    lower.includes("localhost:27017")
  ) {
    return "MongoDB’ye bağlanılamıyor (bilgisayarınızda doğrudan çalışan veritabanı kapalı veya adres yanlış). Projede .env.local içindeki MONGODB_URI’yi kontrol edin: yerel MongoDB kullanıyorsanız servisi başlatın; Atlas vb. kullanıyorsanız bulut bağlantı dizgesini yapıştırın.";
  }
  if (lower.includes("mongodb_uri")) {
    return msg;
  }
  return msg || "Veritabanına bağlanırken bir hata oluştu.";
}

export default function SettingsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("general");
  const [mobileOpenTab, setMobileOpenTab] = useState<string | null>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [hints, setHints] = useState<IntegrationHints>({
    trendyolSellerIdSaved: false,
    trendyolApiKeySaved: false,
    trendyolApiSecretSaved: false,
    webApiTokenSaved: false,
  });

  const [profileData, setProfileData] = useState({
    name: "",
    surname: "",
    email: "",
    password: "",
    currentPassword: "",
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [integration, setIntegration] = useState<SettingsPayload>(() => ({
    ...emptyIntegrationDefaults(),
    ...readPublicSettingsFromBrowser(),
    trendyolApiKey: "",
    trendyolApiSecret: "",
    webApiToken: "",
  }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, meRes] = await Promise.all([
        fetch("/api/settings?t=" + Date.now(), {
          cache: "no-store",
          credentials: "include",
        }),
        fetch("/api/auth/me", { cache: "no-store", credentials: "include" }),
      ]);
      const data = await res.json();
      const meData = await meRes.json().catch(() => ({ success: false }));
      if (meData.success && meData.user?.id) {
        setCurrentUserId(String(meData.user.id));
        const fullName = String(meData.user.name ?? "").trim();
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        setProfileData({
          name: nameParts[0] ?? "",
          surname: nameParts.slice(1).join(" "),
          email: String(meData.user.email ?? "").trim(),
          password: "",
          currentPassword: "",
        });
      }
      if (!res.ok || !data.success || !data.settings) {
        const serverMsg =
          typeof data.error === "string" && data.error.trim() !== ""
            ? data.error
            : res.statusText || "";
        setLoadError(friendlyDatabaseError(serverMsg || res.status));
        return;
      }
      setLoadError(null);
      const s = data.settings as Record<string, unknown>;
      const cached = readPublicSettingsFromBrowser();
      const sellerRaw = s.trendyolSellerId;
      const sellerFromApi =
        sellerRaw !== null &&
        sellerRaw !== undefined &&
        String(sellerRaw).trim() !== ""
          ? String(sellerRaw).trim()
          : "";
      const sellerStr =
        sellerFromApi || String(cached.trendyolSellerId ?? "").trim();
      const next: SettingsPayload = {
        trendyolSellerId: sellerStr,
        trendyolApiKey: "",
        trendyolApiSecret: "",
        webApiUrl: (s.webApiUrl as string) || cached.webApiUrl || "",
        webApiToken: "",
        storeName: (s.storeName as string) || cached.storeName || "",
        printPackageContents: Boolean(
          s.printPackageContents ?? cached.printPackageContents ?? true
        ),
        companyLegalTitle:
          (s.companyLegalTitle as string) || cached.companyLegalTitle || "",
        companyTaxId: (s.companyTaxId as string) || cached.companyTaxId || "",
        companyTaxOffice:
          (s.companyTaxOffice as string) || cached.companyTaxOffice || "",
        companyAddress:
          (s.companyAddress as string) || cached.companyAddress || "",
        portalSupportPhone: (s.portalSupportPhone as string) || "",
        portalSupportEmail: (s.portalSupportEmail as string) || "",
        portalWhatsapp: (s.portalWhatsapp as string) || "",
        trendyolBrandId:
          s.trendyolBrandId != null && Number(s.trendyolBrandId) > 0
            ? String(s.trendyolBrandId)
            : String(cached.trendyolBrandId ?? "").trim(),
        trendyolBrandName:
          (s.trendyolBrandName as string) || cached.trendyolBrandName || "",
        trendyolStockDeductAt:
          (s.trendyolStockDeductAt as string) ||
          cached.trendyolStockDeductAt ||
          "processing",
        trendyolWebhookSecret:
          (s.trendyolWebhookSecret as string) ||
          cached.trendyolWebhookSecret ||
          "",
        publicAppUrl:
          (s.publicAppUrl as string) || cached.publicAppUrl || "",
      };
      setIntegration(next);
      persistPublicSettings(next);
      const ih = data.integrationHints as IntegrationHints | undefined;
      if (ih) setHints(ih);
    } catch (e) {
      setLoadError(friendlyDatabaseError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveProfile = async (): Promise<string | null> => {
    if (!currentUserId) return null;
    const fullName = [profileData.name, profileData.surname]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    const email = profileData.email.trim().toLowerCase();
    const password = profileData.password.trim();
    const body: Record<string, string> = {};
    if (fullName) body.name = fullName;
    if (email) body.email = email;
    if (password) body.password = password;
    if (Object.keys(body).length === 0) return null;

    const userRes = await fetch(`/api/users/${currentUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const userData = await userRes.json().catch(() => ({}));
    if (!userRes.ok || !userData.success) {
      return typeof userData.error === "string"
        ? userData.error
        : "Giriş bilgileri güncellenemedi.";
    }
    if (password) {
      setProfileData((prev) => ({ ...prev, password: "" }));
    }
    return null;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === "general") {
        const profileError = await saveProfile();
        if (profileError) {
          alert(profileError);
          return;
        }
      }

      const brandIdRaw = String(integration.trendyolBrandId ?? "").trim();
      const brandNameRaw = String(integration.trendyolBrandName ?? "").trim();

      /** Boş string göndermez: sunucuda mevcut değeri koruma + merge */
      const payload: SettingsPayload = {
        webApiUrl: integration.webApiUrl,
        storeName: integration.storeName,
        printPackageContents: integration.printPackageContents,
        companyLegalTitle: integration.companyLegalTitle,
        companyTaxId: integration.companyTaxId,
        companyTaxOffice: integration.companyTaxOffice,
        companyAddress: integration.companyAddress,
        portalSupportPhone: integration.portalSupportPhone,
        portalSupportEmail: integration.portalSupportEmail,
        portalWhatsapp: integration.portalWhatsapp,
        trendyolBrandName: brandNameRaw,
        trendyolBrandId: brandIdRaw,
      };

      const sid = String(integration.trendyolSellerId ?? "").trim();
      if (sid !== "") payload.trendyolSellerId = sid;
      if (integration.trendyolApiKey?.trim())
        payload.trendyolApiKey = integration.trendyolApiKey.trim();
      if (integration.trendyolApiSecret?.trim())
        payload.trendyolApiSecret = integration.trendyolApiSecret.trim();
      if (integration.webApiToken?.trim())
        payload.webApiToken = integration.webApiToken.trim();
      if (integration.trendyolStockDeductAt?.trim())
        payload.trendyolStockDeductAt = integration.trendyolStockDeductAt.trim();
      if (integration.trendyolWebhookSecret?.trim())
        payload.trendyolWebhookSecret = integration.trendyolWebhookSecret.trim();
      if (integration.publicAppUrl?.trim())
        payload.publicAppUrl = integration.publicAppUrl.trim();

      const res = await fetch("/api/settings?t=" + Date.now(), {
        method: "PUT",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let data: {
        success?: boolean;
        error?: string;
        integrationHints?: IntegrationHints;
        saved?: SavedPublicSettings;
        brandResolvedFromName?: boolean;
        brandResolveWarning?: string;
      } = {};
      try {
        data = await res.json();
      } catch {
        alert(`Kayıt hatası: sunucu yanıtı okunamadı (HTTP ${res.status}).`);
        return;
      }
      if (!res.ok || !data.success) {
        alert(data.error || `Kayıt hatası (HTTP ${res.status}).`);
        return;
      }
      if (data.integrationHints) {
        setHints(data.integrationHints);
      }
      const saved = data.saved;
      setIntegration((prev) => {
        const next: SettingsPayload = {
          ...prev,
          trendyolApiKey: "",
          trendyolApiSecret: "",
          webApiToken: "",
        };
        if (saved?.trendyolSellerId) {
          next.trendyolSellerId = saved.trendyolSellerId;
        } else if (sid) {
          next.trendyolSellerId = sid;
        }
        if (saved?.trendyolBrandId && saved.trendyolBrandId > 0) {
          next.trendyolBrandId = String(saved.trendyolBrandId);
        } else if (brandIdRaw) {
          next.trendyolBrandId = brandIdRaw;
        }
        if (saved?.trendyolBrandName !== undefined) {
          next.trendyolBrandName = saved.trendyolBrandName;
        } else {
          next.trendyolBrandName = brandNameRaw;
        }
        if (saved?.trendyolStockDeductAt) {
          next.trendyolStockDeductAt = saved.trendyolStockDeductAt;
        }
          if (saved?.trendyolWebhookSecret) {
            next.trendyolWebhookSecret = saved.trendyolWebhookSecret;
          }
          if (saved?.publicAppUrl !== undefined) {
            next.publicAppUrl = saved.publicAppUrl;
          }
          if (saved?.webApiUrl !== undefined) next.webApiUrl = saved.webApiUrl;
        if (saved?.storeName !== undefined) next.storeName = saved.storeName;
        persistPublicSettings(next);
        return next;
      });
      await load();
      const hintsAfter = data.integrationHints;
      const brandOk =
        hintsAfter?.trendyolBrandIdSaved || hintsAfter?.trendyolBrandNameSaved;
      if (data.brandResolvedFromName) {
        alert(
          `Ayarlar kaydedildi. Marka adından Trendyol Marka ID otomatik bulundu (${saved?.trendyolBrandId ?? ""}).`
        );
      } else if (!brandOk && (brandIdRaw || brandNameRaw)) {
        alert(
          `Kayıt tamamlandı ama marka sunucuda görünmüyor.\n${data.brandResolveWarning || "Veritabanı bağlantısını kontrol edin ve sayfayı yenileyin."}`
        );
      } else if (data.brandResolveWarning) {
        alert(
          `Ayarlar kaydedildi, ancak marka ID otomatik bulunamadı:\n${data.brandResolveWarning}`
        );
      } else {
        toast.success(
          activeTab === "general"
            ? "Ayarlar ve giriş bilgileri kaydedildi"
            : "Ayarlar kaydedildi"
        );
      }
    } catch {
      alert("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "general", name: "Genel & Firma Ayarları", shortName: "Genel & Firma", subtitle: "Firma ve profil", icon: User, color: "text-blue-600 bg-blue-50" },
    { id: "trendyol", name: "Trendyol Entegrasyonu", shortName: "Trendyol", subtitle: "API anahtarları", icon: Store, color: "text-orange-600 bg-orange-50" },
    { id: "web", name: "Next.js Mağaza API", shortName: "Mağaza API", subtitle: "Web entegrasyonu", icon: LinkIcon, color: "text-indigo-600 bg-indigo-50" },
    { id: "print", name: "Etiket & Çıktı", shortName: "Etiket", subtitle: "Yazdırma", icon: Printer, color: "text-purple-600 bg-purple-50" },
  ];

  const toggleMobileTab = (id: string) => {
    setActiveTab(id);
    setMobileOpenTab((prev) => (prev === id ? null : id));
  };

  const saveBar = (tabId?: string) => (
    <div className="pt-6 mt-4 border-t border-[var(--erp-border)] flex flex-col sm:flex-row gap-3 justify-between">
      <button
        type="button"
        onClick={() => window.open("/api/backup", "_blank")}
        className="erp-btn erp-btn-secondary text-sm"
      >
        <Download size={18} />
        JSON Yedek İndir
      </button>
      <button
        type="button"
        onClick={() => {
          if (tabId) setActiveTab(tabId);
          void handleSave();
        }}
        disabled={saving || loading}
        className="erp-btn erp-btn-primary flex-1 sm:flex-none disabled:opacity-50"
      >
        <Save size={18} />
        {saving ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </div>
  );

  const settingsPanels = (
    <>
          {activeTab === "general" && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900">Genel &amp; Firma (fatura için)</h3>
                <p className="text-sm text-slate-500">
                  Bu bilgiler fatura / e-Arşiv entegrasyonuna temel oluşturur.
                </p>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticaret unvanı / firma adı</label>
                <div className="relative">
                  <input
                    type="text"
                    value={integration.companyLegalTitle}
                    onChange={(e) => setIntegration({ ...integration, companyLegalTitle: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                  />
                  <Building2 size={16} className="absolute left-3.5 top-3 text-slate-400" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vergi kimlik no (VKN/TCKN)</label>
                    <input
                      type="text"
                      value={integration.companyTaxId}
                      onChange={(e) =>
                        setIntegration({ ...integration, companyTaxId: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vergi dairesi</label>
                    <input
                      type="text"
                      value={integration.companyTaxOffice}
                      onChange={(e) =>
                        setIntegration({ ...integration, companyTaxOffice: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Adres</label>
                  <textarea
                    value={integration.companyAddress}
                    onChange={(e) =>
                      setIntegration({ ...integration, companyAddress: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 min-h-[96px]"
                  />
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-700">Müşteri portalı — destek iletişim</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input
                      type="text"
                      placeholder="Destek telefonu"
                      value={integration.portalSupportPhone ?? ""}
                      onChange={(e) =>
                        setIntegration({ ...integration, portalSupportPhone: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    />
                    <input
                      type="email"
                      placeholder="Destek e-posta"
                      value={integration.portalSupportEmail ?? ""}
                      onChange={(e) =>
                        setIntegration({ ...integration, portalSupportEmail: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="WhatsApp (905xxxxxxxxx)"
                      value={integration.portalWhatsapp ?? ""}
                      onChange={(e) =>
                        setIntegration({ ...integration, portalWhatsapp: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                    Bu bölüm <strong>giriş e-posta ve şifrenizi</strong> günceller. Değiştirdikten sonra alttaki
                    «Kaydet» ile sunucuya yazın; bir sonraki girişte yeni bilgiler geçerli olur.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5 relative">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">İsim</label>
                      <input
                        type="text"
                        value={profileData.name}
                        onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none"
                      />
                      <User size={16} className="absolute left-3.5 bottom-3 text-slate-400" />
                    </div>
                    <div className="space-y-1.5 relative">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Soyisim</label>
                      <input
                        type="text"
                        value={profileData.surname}
                        onChange={(e) =>
                          setProfileData({ ...profileData, surname: e.target.value })
                        }
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none"
                      />
                      <User size={16} className="absolute left-3.5 bottom-3 text-slate-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                    <div className="space-y-1.5 relative">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">E-posta</label>
                      <input
                        type="email"
                        value={profileData.email}
                        onChange={(e) =>
                          setProfileData({ ...profileData, email: e.target.value })
                        }
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none"
                      />
                      <Mail size={16} className="absolute left-3.5 bottom-3 text-slate-400" />
                    </div>
                    <div className="space-y-1.5 relative">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Yeni şifre (boş bırak = değişmez)</label>
                      <input
                        type="password"
                        value={profileData.password}
                        onChange={(e) =>
                          setProfileData({ ...profileData, password: e.target.value })
                        }
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none"
                      />
                      <Key size={16} className="absolute left-3.5 bottom-3 text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "trendyol" && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900">Trendyol Satıcı API</h3>
                <p className="text-sm text-slate-500">
                  Basic Auth için API Key / Secret. Anahtarlar güvenlik nedeniyle kutularda tekrar gösterilmez — değiştirmek için yeniden yazıp kaydedin.
                </p>
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
                  Sipariş/ürün çekme ile ürün yayımlama farklı API uçları kullanır; bilgiler aynı kalır. Yayımlama hatasında önce «Kategori Ağacını Eşitle» deyin, üründe beden/renk özniteliklerini doldurun.
                </p>
              </div>

              {loadError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
                  <p className="font-semibold">Veritabanı bağlantısı yok — kayıt çalışmaz</p>
                  <p className="mt-1">{loadError}</p>
                </div>
              ) : null}

              {(brandPendingServerSave(integration, hints) ||
                (hints.trendyolBrandNameSaved && !hints.trendyolBrandIdSaved)) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <p className="font-semibold">Marka sunucuya kaydedilmedi</p>
                  <p className="mt-1 text-amber-900/90">
                    {brandPendingServerSave(integration, hints)
                      ? "Marka alanı dolu görünüyor ama sunucuda kayıtlı değil. «Ayarları Kaydet» butonuna basın; yalnızca tarayıcı hafızası yayımlama için yeterli değildir."
                      : "Marka adı kayıtlı ama sayısal Marka ID yok. Marka ID alanına Trendyol’daki sayıyı yazın veya kaydedince otomatik aransın."}
                  </p>
                </div>
              )}

              {(hints.trendyolSellerIdSaved ||
                hints.trendyolApiKeySaved ||
                hints.trendyolApiSecretSaved ||
                hints.trendyolBrandIdSaved ||
                hints.trendyolBrandNameSaved) && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
                  <p className="font-semibold">Kayıtlı Trendyol bağlantısı</p>
                  <ul className="mt-2 space-y-1 text-emerald-900/90">
                    <li>
                      Satıcı ID:{" "}
                      <span className="font-mono font-medium">
                        {integration.trendyolSellerId?.trim() ||
                          (hints.trendyolSellerIdSaved ? "sunucuda kayıtlı" : "—")}
                      </span>
                    </li>
                    <li>
                      Marka ID:{" "}
                      {hints.trendyolBrandIdSaved ? (
                        <span className="font-mono font-medium">
                          {integration.trendyolBrandId?.trim() || "sunucuda kayıtlı"}
                        </span>
                      ) : (
                        "henüz girilmedi"
                      )}
                    </li>
                    <li>
                      Marka adı:{" "}
                      {hints.trendyolBrandNameSaved ? (
                        <span className="font-medium">
                          {integration.trendyolBrandName?.trim() || "kaydedildi ✓"}
                        </span>
                      ) : (
                        "henüz girilmedi"
                      )}
                    </li>
                    <li>
                      API Key:{" "}
                      {hints.trendyolApiKeySaved ? (
                        <span className="font-medium text-emerald-800">kaydedildi ✓</span>
                      ) : (
                        "henüz girilmedi"
                      )}
                    </li>
                    <li>
                      API Secret:{" "}
                      {hints.trendyolApiSecretSaved ? (
                        <span className="font-medium text-emerald-800">kaydedildi ✓</span>
                      ) : (
                        "henüz girilmedi"
                      )}
                    </li>
                  </ul>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Satıcı / tedarikçi ID
                  </label>
                  {hints.trendyolSellerIdSaved ? (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      Sunucuda kayıtlı
                    </span>
                  ) : null}
                </div>
                <input
                  type="text"
                  value={integration.trendyolSellerId}
                  onChange={(e) =>
                    setIntegration({ ...integration, trendyolSellerId: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 font-medium text-slate-800"
                  placeholder="Örn: Trendyol satıcı kodunuz"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    API Key
                  </label>
                  {hints.trendyolApiKeySaved ? (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      Kayıtlı
                    </span>
                  ) : null}
                </div>
                <input
                  type="password"
                  value={integration.trendyolApiKey}
                  onChange={(e) =>
                    setIntegration({ ...integration, trendyolApiKey: e.target.value })
                  }
                  placeholder="Yeni anahtarı buraya yazın"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    API Secret
                  </label>
                  {hints.trendyolApiSecretSaved ? (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      Kayıtlı
                    </span>
                  ) : null}
                </div>
                <input
                  type="password"
                  value={integration.trendyolApiSecret}
                  onChange={(e) =>
                    setIntegration({ ...integration, trendyolApiSecret: e.target.value })
                  }
                  placeholder="Yeni gizli anahtarı buraya yazın"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Marka ID (Trendyol)
                    </label>
                    {hints.trendyolBrandIdSaved ? (
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                        Kayıtlı
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    value={integration.trendyolBrandId ?? ""}
                    onChange={(e) =>
                      setIntegration({ ...integration, trendyolBrandId: e.target.value })
                    }
                    placeholder="Örn: 123456 (tercihen sayısal ID)"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Marka adı (ID yoksa aranır)
                    </label>
                    {hints.trendyolBrandNameSaved ? (
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                        Kayıtlı
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    value={integration.trendyolBrandName ?? ""}
                    onChange={(e) =>
                      setIntegration({ ...integration, trendyolBrandName: e.target.value })
                    }
                    placeholder="Marka adınız"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Yayımlama adresi (HTTPS) — Trendyol görselleri
                </label>
                <input
                  type="url"
                  value={integration.publicAppUrl ?? ""}
                  onChange={(e) =>
                    setIntegration({ ...integration, publicAppUrl: e.target.value })
                  }
                  placeholder="https://sizin-app.up.railway.app"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
                />
                <p className="text-xs text-slate-500">
                  Yerel bilgisayarda yüklenen görseller Trendyol&apos;a gitmez. Canlı mağaza /
                  Railway HTTPS adresinizi yazın; görseller{" "}
                  <span className="font-mono">/uploads/…</span> ile birleştirilir. Alternatif:
                  ürün formunda doğrudan CDN HTTPS linki yapıştırın.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Stok düşüm eşiği (Trendyol sync)
                </label>
                <select
                  value={integration.trendyolStockDeductAt ?? "processing"}
                  onChange={(e) =>
                    setIntegration({ ...integration, trendyolStockDeductAt: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="pending">Beklemede (sipariş gelince)</option>
                  <option value="processing">Hazırlanıyor (etiket / işleme al)</option>
                  <option value="shipped">Kargolandı</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Webhook token (Trendyol URL son segmenti)
                </label>
                <input
                  type="text"
                  value={integration.trendyolWebhookSecret ?? ""}
                  onChange={(e) =>
                    setIntegration({ ...integration, trendyolWebhookSecret: e.target.value })
                  }
                  placeholder="Kaydedince otomatik üretilir"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
                />
                {integration.trendyolWebhookSecret ? (
                  <p className="text-xs text-slate-500 break-all">
                    Webhook URL:{" "}
                    <code>
                      {typeof window !== "undefined"
                        ? `${window.location.origin}/api/trendyol/webhook/${integration.trendyolWebhookSecret}`
                        : "/api/trendyol/webhook/…"}
                    </code>
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {activeTab === "web" && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900">Next.js Mağaza API</h3>
                <p className="text-sm text-slate-500">
                  Örneğin storefront&apos;tan stok güncelleme veya webhook için taban URL ve bearer token (siz tanımlayın).
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">API taban adresi</label>
                <input
                  type="text"
                  value={integration.webApiUrl}
                  onChange={(e) => setIntegration({ ...integration, webApiUrl: e.target.value })}
                  placeholder="https://magaza.example.com/api/"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Erişim token&apos;ı</label>
                <input
                  type="password"
                  value={integration.webApiToken}
                  onChange={(e) => setIntegration({ ...integration, webApiToken: e.target.value })}
                  placeholder="Kayıtlıysa güncellenmez; sıfırlamak için yeni değer girin"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {activeTab === "print" && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900">Etiket ve çıktı</h3>
                <p className="text-sm text-slate-500">Etikette görünen kısa mağaza adı ve çıktı seçenekleri.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Etiketteki mağaza adı</label>
                <input
                  type="text"
                  value={integration.storeName}
                  onChange={(e) =>
                    setIntegration({ ...integration, storeName: e.target.value })
                  }
                  placeholder="Örn: Marka Adı"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 font-medium text-slate-800"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={integration.printPackageContents}
                  onChange={(e) =>
                    setIntegration({ ...integration, printPackageContents: e.target.checked })
                  }
                  className="w-5 h-5 text-purple-600 border-slate-300 rounded focus:ring-purple-500"
                />
                <div>
                  <span className="block text-sm font-semibold text-slate-800">Paket içi ürün özet tablosunu yazdır</span>
                  <span className="block text-xs text-slate-400">Etiket çıktısında miktar özeti görünsün.</span>
                </div>
              </label>
            </div>
          )}

    </>
  );

  if (loading) return <Spinner label="Ayarlar yükleniyor…" />;

  return (
    <div className="erp-page max-w-6xl mx-auto">
      <PageHeader
        title="Ayarlar"
        subtitle="Trendyol, mağaza API ve firma bilgileri"
      />

      {loadError ? (
        <div className="erp-card border-amber-300 bg-amber-500/10 px-4 py-3 text-sm" role="alert">
          <p className="font-semibold text-[var(--erp-text)]">Veritabanı bağlantısı yok</p>
          <p className="mt-1 erp-muted">{loadError}</p>
          <button type="button" onClick={() => void load()} className="erp-btn erp-btn-secondary text-sm mt-3">
            Yeniden dene
          </button>
        </div>
      ) : null}

      <MobileAccordion
        items={tabs.map((tab) => ({
          id: tab.id,
          title: tab.shortName,
          subtitle: tab.subtitle,
          icon: <tab.icon size={20} />,
        }))}
        openId={mobileOpenTab}
        onToggle={toggleMobileTab}
        renderPanel={() => (
          <>
            {settingsPanels}
            {saveBar(activeTab)}
          </>
        )}
      />

      <div className="hidden lg:flex flex-col lg:flex-row gap-6 items-start">
        <div className="w-full lg:w-72 erp-card p-3 space-y-1 shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl transition-all text-left ${
                  isActive
                    ? "bg-[var(--erp-accent)] text-white font-semibold"
                    : "text-[var(--erp-text-muted)] hover:bg-[var(--erp-surface-2)]"
                }`}
              >
                <div className={`p-1.5 rounded-lg ${isActive ? "bg-white/15" : tab.color}`}>
                  <Icon size={18} />
                </div>
                <span className="text-sm">{tab.name}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 w-full erp-card p-6 min-h-[420px] flex flex-col justify-between">
          {settingsPanels}
          {saveBar()}
        </div>
      </div>
    </div>
  );
}
