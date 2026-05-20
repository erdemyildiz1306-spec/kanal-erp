"use client";

import { useEffect, useState } from "react";
import { Users as UsersIcon, Shield, UserCog, Pencil, RotateCcw } from "lucide-react";
import Modal from "@/components/ui/Modal";
import StatCard from "@/components/ui/StatCard";

const roles = [
  { id: "admin", label: "Yönetici", desc: "Tam yetki — kullanıcı ve ayarlar" },
  { id: "operator", label: "Operasyon", desc: "Sipariş, stok, depo işlemleri" },
  { id: "accountant", label: "Muhasebe", desc: "Cari, fatura ve raporlar" },
];

type ErpUser = {
  _id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};

export default function UsersPage() {
  const [users, setUsers] = useState<ErpUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("operator");
  const [error, setError] = useState("");

  const [roleModal, setRoleModal] = useState<ErpUser | null>(null);
  const [editModal, setEditModal] = useState<ErpUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "" });
  const [newRole, setNewRole] = useState("operator");
  const [savingRole, setSavingRole] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, meRes] = await Promise.all([fetch("/api/users"), fetch("/api/auth/me")]);
      const data = await usersRes.json();
      const me = await meRes.json();
      if (me.success && me.user) setSessionRole(me.user.role);
      if (data.success) setUsers(data.users || []);
      else setError(data.error || "Kullanıcılar yüklenemedi.");
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const isAdmin = sessionRole === "admin";

  const add = async () => {
    if (!isAdmin) {
      alert("Yeni kullanıcı eklemek için yönetici oturumu gerekir.");
      return;
    }
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, role }),
      });
      const data = await res.json();
      if (data.success) {
        setEmail("");
        setName("");
        setPassword("");
        setRole("operator");
        void load();
      } else alert(data.error || "Hata.");
    } catch {
      alert("Bağlantı hatası.");
    }
  };

  const deactivate = async (id: string) => {
    if (!isAdmin) {
      alert("Bu işlem yalnızca yönetici tarafından yapılabilir.");
      return;
    }
    if (!confirm("Kullanıcı pasifleştirilsin mi?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) void load();
    else alert(data.error || "Hata");
  };

  const saveRole = async () => {
    if (!roleModal) return;
    setSavingRole(true);
    try {
      const res = await fetch(`/api/users/${roleModal._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        setRoleModal(null);
        void load();
      } else {
        alert(data.error || "Rol güncellenemedi.");
      }
    } catch {
      alert("Bağlantı hatası.");
    } finally {
      setSavingRole(false);
    }
  };

  const openRoleModal = (u: ErpUser) => {
    if (!isAdmin) {
      alert("Rol değiştirmek için yönetici oturumu gerekir.");
      return;
    }
    setRoleModal(u);
    setNewRole(u.role);
  };

  const openEditModal = (u: ErpUser) => {
    if (!isAdmin) {
      alert("Kullanıcı düzenlemek için yönetici oturumu gerekir.");
      return;
    }
    setEditModal(u);
    setEditForm({ name: u.name, email: u.email, password: "" });
  };

  const saveEdit = async () => {
    if (!editModal) return;
    setSavingEdit(true);
    try {
      const body: Record<string, string> = {
        name: editForm.name,
        email: editForm.email,
      };
      if (editForm.password.trim()) body.password = editForm.password;
      const res = await fetch(`/api/users/${editModal._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setEditModal(null);
        void load();
      } else alert(data.error || "Güncellenemedi");
    } catch {
      alert("Bağlantı hatası.");
    } finally {
      setSavingEdit(false);
    }
  };

  const reactivate = async (id: string) => {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    const data = await res.json();
    if (data.success) void load();
    else alert(data.error || "Aktifleştirilemedi");
  };

  const roleLabel = (id: string) => roles.find((r) => r.id === id)?.label ?? id;
  const activeCount = users.filter((u) => u.active).length;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-violet-50 text-violet-700">
          <UsersIcon size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Kullanıcılar</h2>
          <p className="text-sm text-slate-500 mt-1">
            Rol yönetimi yalnızca yönetici hesabıyla yapılır.
            {!isAdmin && sessionRole ? (
              <span className="text-amber-600 font-medium"> Mevcut rolünüz: {roleLabel(sessionRole)}</span>
            ) : null}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Toplam kullanıcı" value={users.length} icon={UsersIcon} tone="violet" />
        <StatCard label="Aktif" value={activeCount} tone="emerald" />
        <StatCard label="Yönetici" value={users.filter((u) => u.role === "admin").length} icon={Shield} tone="blue" />
      </div>

      {isAdmin ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h3 className="font-semibold text-slate-800">Yeni kullanıcı</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Ad soyad"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="E-posta"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Şifre"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <select
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void add()}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800"
          >
            Kullanıcı ekle
          </button>
        </div>
      ) : null}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Yükleniyor…</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-3 px-4 font-medium">Ad</th>
                <th className="py-3 px-4 font-medium">E-posta</th>
                <th className="py-3 px-4 font-medium">Rol</th>
                <th className="py-3 px-4 font-medium">Durum</th>
                <th className="py-3 px-4 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-medium text-slate-800">{u.name}</td>
                  <td className="py-3 px-4 text-slate-600">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold">
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                        u.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {u.active ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {isAdmin ? (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          title="Düzenle"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold hover:bg-slate-200"
                        >
                          <Pencil size={12} /> Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => openRoleModal(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-800 text-xs font-semibold hover:bg-violet-100"
                        >
                          <UserCog size={12} /> Rol
                        </button>
                        {u.active ? (
                          <button
                            type="button"
                            onClick={() => void deactivate(u._id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
                          >
                            Pasifleştir
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void reactivate(u._id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100"
                          >
                            <RotateCcw size={12} /> Aktifleştir
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400" title="Yalnızca yönetici düzenleyebilir">
                        Yönetici gerekli
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={Boolean(roleModal)}
        onClose={() => setRoleModal(null)}
        title="Rol değiştir"
        subtitle={roleModal ? `${roleModal.name} · ${roleModal.email}` : undefined}
        tone="violet"
        icon={<UserCog size={18} className="text-violet-600" />}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRoleModal(null)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={savingRole}
              onClick={() => void saveRole()}
              className="px-4 py-2 bg-violet-600 text-white rounded-xl disabled:opacity-50"
            >
              Kaydet
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          {roles.map((r) => (
            <label
              key={r.id}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                newRole === r.id ? "border-violet-400 bg-violet-50" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={r.id}
                checked={newRole === r.id}
                onChange={() => setNewRole(r.id)}
                className="mt-1"
              />
              <div>
                <p className="font-semibold text-slate-800">{r.label}</p>
                <p className="text-xs text-slate-500">{r.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </Modal>

      <Modal
        open={Boolean(editModal)}
        onClose={() => setEditModal(null)}
        title="Kullanıcı düzenle"
        subtitle={editModal?.email}
        tone="blue"
        icon={<Pencil size={18} className="text-blue-600" />}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditModal(null)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={savingEdit}
              onClick={() => void saveEdit()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl disabled:opacity-50"
            >
              Kaydet
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <input
            className="w-full px-3 py-2.5 border rounded-xl text-sm"
            placeholder="Ad soyad"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />
          <input
            type="email"
            className="w-full px-3 py-2.5 border rounded-xl text-sm"
            placeholder="E-posta"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
          />
          <input
            type="password"
            className="w-full px-3 py-2.5 border rounded-xl text-sm"
            placeholder="Yeni şifre (boş bırakılırsa değişmez)"
            value={editForm.password}
            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  );
}
