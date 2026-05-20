"use client";

import { useEffect, useState } from "react";
import { Plus, Users, Pencil, Ban, KeyRound, RotateCcw } from "lucide-react";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import PageHeader from "@/components/ui/PageHeader";
import Spinner from "@/components/ui/Spinner";
import MobileListCard from "@/components/ui/MobileListCard";
import MobileActionButton from "@/components/ui/MobileActionButton";

type CustomerRow = {
  _id: string;
  name: string;
  email: string;
  companyName?: string;
  phone?: string;
  balance: number;
  active: boolean;
  notes?: string;
};

function fmt(n: number) {
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const emptyForm = {
  name: "",
  email: "",
  password: "",
  companyName: "",
  phone: "",
  balance: "0",
  notes: "",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerRow | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<CustomerRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<CustomerRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      if (data.success) setCustomers(data.customers ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (c: CustomerRow) => {
    setEditTarget(c);
    setForm({
      name: c.name,
      email: c.email,
      password: "",
      companyName: c.companyName ?? "",
      phone: c.phone ?? "",
      balance: String(c.balance ?? 0),
      notes: c.notes ?? "",
    });
    setModalOpen(true);
  };

  const saveCustomer = async () => {
    setSaving(true);
    try {
      if (editTarget) {
        const res = await fetch(`/api/customers/${editTarget._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            companyName: form.companyName,
            phone: form.phone,
            balance: form.balance,
            notes: form.notes,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setModalOpen(false);
          await load();
        } else alert(data.error || "Güncelleme hatası");
      } else {
        const res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (data.success) {
          setModalOpen(false);
          setForm(emptyForm);
          await load();
        } else alert(data.error || "Kayıt hatası");
      }
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!passwordTarget || !newPassword.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${passwordTarget._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPasswordTarget(null);
        setNewPassword("");
      } else alert(data.error || "Şifre güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: CustomerRow, active: boolean) => {
    const res = await fetch(`/api/customers/${c._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const data = await res.json();
    if (data.success) {
      setDeactivateTarget(null);
      await load();
    } else alert(data.error || "İşlem başarısız");
  };

  return (
    <div className="erp-page max-w-5xl mx-auto">
      <PageHeader
        title="Müşteriler"
        subtitle="Toptan müşteri hesapları — portal girişi"
        action={
          <button type="button" onClick={openCreate} className="erp-btn erp-btn-primary text-sm">
            <Plus size={18} />
            Yeni
          </button>
        }
      />

      {loading ? (
        <Spinner label="Müşteriler yükleniyor…" />
      ) : customers.length === 0 ? (
        <p className="erp-muted text-center py-10">Henüz müşteri yok.</p>
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {customers.map((c) => (
              <MobileListCard
                key={c._id}
                title={c.name}
                subtitle={c.email}
                badge={
                  <span className="text-sm font-bold text-[var(--erp-text)]">
                    {fmt(Number(c.balance) || 0)}
                  </span>
                }
                meta={
                  <>
                    {c.companyName ? (
                      <span className="px-2 py-0.5 rounded-md bg-[var(--erp-surface-2)]">{c.companyName}</span>
                    ) : null}
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                        c.active ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700"
                      }`}
                    >
                      {c.active ? "Aktif" : "Pasif"}
                    </span>
                  </>
                }
                actions={
                  <>
                    <MobileActionButton onClick={() => openEdit(c)}>Düzenle</MobileActionButton>
                    <MobileActionButton
                      onClick={() => {
                        setPasswordTarget(c);
                        setNewPassword("");
                      }}
                    >
                      Şifre
                    </MobileActionButton>
                    {c.active ? (
                      <MobileActionButton variant="danger" onClick={() => setDeactivateTarget(c)}>
                        Pasifleştir
                      </MobileActionButton>
                    ) : (
                      <MobileActionButton onClick={() => void toggleActive(c, true)}>Aktifleştir</MobileActionButton>
                    )}
                  </>
                }
              />
            ))}
          </div>
          <div className="hidden md:block erp-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3">Ad / Firma</th>
                <th className="text-left px-4 py-3">E-posta</th>
                <th className="text-right px-4 py-3">Borç</th>
                <th className="text-left px-4 py-3">Durum</th>
                <th className="text-right px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c._id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.name}</p>
                    {c.companyName ? <p className="text-xs text-slate-500">{c.companyName}</p> : null}
                  </td>
                  <td className="px-4 py-3">{c.email}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(Number(c.balance) || 0)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        c.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {c.active ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="text-xs font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Pencil size={12} /> Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordTarget(c);
                        setNewPassword("");
                      }}
                      className="text-xs font-medium text-violet-600 hover:underline inline-flex items-center gap-1"
                    >
                      <KeyRound size={12} /> Şifre
                    </button>
                    {c.active ? (
                      <button
                        type="button"
                        onClick={() => setDeactivateTarget(c)}
                        className="text-xs font-medium text-red-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Ban size={12} /> Pasifleştir
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void toggleActive(c, true)}
                        className="text-xs font-medium text-emerald-600 hover:underline inline-flex items-center gap-1"
                      >
                        <RotateCcw size={12} /> Aktifleştir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? "Müşteri düzenle" : "Yeni toptan müşteri"}
        subtitle={editTarget ? editTarget.email : "Panel girişi: login → Müşteri sekmesi"}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveCustomer()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl disabled:opacity-50"
            >
              {saving ? "Kaydediliyor…" : editTarget ? "Güncelle" : "Oluştur"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-400 uppercase">Ad Soyad *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">E-posta *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded-lg"
            />
          </div>
          {!editTarget ? (
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase">Şifre *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1 w-full px-3 py-2 border rounded-lg"
              />
            </div>
          ) : null}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Firma</label>
            <input
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Telefon</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Borç bakiyesi ₺</label>
            <input
              type="number"
              min="0"
              value={form.balance}
              onChange={(e) => setForm({ ...form, balance: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-400 uppercase">Notlar</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded-lg min-h-[72px]"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(passwordTarget)}
        onClose={() => setPasswordTarget(null)}
        title="Şifre sıfırla"
        subtitle={passwordTarget?.name}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPasswordTarget(null)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving || !newPassword.trim()}
              onClick={() => void resetPassword()}
              className="px-4 py-2 bg-violet-600 text-white rounded-xl disabled:opacity-50"
            >
              Kaydet
            </button>
          </div>
        }
      >
        <input
          type="password"
          placeholder="Yeni şifre"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full px-3 py-2.5 border rounded-xl"
        />
      </Modal>

      <ConfirmModal
        open={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => deactivateTarget && void toggleActive(deactivateTarget, false)}
        title="Müşteriyi pasifleştir"
        message={`${deactivateTarget?.name} hesabı pasifleştirilecek. Giriş yapamaz.`}
        variant="danger"
        confirmLabel="Pasifleştir"
      />
    </div>
  );
}
