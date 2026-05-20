"use client";

import { useEffect, useState } from "react";
import { Plus, Wallet, PiggyBank, Users, Pencil, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";

type CariRow = {
  _id: string;
  type: string;
  amount: number;
  description?: string;
  reference?: string;
  category?: string;
  createdAt?: string;
};

type Cashbox = { _id: string; name: string; type: string; balance: number; isDefault?: boolean };
type Customer = { _id: string; name: string; balance: number };

function fmt(n: number) {
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CariPage() {
  const [entries, setEntries] = useState<CariRow[]>([]);
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState({ cashBalance: 0, receivables: 0, ledgerBalance: 0 });
  const [loading, setLoading] = useState(true);
  const [tahsilatOpen, setTahsilatOpen] = useState(false);
  const [cashboxOpen, setCashboxOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tahsilat, setTahsilat] = useState({ customerId: "", cashboxId: "", amount: "", description: "Cari tahsilat" });
  const [cashboxForm, setCashboxForm] = useState({ name: "", type: "general" });
  const [entryForm, setEntryForm] = useState({ type: "gelir" as "gelir" | "gider", amount: "", description: "", category: "Genel" });
  const [editEntry, setEditEntry] = useState<CariRow | null>(null);
  const [editEntryDesc, setEditEntryDesc] = useState("");
  const [deleteEntry, setDeleteEntry] = useState<CariRow | null>(null);
  const [editCashbox, setEditCashbox] = useState<Cashbox | null>(null);
  const [editCashboxForm, setEditCashboxForm] = useState({ name: "", type: "general" });
  const [deleteCashbox, setDeleteCashbox] = useState<Cashbox | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cari");
      const data = await res.json();
      if (data.success) {
        setEntries(data.entries ?? []);
        setCashboxes(data.cashboxes ?? []);
        setCustomers(data.customers ?? []);
        setSummary(data.summary ?? { cashBalance: 0, receivables: 0, ledgerBalance: 0 });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const postCari = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/cari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        await load();
        return true;
      }
      alert(data.error || "Kayıt hatası");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveEntryEdit = async () => {
    if (!editEntry) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cari/${editEntry._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editEntryDesc }),
      });
      const data = await res.json();
      if (data.success) {
        setEditEntry(null);
        await load();
      } else alert(data.error || "Güncelleme hatası");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteEntry = async () => {
    if (!deleteEntry) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cari/${deleteEntry._id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDeleteEntry(null);
        await load();
      } else alert(data.error || "Silme hatası");
    } finally {
      setSaving(false);
    }
  };

  const saveCashboxEdit = async () => {
    if (!editCashbox) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cari/cashbox/${editCashbox._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editCashboxForm),
      });
      const data = await res.json();
      if (data.success) {
        setEditCashbox(null);
        await load();
      } else alert(data.error || "Kasa güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteCashbox = async () => {
    if (!deleteCashbox) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cari/cashbox/${deleteCashbox._id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDeleteCashbox(null);
        await load();
      } else alert(data.error || "Kasa silinemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Cari & Kasa</h2>
          <p className="text-sm text-slate-500 mt-1">
            Müşteri tahsilatı, kasa bakiyeleri ve gelir/gider hareketleri.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTahsilatOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm font-medium"
          >
            <Users size={16} />
            Tahsilat
          </button>
          <button
            type="button"
            onClick={() => setCashboxOpen(true)}
            className="flex items-center gap-2 bg-slate-100 text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-200 text-sm"
          >
            <PiggyBank size={16} />
            Yeni kasa
          </button>
          <button
            type="button"
            onClick={() => setEntryOpen(true)}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 text-sm"
          >
            <Plus size={16} />
            Gelir / Gider
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-bold">Kasa toplamı</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(summary.cashBalance)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-bold">Alacaklar (müşteri borcu)</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{fmt(summary.receivables)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-3">
          <Wallet className="text-emerald-600" size={28} />
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold">Defter bakiyesi</p>
            <p className={`text-xl font-bold ${summary.ledgerBalance >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {fmt(summary.ledgerBalance)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden lg:col-span-1">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">Kasalar</div>
          {cashboxes.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Kasa yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cashboxes.map((k) => (
                <li key={k._id} className="px-4 py-3 flex justify-between items-center text-sm gap-2">
                  <span>
                    {k.name}
                    {k.isDefault ? <span className="ml-1 text-[10px] text-blue-600">(varsayılan)</span> : null}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{fmt(Number(k.balance) || 0)}</span>
                    <button
                      type="button"
                      title="Düzenle"
                      onClick={() => {
                        setEditCashbox(k);
                        setEditCashboxForm({ name: k.name, type: k.type });
                      }}
                      className="p-1 text-slate-400 hover:text-blue-600"
                    >
                      <Pencil size={14} />
                    </button>
                    {!k.isDefault ? (
                      <button
                        type="button"
                        title="Sil"
                        onClick={() => setDeleteCashbox(k)}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden lg:col-span-2">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">Son hareketler</div>
          {loading ? (
            <p className="p-6 text-slate-500">Yükleniyor…</p>
          ) : entries.length === 0 ? (
            <p className="p-6 text-slate-500">Henüz hareket yok.</p>
          ) : (
            <>
            <div className="md:hidden divide-y divide-[var(--erp-border)]">
              {entries.map((row) => (
                <div key={row._id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold capitalize text-[var(--erp-text)]">{row.type}</p>
                      <p className="text-sm erp-muted mt-0.5">{row.description || "—"}</p>
                    </div>
                    <span className="font-bold text-[var(--erp-text)]">{fmt(Number(row.amount) || 0)}</span>
                  </div>
                  <p className="text-xs erp-muted">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString("tr-TR") : "—"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditEntry(row);
                        setEditEntryDesc(row.description ?? "");
                      }}
                      className="erp-btn erp-btn-secondary text-sm py-2.5"
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteEntry(row)}
                      className="erp-btn erp-btn-ghost text-sm py-2.5 text-red-600"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">Tarih</th>
                    <th className="text-left px-4 py-2">Tür</th>
                    <th className="text-right px-4 py-2">Tutar</th>
                    <th className="text-left px-4 py-2">Açıklama</th>
                    <th className="text-right px-4 py-2">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row) => (
                    <tr key={row._id} className="border-t border-slate-100">
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString("tr-TR") : "—"}
                      </td>
                      <td className="px-4 py-2 capitalize">{row.type}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmt(Number(row.amount) || 0)}</td>
                      <td className="px-4 py-2">{row.description || "—"}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setEditEntry(row);
                            setEditEntryDesc(row.description ?? "");
                          }}
                          className="text-xs text-blue-600 hover:underline mr-2"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteEntry(row)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={tahsilatOpen}
        onClose={() => setTahsilatOpen(false)}
        title="Müşteri tahsilatı"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTahsilatOpen(false)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                const ok = await postCari({ action: "tahsilat", ...tahsilat });
                if (ok) setTahsilatOpen(false);
              }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl disabled:opacity-50"
            >
              Kaydet
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Müşteri</label>
            <select
              value={tahsilat.customerId}
              onChange={(e) => setTahsilat({ ...tahsilat, customerId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded-lg"
            >
              <option value="">Seçin…</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} — borç {fmt(Number(c.balance) || 0)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Kasa</label>
            <select
              value={tahsilat.cashboxId}
              onChange={(e) => setTahsilat({ ...tahsilat, cashboxId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded-lg"
            >
              <option value="">Varsayılan kasa</option>
              {cashboxes.map((k) => (
                <option key={k._id} value={k._id}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Tutar ₺</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={tahsilat.amount}
              onChange={(e) => setTahsilat({ ...tahsilat, amount: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={cashboxOpen}
        onClose={() => setCashboxOpen(false)}
        title="Yeni kasa"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCashboxOpen(false)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                const ok = await postCari({ action: "cashbox", ...cashboxForm });
                if (ok) setCashboxOpen(false);
              }}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl disabled:opacity-50"
            >
              Oluştur
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <input
            placeholder="Kasa adı"
            value={cashboxForm.name}
            onChange={(e) => setCashboxForm({ ...cashboxForm, name: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
          <select
            value={cashboxForm.type}
            onChange={(e) => setCashboxForm({ ...cashboxForm, type: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="general">Genel</option>
            <option value="bank">Banka</option>
            <option value="pos">POS</option>
          </select>
        </div>
      </Modal>

      <Modal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        title="Gelir / Gider"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEntryOpen(false)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                const ok = await postCari({ action: "entry", ...entryForm });
                if (ok) setEntryOpen(false);
              }}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl disabled:opacity-50"
            >
              Kaydet
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <select
            value={entryForm.type}
            onChange={(e) => setEntryForm({ ...entryForm, type: e.target.value as "gelir" | "gider" })}
            className="col-span-2 px-3 py-2 border rounded-lg"
          >
            <option value="gelir">Gelir</option>
            <option value="gider">Gider</option>
          </select>
          <input
            type="number"
            placeholder="Tutar"
            value={entryForm.amount}
            onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })}
            className="col-span-2 px-3 py-2 border rounded-lg"
          />
          <input
            placeholder="Açıklama"
            value={entryForm.description}
            onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
            className="col-span-2 px-3 py-2 border rounded-lg"
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(editEntry)}
        onClose={() => setEditEntry(null)}
        title="Hareket düzenle"
        subtitle={editEntry ? `${editEntry.type} · ${fmt(Number(editEntry.amount) || 0)}` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditEntry(null)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveEntryEdit()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl disabled:opacity-50"
            >
              Kaydet
            </button>
          </div>
        }
      >
        <input
          value={editEntryDesc}
          onChange={(e) => setEditEntryDesc(e.target.value)}
          placeholder="Açıklama"
          className="w-full px-3 py-2 border rounded-lg"
        />
      </Modal>

      <Modal
        open={Boolean(editCashbox)}
        onClose={() => setEditCashbox(null)}
        title="Kasa düzenle"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditCashbox(null)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveCashboxEdit()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl disabled:opacity-50"
            >
              Kaydet
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <input
            value={editCashboxForm.name}
            onChange={(e) => setEditCashboxForm({ ...editCashboxForm, name: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="Kasa adı"
          />
          <select
            value={editCashboxForm.type}
            onChange={(e) => setEditCashboxForm({ ...editCashboxForm, type: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="general">Genel</option>
            <option value="bank">Banka</option>
            <option value="pos">POS</option>
          </select>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteEntry)}
        onClose={() => setDeleteEntry(null)}
        onConfirm={() => void confirmDeleteEntry()}
        title="Hareketi sil"
        message={
          deleteEntry?.type === "tahsilat"
            ? "Tahsilat silinirse müşteri borcu ve kasa bakiyesi geri alınır."
            : "Bu hareket kalıcı olarak silinecek."
        }
        variant="danger"
        confirmLabel="Sil"
        loading={saving}
      />

      <ConfirmModal
        open={Boolean(deleteCashbox)}
        onClose={() => setDeleteCashbox(null)}
        onConfirm={() => void confirmDeleteCashbox()}
        title="Kasayı sil"
        message={`"${deleteCashbox?.name}" silinecek. Yalnızca sıfır bakiyeli kasalar silinebilir.`}
        variant="danger"
        confirmLabel="Sil"
        loading={saving}
      />
    </div>
  );
}
