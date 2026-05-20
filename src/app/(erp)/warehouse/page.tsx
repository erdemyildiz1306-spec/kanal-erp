"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Warehouse as WarehouseIcon,
  MapPin,
  Package,
  ScanBarcode,
  ArrowLeftRight,
  Plus,
  Boxes,
  Search,
  Pencil,
  Trash2,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import StatCard from "@/components/ui/StatCard";
import ConfirmModal from "@/components/ui/ConfirmModal";

type WarehouseRow = {
  warehouseId: string;
  name: string;
  code: string;
  address?: string;
  notes?: string;
  isDefault?: boolean;
  productCount?: number;
  totalUnits?: number;
};

type StockItem = {
  productId: string;
  name: string;
  sku: string;
  barcode?: string;
  stock: number;
};

export default function WarehousePage() {
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [selectedId, setSelectedId] = useState("main");
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockSearch, setStockSearch] = useState("");
  const [movements, setMovements] = useState<
    Array<{ sku: string; delta: number; stockAfter: number; reason: string; createdAt: string; userName?: string }>
  >([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const [newWh, setNewWh] = useState({ name: "", code: "", address: "" });
  const [editForm, setEditForm] = useState({ name: "", code: "", address: "", notes: "" });
  const [adjustSku, setAdjustSku] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNote, setAdjustNote] = useState("Manuel düzeltme");
  const [transferForm, setTransferForm] = useState({
    fromId: "main",
    toId: "",
    sku: "",
    qty: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WarehouseRow | null>(null);

  const selected = warehouses.find((w) => w.warehouseId === selectedId);

  const loadWarehouses = useCallback(async () => {
    const res = await fetch("/api/warehouse");
    const data = await res.json();
    if (data.success) {
      setWarehouses(data.warehouses ?? []);
      if (!data.warehouses?.some((w: WarehouseRow) => w.warehouseId === selectedId)) {
        setSelectedId(data.warehouses?.[0]?.warehouseId ?? "main");
      }
    }
  }, [selectedId]);

  const loadStock = useCallback(async (warehouseId: string, q = "") => {
    const url = `/api/warehouse/${encodeURIComponent(warehouseId)}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) setStockItems(data.items ?? []);
  }, []);

  useEffect(() => {
    void Promise.all([
      loadWarehouses(),
      fetch("/api/stock-movements?limit=25").then((r) => r.json()),
    ]).then(([, mov]) => {
      if (mov.success) setMovements(mov.movements ?? []);
      setLoading(false);
    });
  }, [loadWarehouses]);

  useEffect(() => {
    if (selectedId) void loadStock(selectedId, stockSearch);
  }, [selectedId, loadStock]);

  const searchStock = () => void loadStock(selectedId, stockSearch);

  const openEdit = () => {
    if (!selected) return;
    setEditForm({
      name: selected.name,
      code: selected.code,
      address: selected.address ?? "",
      notes: selected.notes ?? "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        setEditOpen(false);
        await loadWarehouses();
      } else setError(data.error || "Kayıt başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const createWarehouse = async () => {
    if (!newWh.name.trim()) {
      setError("Depo adı zorunlu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWh),
      });
      const data = await res.json();
      if (data.success) {
        setCreateOpen(false);
        setNewWh({ name: "", code: "", address: "" });
        await loadWarehouses();
        if (data.warehouse?.warehouseId) setSelectedId(data.warehouse.warehouseId);
      } else setError(data.error || "Depo oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const adjustStock = async () => {
    const delta = Number(adjustDelta);
    if (!adjustSku.trim() || !Number.isFinite(delta) || delta === 0) {
      setError("SKU/barkod ve sıfır olmayan adet girin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: adjustSku.trim(),
          delta,
          reason: "adjustment",
          note: adjustNote,
          warehouseId: selectedId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAdjustOpen(false);
        setAdjustSku("");
        setAdjustDelta("");
        await Promise.all([loadWarehouses(), loadStock(selectedId, stockSearch)]);
      } else setError(data.error || "Stok düzeltme hatası");
    } finally {
      setBusy(false);
    }
  };

  const transferStock = async () => {
    const qty = Number(transferForm.qty);
    if (!transferForm.sku.trim() || !transferForm.toId || qty <= 0) {
      setError("SKU, hedef depo ve adet gerekli.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/warehouse/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromWarehouseId: transferForm.fromId || selectedId,
          toWarehouseId: transferForm.toId,
          sku: transferForm.sku.trim(),
          quantity: qty,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTransferOpen(false);
        setTransferForm({ fromId: selectedId, toId: "", sku: "", qty: "" });
        await Promise.all([loadWarehouses(), loadStock(selectedId, stockSearch)]);
      } else setError(data.error || "Transfer başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const deleteWarehouse = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/warehouse/${encodeURIComponent(deleteTarget.warehouseId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setDeleteTarget(null);
        if (selectedId === deleteTarget.warehouseId) setSelectedId("main");
        await loadWarehouses();
      } else setError(data.error || "Depo silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  const totalUnits = warehouses.reduce((a, w) => a + (Number(w.totalUnits) || 0), 0);

  return (
    <div className="erp-page max-w-6xl mx-auto">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="erp-page-title">Depo</h2>
          <p className="text-sm erp-muted mt-1">
            Depolar arası transfer, stok düzeltme ve barkod ile hızlı işlem.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <Link href="/scanner" className="erp-btn erp-btn-secondary text-sm col-span-2 sm:col-span-1">
            <ScanBarcode size={18} />
            Barkod Tara
          </Link>
          <button
            type="button"
            onClick={() => {
              setTransferForm({ fromId: selectedId, toId: "", sku: "", qty: "" });
              setTransferOpen(true);
            }}
            className="erp-btn erp-btn-secondary text-sm bg-violet-500/10 text-violet-700 dark:text-violet-300"
          >
            <ArrowLeftRight size={18} />
            Transfer
          </button>
          <button type="button" onClick={() => setAdjustOpen(true)} className="erp-btn erp-btn-secondary text-sm">
            <Package size={18} />
            Stok Düzelt
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} className="erp-btn erp-btn-primary text-sm col-span-2 sm:col-span-1">
            <Plus size={18} />
            Yeni Depo
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Depo sayısı" value={warehouses.length} icon={Boxes} tone="blue" />
        <StatCard label="Toplam stok adedi" value={totalUnits} icon={Package} tone="emerald" />
        <StatCard
          label="Seçili depo stok"
          value={selected?.totalUnits ?? 0}
          hint={selected?.name}
          icon={WarehouseIcon}
          tone="violet"
        />
      </div>

      {loading ? (
        <p className="text-slate-500">Yükleniyor…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-sm font-semibold erp-muted uppercase tracking-wide">Depolar</h3>
            <div className="lg:hidden erp-scroll-x flex gap-2 pb-1">
              {warehouses.map((w) => {
                const active = w.warehouseId === selectedId;
                return (
                  <button
                    key={`m-${w.warehouseId}`}
                    type="button"
                    onClick={() => setSelectedId(w.warehouseId)}
                    className={`shrink-0 rounded-xl border px-4 py-3 min-w-[9rem] text-left ${
                      active
                        ? "border-[var(--erp-accent)] bg-[var(--erp-accent-soft)]"
                        : "border-[var(--erp-border)] bg-[var(--erp-surface)]"
                    }`}
                  >
                    <p className="font-bold text-sm text-[var(--erp-text)] truncate">{w.name}</p>
                    <p className="text-xs erp-muted mt-1">{w.totalUnits ?? 0} adet</p>
                  </button>
                );
              })}
            </div>
            <div className="hidden lg:block space-y-3">
            {warehouses.map((w) => {
              const active = w.warehouseId === selectedId;
              return (
                <button
                  key={w.warehouseId}
                  type="button"
                  onClick={() => setSelectedId(w.warehouseId)}
                  className={`w-full text-left rounded-2xl border p-4 transition-all ${
                    active
                      ? "border-blue-300 bg-blue-50/80 shadow-md ring-2 ring-blue-200"
                      : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-800">{w.name}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{w.code || w.warehouseId}</p>
                    </div>
                    {w.isDefault ? (
                      <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg">
                        Varsayılan
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="rounded-lg bg-white/70 px-2 py-1.5 border border-slate-100">
                      <span className="text-slate-500">SKU</span>
                      <p className="font-bold text-slate-800">{w.productCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-white/70 px-2 py-1.5 border border-slate-100">
                      <span className="text-slate-500">Adet</span>
                      <p className="font-bold text-slate-800">{w.totalUnits ?? 0}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            {selected ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{selected.name}</h3>
                    {selected.address ? (
                      <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                        <MapPin size={14} /> {selected.address}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openEdit}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Pencil size={14} /> Düzenle
                    </button>
                    {!selected.isDefault && selected.warehouseId !== "main" ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(selected)}
                        className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium"
                      >
                        <Trash2 size={14} /> Sil
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchStock()}
                      placeholder="Ürün, SKU veya barkod ara…"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={searchStock}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
                  >
                    Ara
                  </button>
                </div>

                <div className="rounded-xl border border-[var(--erp-border)] overflow-hidden max-h-[420px] overflow-y-auto">
                  <div className="md:hidden divide-y divide-[var(--erp-border)]">
                    {stockItems.length === 0 ? (
                      <p className="py-8 text-center erp-muted text-sm">Bu depoda kayıt yok.</p>
                    ) : (
                      stockItems.map((item) => (
                        <div key={`${item.productId}-${item.sku}`} className="p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--erp-text)] truncate">{item.name}</p>
                            <p className="text-xs font-mono erp-muted mt-0.5">{item.sku}</p>
                          </div>
                          <span className="text-lg font-bold tabular-nums text-[var(--erp-accent)] shrink-0">
                            {item.stock}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 sticky top-0">
                      <tr>
                        <th className="text-left py-2.5 px-3 font-medium">Ürün</th>
                        <th className="text-left py-2.5 px-3 font-medium">SKU</th>
                        <th className="text-right py-2.5 px-3 font-medium">Stok</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockItems.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-slate-400">
                            Bu depoda kayıt yok.
                          </td>
                        </tr>
                      ) : (
                        stockItems.map((item) => (
                          <tr key={`${item.productId}-${item.sku}`} className="border-t border-slate-50">
                            <td className="py-2.5 px-3 text-slate-800">{item.name}</td>
                            <td className="py-2.5 px-3 font-mono text-xs text-slate-600">{item.sku}</td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums">{item.stock}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            ) : null}

            {movements.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-semibold text-slate-800 mb-3">Son stok hareketleri</h3>
                <ul className="space-y-2 text-sm max-h-48 overflow-y-auto">
                  {movements.map((m, i) => (
                    <li key={i} className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-slate-700">
                        {m.sku} · {m.reason}
                        {m.userName ? ` (${m.userName})` : ""}
                      </span>
                      <span className={m.delta >= 0 ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
                        {m.delta >= 0 ? "+" : ""}
                        {m.delta} → {m.stockAfter}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni depo"
        subtitle="Mevcut ürünler için boş stok satırları oluşturulur"
        tone="blue"
        icon={<Plus size={18} className="text-blue-600" />}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createWarehouse()}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl disabled:opacity-50"
            >
              Oluştur
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <input
            placeholder="Depo adı *"
            value={newWh.name}
            onChange={(e) => setNewWh({ ...newWh, name: e.target.value })}
            className="w-full px-3 py-2.5 border rounded-xl"
          />
          <input
            placeholder="Kod (örn. DEPO2)"
            value={newWh.code}
            onChange={(e) => setNewWh({ ...newWh, code: e.target.value })}
            className="w-full px-3 py-2.5 border rounded-xl font-mono"
          />
          <textarea
            placeholder="Adres"
            value={newWh.address}
            onChange={(e) => setNewWh({ ...newWh, address: e.target.value })}
            className="w-full px-3 py-2.5 border rounded-xl min-h-[80px]"
          />
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Depo düzenle"
        tone="violet"
        icon={<Pencil size={18} className="text-violet-600" />}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={busy}
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
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            className="w-full px-3 py-2.5 border rounded-xl"
            placeholder="Depo adı"
          />
          <input
            value={editForm.code}
            onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
            className="w-full px-3 py-2.5 border rounded-xl font-mono"
            placeholder="Kod"
          />
          <textarea
            value={editForm.address}
            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            className="w-full px-3 py-2.5 border rounded-xl min-h-[72px]"
            placeholder="Adres"
          />
          <textarea
            value={editForm.notes}
            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            className="w-full px-3 py-2.5 border rounded-xl min-h-[72px]"
            placeholder="Notlar"
          />
        </div>
      </Modal>

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Stok düzeltme"
        subtitle={`Seçili depo: ${selected?.name ?? "—"}`}
        tone="emerald"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdjustOpen(false)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void adjustStock()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl disabled:opacity-50"
            >
              Uygula
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <input
            placeholder="SKU veya barkod"
            value={adjustSku}
            onChange={(e) => setAdjustSku(e.target.value)}
            className="w-full px-3 py-2.5 border rounded-xl font-mono text-sm"
          />
          <input
            type="number"
            placeholder="Adet (+5 / -3)"
            value={adjustDelta}
            onChange={(e) => setAdjustDelta(e.target.value)}
            className="w-full px-3 py-2.5 border rounded-xl"
          />
          <input
            placeholder="Not"
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
            className="w-full px-3 py-2.5 border rounded-xl"
          />
        </div>
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Depolar arası transfer"
        subtitle="Kaynak depodan hedef depoya stok taşı"
        tone="violet"
        icon={<ArrowLeftRight size={18} className="text-violet-600" />}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTransferOpen(false)} className="px-4 py-2 border rounded-xl">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void transferStock()}
              className="px-4 py-2 bg-violet-600 text-white rounded-xl disabled:opacity-50"
            >
              Transfer et
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Kaynak</label>
              <select
                value={transferForm.fromId}
                onChange={(e) => setTransferForm({ ...transferForm, fromId: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-xl text-sm"
              >
                {warehouses.map((w) => (
                  <option key={w.warehouseId} value={w.warehouseId}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Hedef</label>
              <select
                value={transferForm.toId}
                onChange={(e) => setTransferForm({ ...transferForm, toId: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-xl text-sm"
              >
                <option value="">Seçin…</option>
                {warehouses
                  .filter((w) => w.warehouseId !== transferForm.fromId)
                  .map((w) => (
                    <option key={w.warehouseId} value={w.warehouseId}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <input
            placeholder="SKU veya barkod"
            value={transferForm.sku}
            onChange={(e) => setTransferForm({ ...transferForm, sku: e.target.value })}
            className="w-full px-3 py-2.5 border rounded-xl font-mono text-sm"
          />
          <input
            type="number"
            placeholder="Adet"
            value={transferForm.qty}
            onChange={(e) => setTransferForm({ ...transferForm, qty: e.target.value })}
            className="w-full px-3 py-2.5 border rounded-xl"
          />
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteWarehouse()}
        title="Depoyu sil"
        message={`"${deleteTarget?.name}" silinecek. Stoklu depolar silinemez.`}
        variant="danger"
        confirmLabel="Sil"
        loading={busy}
      />
    </div>
  );
}
