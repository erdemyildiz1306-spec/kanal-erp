"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Receipt, Plus, Eye, Pencil, Trash2, Ban, CheckCircle, FileText } from "lucide-react";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";

type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};

type InvoiceRow = {
  _id: string;
  invoiceNumber: string;
  status: string;
  customerName?: string;
  customerTaxId?: string;
  customerAddress?: string;
  orderRef?: string;
  netTotal?: number;
  vatTotal?: number;
  grandTotal?: number;
  lines?: InvoiceLine[];
  externalDocumentId?: string;
};

const defaultLine = (): InvoiceLine => ({
  description: "Ürün / hizmet",
  quantity: 1,
  unitPrice: 0,
  vatRate: 20,
});

export default function InvoicesPage() {
  const [list, setList] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [viewInv, setViewInv] = useState<InvoiceRow | null>(null);
  const [editInv, setEditInv] = useState<InvoiceRow | null>(null);
  const [deleteInv, setDeleteInv] = useState<InvoiceRow | null>(null);
  const [cancelInv, setCancelInv] = useState<InvoiceRow | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([defaultLine()]);

  const resetForm = () => {
    setCustomerName("");
    setCustomerTaxId("");
    setCustomerAddress("");
    setOrderRef("");
    setLines([defaultLine()]);
  };

  const loadFormFromInvoice = (inv: InvoiceRow) => {
    setCustomerName(inv.customerName ?? "");
    setCustomerTaxId(inv.customerTaxId ?? "");
    setCustomerAddress(inv.customerAddress ?? "");
    setOrderRef(inv.orderRef ?? "");
    setLines(
      inv.lines?.length
        ? inv.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            vatRate: l.vatRate,
          }))
        : [defaultLine()]
    );
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invoices");
      const data = await res.json();
      if (data.success) setList(data.invoices || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchList();
  }, []);

  const openCreate = () => {
    setEditInv(null);
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (inv: InvoiceRow) => {
    setEditInv(inv);
    loadFormFromInvoice(inv);
    setFormOpen(true);
  };

  const addLine = () => setLines([...lines, defaultLine()]);

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        customerName,
        customerTaxId,
        customerAddress,
        orderRef,
        lines: lines.filter((l) => l.description.trim()),
        status: "Taslak",
      };
      const res = editInv
        ? await fetch(`/api/invoices/${editInv._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/invoices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (data.success) {
        setFormOpen(false);
        setEditInv(null);
        resetForm();
        void fetchList();
      } else alert(data.error || "Hata.");
    } finally {
      setSaving(false);
    }
  };

  const markIssued = async (inv: InvoiceRow) => {
    const extId = window.prompt("e-Arşiv / e-Fatura referans no (opsiyonel):") ?? "";
    const res = await fetch(`/api/invoices/${inv._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Kesildi",
        ...(extId.trim() ? { externalDocumentId: extId.trim() } : {}),
      }),
    });
    const data = await res.json();
    if (data.success) void fetchList();
    else alert(data.error);
  };

  const confirmDelete = async () => {
    if (!deleteInv) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${deleteInv._id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDeleteInv(null);
        void fetchList();
      } else alert(data.error || "Silinemedi");
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelInv) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${cancelInv._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "İptal" }),
      });
      const data = await res.json();
      if (data.success) {
        setCancelInv(null);
        void fetchList();
      } else alert(data.error || "İptal edilemedi");
    } finally {
      setSaving(false);
    }
  };

  const formFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        <input
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          placeholder="Sipariş / harici referans (opsiyonel)"
          value={orderRef}
          onChange={(e) => setOrderRef(e.target.value)}
        />
        <input
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          placeholder="Müşteri adı / ünvan"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
        <input
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          placeholder="VKN / TCKN (opsiyonel)"
          value={customerTaxId}
          onChange={(e) => setCustomerTaxId(e.target.value)}
        />
        <textarea
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[64px]"
          placeholder="Adres (opsiyonel)"
          value={customerAddress}
          onChange={(e) => setCustomerAddress(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-slate-700">Satırlar</span>
          <button type="button" onClick={addLine} className="text-xs text-blue-600 font-medium">
            + Satır
          </button>
        </div>
        {lines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 text-xs items-end">
            <input
              className="col-span-12 sm:col-span-5 px-2 py-1.5 border border-slate-200 rounded"
              placeholder="Açıklama"
              value={line.description}
              onChange={(e) => {
                const next = [...lines];
                next[idx] = { ...line, description: e.target.value };
                setLines(next);
              }}
            />
            <input
              type="number"
              className="col-span-4 sm:col-span-2 px-2 py-1.5 border border-slate-200 rounded"
              placeholder="Adet"
              value={line.quantity}
              onChange={(e) => {
                const next = [...lines];
                next[idx] = { ...line, quantity: Number(e.target.value) || 0 };
                setLines(next);
              }}
            />
            <input
              type="number"
              className="col-span-4 sm:col-span-2 px-2 py-1.5 border border-slate-200 rounded"
              placeholder="Birim ₺"
              value={line.unitPrice}
              onChange={(e) => {
                const next = [...lines];
                next[idx] = { ...line, unitPrice: Number(e.target.value) || 0 };
                setLines(next);
              }}
            />
            <input
              type="number"
              className="col-span-3 sm:col-span-2 px-2 py-1.5 border border-slate-200 rounded"
              placeholder="KDV %"
              value={line.vatRate}
              onChange={(e) => {
                const next = [...lines];
                next[idx] = { ...line, vatRate: Number(e.target.value) || 0 };
                setLines(next);
              }}
            />
            <button
              type="button"
              onClick={() => removeLine(idx)}
              className="col-span-1 text-red-500 hover:text-red-700"
              title="Satır sil"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
            <Receipt size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Fatura &amp; KDV</h2>
            <p className="text-sm text-slate-500 mt-1">Taslak oluşturma, düzenleme, kesme ve iptal.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/invoices/trendyol"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-orange-200 bg-orange-50 text-orange-800 text-sm font-medium hover:bg-orange-100"
          >
            <FileText size={18} />
            Trendyol Fatura
          </Link>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            <Plus size={18} />
            Yeni taslak
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Yükleniyor…</div>
        ) : list.length === 0 ? (
          <p className="p-10 text-center erp-muted">Kayıtlı fatura yok.</p>
        ) : (
          <>
          <div className="md:hidden space-y-2 p-3">
            {list.map((inv) => (
              <article key={inv._id} className="erp-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-bold text-[var(--erp-text)]">{inv.invoiceNumber}</p>
                    <p className="text-sm erp-muted mt-0.5">{inv.customerName || "—"}</p>
                  </div>
                  <span className="text-base font-bold">₺{inv.grandTotal?.toFixed(2)}</span>
                </div>
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-md font-medium ${
                    inv.status === "Kesildi"
                      ? "bg-green-100 text-green-800"
                      : inv.status === "İptal"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {inv.status}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setViewInv(inv)} className="erp-btn erp-btn-secondary text-sm py-3">
                    Görüntüle
                  </button>
                  {inv.status === "Taslak" ? (
                    <button type="button" onClick={() => openEdit(inv)} className="erp-btn erp-btn-primary text-sm py-3">
                      Düzenle
                    </button>
                  ) : inv.status === "Kesildi" ? (
                    <button type="button" onClick={() => setCancelInv(inv)} className="erp-btn erp-btn-ghost text-sm py-3 text-orange-600">
                      İptal
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                <th className="py-3 px-4 font-medium">Fatura No</th>
                <th className="py-3 px-4 font-medium">Durum</th>
                <th className="py-3 px-4 font-medium">Müşteri</th>
                <th className="py-3 px-4 font-medium">Genel Toplam</th>
                <th className="py-3 px-4 font-medium text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    Kayıtlı fatura yok.
                  </td>
                </tr>
              ) : (
                list.map((inv) => (
                  <tr key={inv._id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                          inv.status === "Kesildi"
                            ? "bg-green-100 text-green-800"
                            : inv.status === "İptal"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">{inv.customerName || "—"}</td>
                    <td className="py-3 px-4 font-semibold">₺{inv.grandTotal?.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => setViewInv(inv)}
                        className="text-xs text-slate-600 hover:text-blue-600 inline-flex items-center gap-0.5"
                      >
                        <Eye size={12} /> Görüntüle
                      </button>
                      {inv.status === "Taslak" && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(inv)}
                            className="text-xs text-blue-600 hover:underline inline-flex items-center gap-0.5"
                          >
                            <Pencil size={12} /> Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => void markIssued(inv)}
                            className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-0.5"
                          >
                            <CheckCircle size={12} /> Kes
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteInv(inv)}
                            className="text-xs text-red-600 hover:underline inline-flex items-center gap-0.5"
                          >
                            <Trash2 size={12} /> Sil
                          </button>
                        </>
                      )}
                      {inv.status === "Kesildi" && (
                        <button
                          type="button"
                          onClick={() => setCancelInv(inv)}
                          className="text-xs text-orange-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          <Ban size={12} /> İptal
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditInv(null);
        }}
        title={editInv ? "Taslak düzenle" : "Yeni fatura taslağı"}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 border rounded-xl text-sm">
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm disabled:opacity-50"
            >
              {saving ? "Kaydediliyor…" : editInv ? "Güncelle" : "Taslak oluştur"}
            </button>
          </div>
        }
      >
        {formFields}
      </Modal>

      <Modal
        open={Boolean(viewInv)}
        onClose={() => setViewInv(null)}
        title={viewInv?.invoiceNumber}
        subtitle={viewInv?.customerName}
        size="lg"
        footer={
          <button type="button" onClick={() => setViewInv(null)} className="px-4 py-2 border rounded-xl text-sm ml-auto">
            Kapat
          </button>
        }
      >
        {viewInv ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">Durum</p>
                <p className="font-semibold">{viewInv.status}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">Toplam</p>
                <p className="font-semibold">₺{viewInv.grandTotal?.toFixed(2)}</p>
              </div>
            </div>
            <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-2 px-3">Açıklama</th>
                  <th className="text-right py-2 px-3">Adet</th>
                  <th className="text-right py-2 px-3">Birim</th>
                  <th className="text-right py-2 px-3">KDV%</th>
                </tr>
              </thead>
              <tbody>
                {(viewInv.lines ?? []).map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-2 px-3">{l.description}</td>
                    <td className="py-2 px-3 text-right">{l.quantity}</td>
                    <td className="py-2 px-3 text-right">₺{l.unitPrice}</td>
                    <td className="py-2 px-3 text-right">{l.vatRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteInv)}
        onClose={() => setDeleteInv(null)}
        onConfirm={() => void confirmDelete()}
        title="Taslağı sil"
        message={`${deleteInv?.invoiceNumber} kalıcı olarak silinecek.`}
        variant="danger"
        confirmLabel="Sil"
        loading={saving}
      />

      <ConfirmModal
        open={Boolean(cancelInv)}
        onClose={() => setCancelInv(null)}
        onConfirm={() => void confirmCancel()}
        title="Faturayı iptal et"
        message={`${cancelInv?.invoiceNumber} iptal durumuna alınacak.`}
        variant="warning"
        confirmLabel="İptal et"
        loading={saving}
      />
    </div>
  );
}
