"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  Smartphone,
  LogIn,
  UserPlus,
  KeyRound,
  ArrowLeft,
} from "lucide-react";

type LoginMode = "staff" | "customer";
type AuthView = "login" | "register" | "forgot" | "reset";

function AuthMessage({
  error,
  success,
}: {
  error: string;
  success: string;
}) {
  if (error) {
    return (
      <p className="text-sm text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3">
        {success}
      </p>
    );
  }
  return null;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const resetTokenFromUrl = searchParams.get("resetToken") || "";

  const [mode, setMode] = useState<LoginMode>("staff");
  const [view, setView] = useState<AuthView>(resetTokenFromUrl ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState(resetTokenFromUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [devResetAllowed, setDevResetAllowed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [allowSignup, setAllowSignup] = useState(true);
  const [requireApproval, setRequireApproval] = useState(true);
  const [minPasswordLength, setMinPasswordLength] = useState(8);
  const [devResetUrl, setDevResetUrl] = useState("");
  const [apk, setApk] = useState<{
    available: boolean;
    version: string;
    downloadUrl: string | null;
  } | null>(null);

  useEffect(() => {
    if (resetTokenFromUrl) {
      setView("reset");
      setResetToken(resetTokenFromUrl);
    }
  }, [resetTokenFromUrl]);

  useEffect(() => {
    fetch("/api/auth/dev-reset-users")
      .then((r) => r.json())
      .then((d: { allowed?: boolean }) => setDevResetAllowed(Boolean(d.allowed)))
      .catch(() => setDevResetAllowed(false));

    fetch("/api/auth/register-config")
      .then((r) => r.json())
      .then(
        (d: {
          allowSignup?: boolean;
          requireApproval?: boolean;
          minPasswordLength?: number;
        }) => {
          if (d.allowSignup === false) setAllowSignup(false);
          if (d.requireApproval === false) setRequireApproval(false);
          if (typeof d.minPasswordLength === "number") setMinPasswordLength(d.minPasswordLength);
        }
      )
      .catch(() => {});

    fetch("/api/apk/info")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setApk({ available: d.available, version: d.version, downloadUrl: d.downloadUrl });
      })
      .catch(() => {});
  }, []);

  const clearMessages = () => {
    setError("");
    setSuccess("");
    setDevResetUrl("");
  };

  const switchView = (v: AuthView) => {
    clearMessages();
    setView(v);
  };

  const resetLocalUsers = async () => {
    if (
      !confirm(
        "Yerel veritabanındaki tüm kullanıcılar silinecek. Sonraki girişte girdiğiniz e-posta/şifre ile yeni yönetici oluşturulur. Devam?"
      )
    ) {
      return;
    }
    setResetting(true);
    clearMessages();
    try {
      const res = await fetch("/api/auth/dev-reset-users", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Sıfırlama başarısız.");
        return;
      }
      setSuccess(data.message || "Hesaplar sıfırlandı.");
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setResetting(false);
    }
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const endpoint = mode === "customer" ? "/api/auth/customer-login" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Giriş başarısız.");
        return;
      }
      router.replace(
        mode === "customer" ? "/portal" : String(data.redirect ?? next)
      );
      router.refresh();
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Kayıt başarısız.");
        return;
      }
      setSuccess(data.message || "Kayıt tamamlandı.");
      if (data.pendingApproval) {
        switchView("login");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "İstek gönderilemedi.");
        return;
      }
      setSuccess(data.message || "Talep alındı.");
      if (typeof data.devResetUrl === "string") setDevResetUrl(data.devResetUrl);
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Şifre güncellenemedi.");
        return;
      }
      setSuccess(data.message || "Şifre güncellendi.");
      setPassword("");
      setConfirmPassword("");
      setResetToken("");
      switchView("login");
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  };

  const title =
    view === "register"
      ? "Üye Ol"
      : view === "forgot"
        ? "Şifremi Unuttum"
        : view === "reset"
          ? "Yeni Şifre"
          : mode === "customer"
            ? "Müşteri Portalı"
            : "Yönetici Girişi";

  return (
    <div
      className="min-h-[100dvh] flex flex-col bg-[var(--erp-bg)]"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-[var(--erp-border)] bg-[var(--erp-header)] backdrop-blur-md">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--erp-text-muted)]">
            KanalERP
          </p>
          <h1 className="text-lg font-bold text-[var(--erp-text)]">{title}</h1>
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-5 space-y-4">
        {apk?.available && apk.downloadUrl ? (
          <a
            href={apk.downloadUrl}
            className="erp-card flex items-center gap-3 p-4 bg-violet-600 text-white border-violet-500 active:scale-[0.99] transition-transform"
          >
            <div className="p-2.5 rounded-xl bg-white/15">
              <Smartphone size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold">Android APK v{apk.version}</p>
              <p className="text-sm text-violet-100">Mobil uygulamayı indir</p>
            </div>
            <Download size={20} className="shrink-0" />
          </a>
        ) : null}

        {view !== "login" ? (
          <button
            type="button"
            onClick={() => switchView("login")}
            className="erp-btn erp-btn-ghost w-full text-sm"
          >
            <ArrowLeft size={18} />
            Girişe dön
          </button>
        ) : null}

        <div className="erp-card p-5 md:p-6 space-y-5">
          {view === "login" ? (
            <>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--erp-surface-2)]">
                <button
                  type="button"
                  onClick={() => setMode("staff")}
                  className={`erp-btn py-3 text-sm rounded-lg ${
                    mode === "staff"
                      ? "erp-btn-primary shadow-sm"
                      : "erp-btn-ghost border-0 bg-transparent"
                  }`}
                >
                  Yönetici
                </button>
                <button
                  type="button"
                  onClick={() => setMode("customer")}
                  className={`erp-btn py-3 text-sm rounded-lg ${
                    mode === "customer"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "erp-btn-ghost border-0 bg-transparent"
                  }`}
                >
                  Müşteri
                </button>
              </div>

              <form onSubmit={submitLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--erp-text)]">E-posta</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="erp-input"
                    placeholder="ornek@sirket.com"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-semibold text-[var(--erp-text)]">Şifre</label>
                    {mode === "staff" ? (
                      <button
                        type="button"
                        onClick={() => switchView("forgot")}
                        className="text-sm font-medium text-[var(--erp-accent)]"
                      >
                        Unuttum
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="erp-input"
                    placeholder="••••••••"
                  />
                </div>

                <AuthMessage error={error} success={success} />

                <button
                  type="submit"
                  disabled={loading}
                  className={`erp-btn w-full text-base disabled:opacity-60 ${
                    mode === "customer" ? "bg-violet-600 text-white" : "erp-btn-primary"
                  }`}
                >
                  <LogIn size={20} />
                  {loading ? "Giriş yapılıyor…" : mode === "customer" ? "Portala Gir" : "Giriş Yap"}
                </button>
              </form>

              {mode === "staff" && allowSignup ? (
                <button
                  type="button"
                  onClick={() => switchView("register")}
                  className="erp-btn erp-btn-secondary w-full"
                >
                  <UserPlus size={20} />
                  Yeni hesap oluştur
                </button>
              ) : null}

              {devResetAllowed && mode === "staff" ? (
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => void resetLocalUsers()}
                  className="w-full py-2 text-xs erp-muted underline disabled:opacity-60"
                >
                  {resetting ? "Sıfırlanıyor…" : "Dev: kullanıcıları sıfırla"}
                </button>
              ) : null}

              <p className="text-xs erp-muted text-center leading-relaxed">
                {mode === "customer"
                  ? "Toptan müşteri hesabınız yönetici tarafından oluşturulur."
                  : requireApproval
                    ? "Kayıt sonrası yönetici onayı gerekebilir."
                    : "Ekip üyeleri kayıt olabilir."}
              </p>
            </>
          ) : null}

          {view === "register" ? (
            <form onSubmit={submitRegister} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--erp-text)]">Ad soyad</label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="erp-input"
                  placeholder="Adınız Soyadınız"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--erp-text)]">E-posta</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="erp-input"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--erp-text)]">
                  Şifre (min. {minPasswordLength})
                </label>
                <input
                  type="password"
                  required
                  minLength={minPasswordLength}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="erp-input"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--erp-text)]">Şifre tekrar</label>
                <input
                  type="password"
                  required
                  minLength={minPasswordLength}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="erp-input"
                />
              </div>
              <AuthMessage error={error} success={success} />
              <button type="submit" disabled={loading} className="erp-btn erp-btn-primary w-full disabled:opacity-60">
                <UserPlus size={20} />
                {loading ? "Kaydediliyor…" : "Kayıt Ol"}
              </button>
            </form>
          ) : null}

          {view === "forgot" ? (
            <form onSubmit={submitForgot} className="space-y-4">
              <p className="text-sm erp-muted">
                Kayıtlı e-posta adresinizi girin. Şifre sıfırlama bağlantısı gönderilir.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--erp-text)]">E-posta</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="erp-input"
                />
              </div>
              <AuthMessage error={error} success={success} />
              {devResetUrl ? (
                <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 break-all">
                  Dev:{" "}
                  <a href={devResetUrl} className="underline font-medium">
                    Sıfırlama bağlantısı
                  </a>
                </p>
              ) : null}
              <button type="submit" disabled={loading} className="erp-btn erp-btn-primary w-full disabled:opacity-60">
                <KeyRound size={20} />
                {loading ? "Gönderiliyor…" : "Bağlantı Gönder"}
              </button>
            </form>
          ) : null}

          {view === "reset" ? (
            <form onSubmit={submitReset} className="space-y-4">
              <p className="text-sm erp-muted">Yeni şifrenizi belirleyin.</p>
              {!resetToken ? (
                <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">
                  Geçersiz sıfırlama bağlantısı.
                </p>
              ) : null}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--erp-text)]">
                  Yeni şifre (min. {minPasswordLength})
                </label>
                <input
                  type="password"
                  required
                  minLength={minPasswordLength}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="erp-input"
                  disabled={!resetToken}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--erp-text)]">Tekrar</label>
                <input
                  type="password"
                  required
                  minLength={minPasswordLength}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="erp-input"
                  disabled={!resetToken}
                />
              </div>
              <AuthMessage error={error} success={success} />
              <button
                type="submit"
                disabled={loading || !resetToken}
                className="erp-btn erp-btn-primary w-full disabled:opacity-60"
              >
                {loading ? "Kaydediliyor…" : "Şifreyi Güncelle"}
              </button>
            </form>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center erp-muted bg-[var(--erp-bg)]">
          Yükleniyor…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
