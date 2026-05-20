"use client";

import { useEffect, useState } from "react";
import { User, Building2, Mail, Phone, KeyRound } from "lucide-react";

export default function PortalProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    companyName: "",
    phone: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: "",
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/portal/summary")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.customer) {
          setProfile({
            name: d.customer.name ?? "",
            email: d.customer.email ?? "",
            companyName: d.customer.companyName ?? "",
            phone: d.customer.phone ?? "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.success) setMessage("Profil güncellendi.");
      else setMessage(data.error || "Kayıt hatası");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setMessage("Yeni şifreler eşleşmiyor.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("Şifre güncellendi.");
        setPasswordForm({ currentPassword: "", newPassword: "", confirm: "" });
      } else setMessage(data.error || "Şifre güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div className="erp-card p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[var(--erp-accent)] text-white dark:text-[#0f1210] flex items-center justify-center text-2xl font-black">
            {(profile.name || "M").charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--erp-text)]">{profile.name || "Profil"}</h2>
            <p className="text-sm erp-muted">{profile.email || "—"}</p>
          </div>
        </div>

        {message ? (
          <div className="rounded-xl bg-[var(--erp-accent-soft)] px-3 py-2 text-sm text-[var(--erp-accent)]">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-[var(--erp-surface-2)]" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-semibold erp-muted uppercase">
              <User size={12} className="inline mr-1" /> Ad
            </label>
            <input
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="erp-input"
            />
            <label className="block text-xs font-semibold erp-muted uppercase">
              <Mail size={12} className="inline mr-1" /> E-posta
            </label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              className="erp-input"
            />
            <label className="block text-xs font-semibold erp-muted uppercase">
              <Building2 size={12} className="inline mr-1" /> Firma
            </label>
            <input
              value={profile.companyName}
              onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
              className="erp-input"
            />
            <label className="block text-xs font-semibold erp-muted uppercase">
              <Phone size={12} className="inline mr-1" /> Telefon
            </label>
            <input
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className="erp-input"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveProfile()}
              className="erp-btn erp-btn-primary w-full disabled:opacity-50"
            >
              Profili kaydet
            </button>
          </div>
        )}
      </div>

      <div className="erp-card p-5 space-y-3">
        <h3 className="font-bold flex items-center gap-2 text-[var(--erp-text)]">
          <KeyRound size={16} className="text-[var(--erp-accent)]" /> Şifre değiştir
        </h3>
        <input
          type="password"
          placeholder="Mevcut şifre"
          value={passwordForm.currentPassword}
          onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
          className="erp-input text-sm"
        />
        <input
          type="password"
          placeholder="Yeni şifre"
          value={passwordForm.newPassword}
          onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
          className="erp-input text-sm"
        />
        <input
          type="password"
          placeholder="Yeni şifre (tekrar)"
          value={passwordForm.confirm}
          onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
          className="erp-input text-sm"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void changePassword()}
          className="erp-btn erp-btn-secondary w-full disabled:opacity-50"
        >
          Şifreyi güncelle
        </button>
      </div>
    </div>
  );
}
