"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Smartphone } from "lucide-react";

type LoginMode = "staff" | "customer";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [mode, setMode] = useState<LoginMode>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devResetAllowed, setDevResetAllowed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetHint, setResetHint] = useState("");
  const [apk, setApk] = useState<{ available: boolean; version: string; downloadUrl: string | null } | null>(
    null
  );

  useEffect(() => {
    fetch("/api/auth/dev-reset-users")
      .then((r) => r.json())
      .then((d: { allowed?: boolean }) => setDevResetAllowed(Boolean(d.allowed)))
      .catch(() => setDevResetAllowed(false));
    fetch("/api/apk/info")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setApk({ available: d.available, version: d.version, downloadUrl: d.downloadUrl });
      })
      .catch(() => {});
  }, []);

  const resetLocalUsers = async () => {
    if (
      !confirm(
        "Yerel veritabanındaki tüm kullanıcılar silinecek. Sonraki girişte girdiğiniz e-posta/şifre ile yeni yönetici oluşturulur. Devam?"
      )
    ) {
      return;
    }
    setResetting(true);
    setResetHint("");
    setError("");
    try {
      const res = await fetch("/api/auth/dev-reset-users", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Sıfırlama başarısız.");
        return;
      }
      setResetHint(data.message || "Hesaplar sıfırlandı. Şimdi giriş yapın.");
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setResetting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
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
      const dest = mode === "customer" ? "/portal" : next;
      router.replace(dest);
      router.refresh();
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f4f0] p-6">
      <div className="w-full max-w-md space-y-4">
        {apk?.available && apk.downloadUrl ? (
          <a
            href={apk.downloadUrl}
            className="flex items-center gap-3 bg-violet-900 text-white rounded-2xl px-4 py-3 shadow-lg hover:bg-violet-800 transition-colors"
          >
            <Smartphone size={22} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">Mobil APK v{apk.version}</p>
              <p className="text-xs text-violet-200">Android uygulamasını indir</p>
            </div>
            <Download size={18} className="shrink-0" />
          </a>
        ) : null}

        <div className="bg-white rounded-2xl border border-[#e4ddd4] shadow-lg p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-stone-800">
              Kanal<span className="text-[#5a6f55]">ERP</span>
            </h1>
            <p className="text-sm text-stone-500 mt-2">
              {mode === "customer" ? "Müşteri portalı girişi" : "Yönetici / ekip girişi"}
            </p>
          </div>

          <div className="flex rounded-xl bg-stone-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode("staff")}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${
                mode === "staff" ? "bg-white shadow text-stone-900" : "text-stone-500"
              }`}
            >
              Yönetici
            </button>
            <button
              type="button"
              onClick={() => setMode("customer")}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${
                mode === "customer" ? "bg-white shadow text-violet-800" : "text-stone-500"
              }`}
            >
              Müşteri
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-stone-600">E-posta</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm"
                placeholder="ornek@sirket.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Şifre</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm"
                placeholder="••••••••"
              />
            </div>
            {error ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            ) : null}
            {resetHint ? (
              <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                {resetHint}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 text-white rounded-xl font-semibold disabled:opacity-60 ${
                mode === "customer"
                  ? "bg-violet-700 hover:bg-violet-800"
                  : "bg-[#4a5d45] hover:bg-[#3d4a42]"
              }`}
            >
              {loading ? "Giriş yapılıyor…" : mode === "customer" ? "Müşteri Paneline Gir" : "Giriş Yap"}
            </button>
          </form>

          {devResetAllowed && mode === "staff" ? (
            <button
              type="button"
              disabled={resetting}
              onClick={() => void resetLocalUsers()}
              className="mt-3 w-full py-2 text-xs text-stone-500 hover:text-stone-700 underline disabled:opacity-60"
            >
              {resetting ? "Sıfırlanıyor…" : "Yerel geliştirme: kullanıcıları sıfırla"}
            </button>
          ) : null}

          <p className="text-xs text-stone-400 text-center mt-6 leading-relaxed">
            {mode === "customer"
              ? "Toptan müşteri hesabınız yönetici tarafından oluşturulur."
              : "İlk girişte kullanıcı yoksa otomatik yönetici oluşturulur."}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-stone-500">Yükleniyor…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
