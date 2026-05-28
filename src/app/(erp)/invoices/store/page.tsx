"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Receipt,
  RefreshCw,
  FileText,
  Link2,
  Upload,
  Settings,
  CheckCircle,
  AlertCircle,
  Store,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";

type PendingOrder = {
  _id: string;
  orderNumber: string;
  status: string;
  customerName?: string;
  totalAmount?: number;
  platformOrderId?: string;
  createdAt?: string;
  itemCount?: number;
  storeInvoice?: {
    status?: string;
    invoiceNumber?: string;
    lastError?: string;
  } | null;
};

export default function StoreInvoicesPage() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [linkModal, setLinkModal] = useState<PendingOrder | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [fileModal, setFileModal] = useState<PendingOrder | null>(null);
  const [filePick, setFilePick] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/invoices/pending", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) setOrders(data.orders || []);
      else setBanner({ kind: "err", text: data.error || "Liste alınamadı." });
    } catch {
      setBanner({ kind: "err", text: "Bağlantı hatası." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runIssue = async (orderId: string, mode: "efaturam" | "link" | "file", extra?: FormData) => {
    setBusyId(orderId);
    setBanner(null);
    try {
      let res: Response;
      if (mode === "file" && extra) {
        res = await fetch("/api/store/invoices/upload-file", {
          method: "POST",
          credentials: "include",
          body: extra,
        });
      } else if (mode === "link") {
        res = await fetch("/api/store/invoices/send-link", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            invoiceLink: linkValue.trim(),
            invoiceNumber: invoiceNo.trim() || undefined,
          }),
        });
      } else {
        res = await fetch("/api/store/invoices/issue", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, mode: "efaturam" }),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBanner({ kind: "err", text: data.error || "İşlem başarısız." });
        return;
      }
      setBanner({
        kind: "ok",
        text: `Mağazaya fatura gönderildi: ${data.invoiceNumber || data.orderNumber || orderId}`,
      });
      setLinkModal(null);
      setFileModal(null);
      setLinkValue("");
      setFilePick(null);
      await load();
    } catch {
      setBanner({ kind: "err", text: "İstek başarısız." });
    } finally {
      setBusyId(null);
    }
  };

  const submitFile = async () => {
    if (!fileModal || !filePick) return;
    const fd = new FormData();
    fd.append("orderId", fileModal._id);
    fd.append("file", filePick);
    if (invoiceNo.trim()) fd.append("invoiceNumber", invoiceNo.trim());
    await runIssue(fileModal._id, "file", fd);
  };

  if (loading) return <Spinner label="Mağaza faturaları yükleniyor…" />;

  return (
    <div className="erp-page max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Mağaza Fatura"
        subtitle="E-Faturam / e-Arşiv kesip özel mağazanıza fatura linki veya dosyası gönderin"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/settings"
              className="erp-btn erp-btn-secondary text-sm inline-flex items-center gap-2"
            >
              <Settings size={16} />
              Mağaza & E-Faturam ayarları
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="erp-btn erp-btn-secondary text-sm inline-flex items-center gap-2"
            >
              <RefreshCw size={16} />
              Yenile
            </button>
          </div>
        }
      />

      <div className="erp-card p-4 text-sm text-slate-600 space-y-2">
        <p className="flex items-center gap-2 font-medium text-slate-800">
          <Store size={16} className="text-indigo-600" />
          Özel mağaza API sözleşmesi
        </p>
        <p>
          ERP, kesilen faturayı{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">POST {"{webApiUrl}/orders/invoice}"}</code>{" "}
          uç noktasına Bearer token ile bildirir. Tam URL için Ayarlar → Mağaza API → Fatura bildirim adresi
          alanını kullanın.
        </p>
        <pre className="text-xs bg-slate-50 border border-slate-100 rounded-lg p-3 overflow-x-auto">
{`{
  "source": "kanal-erp",
  "orderNumber": "WEB-12345",
  "platformOrderId": "uuid-...",
  "invoiceNumber": "WEB2026000000001",
  "invoiceLink": "https://...",
  "invoiceUuid": "...",
  "invoiceDateTime": 1716123456789
}`}
        </pre>
      </div>

      {banner ? (
        <div
          className={`erp-card px-4 py-3 text-sm flex items-start gap-2 ${
            banner.kind === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          {banner.kind === "ok" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{banner.text}</span>
        </div>
      ) : null}

      <div className="erp-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Receipt size={18} className="text-indigo-600" />
          <h2 className="font-semibold text-slate-800">Fatura bekleyen mağaza siparişleri</h2>
          <span className="text-xs text-slate-500 ml-auto">{orders.length} kayıt</span>
        </div>

        {orders.length === 0 ? (
          <p className="p-8 text-center erp-muted">Fatura bekleyen mağaza siparişi yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Sipariş</th>
                  <th className="py-3 px-4">Müşteri</th>
                  <th className="py-3 px-4">Mağaza ID</th>
                  <th className="py-3 px-4">Tutar</th>
                  <th className="py-3 px-4">Durum</th>
                  <th className="py-3 px-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono text-xs">{o.orderNumber}</td>
                    <td className="py-3 px-4">{o.customerName || "—"}</td>
                    <td className="py-3 px-4 font-mono text-xs">{o.platformOrderId || "—"}</td>
                    <td className="py-3 px-4">
                      {o.totalAmount != null
                        ? `₺${Number(o.totalAmount).toLocaleString("tr-TR")}`
                        : "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs">{o.status}</span>
                      {o.storeInvoice?.lastError ? (
                        <p className="text-xs text-red-600 mt-0.5 max-w-[200px] truncate">
                          {o.storeInvoice.lastError}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={busyId === o._id}
                          onClick={() => void runIssue(o._id, "efaturam")}
                          className="erp-btn erp-btn-primary text-xs px-2 py-1 inline-flex items-center gap-1"
                          title="E-Faturam ile kes ve mağazaya gönder"
                        >
                          <FileText size={14} />
                          E-Faturam
                        </button>
                        <button
                          type="button"
                          disabled={busyId === o._id}
                          onClick={() => {
                            setLinkModal(o);
                            setLinkValue("");
                            setInvoiceNo("");
                          }}
                          className="erp-btn erp-btn-secondary text-xs px-2 py-1 inline-flex items-center gap-1"
                        >
                          <Link2 size={14} />
                          Link
                        </button>
                        <button
                          type="button"
                          disabled={busyId === o._id}
                          onClick={() => {
                            setFileModal(o);
                            setFilePick(null);
                            setInvoiceNo("");
                          }}
                          className="erp-btn erp-btn-secondary text-xs px-2 py-1 inline-flex items-center gap-1"
                        >
                          <Upload size={14} />
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!linkModal}
        onClose={() => setLinkModal(null)}
        title={`Fatura linki — ${linkModal?.orderNumber ?? ""}`}
      >
        <div className="space-y-3">
          <label className="block text-sm">
            e-Arşiv / e-Fatura HTTPS linki
            <input
              type="url"
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="block text-sm">
            Fatura no (opsiyonel)
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="WEB2026000000001"
            />
          </label>
          <button
            type="button"
            disabled={!linkValue.trim() || busyId === linkModal?._id}
            onClick={() => linkModal && void runIssue(linkModal._id, "link")}
            className="erp-btn erp-btn-primary w-full"
          >
            Mağazaya gönder
          </button>
        </div>
      </Modal>

      <Modal
        open={!!fileModal}
        onClose={() => setFileModal(null)}
        title={`Fatura dosyası — ${fileModal?.orderNumber ?? ""}`}
      >
        <div className="space-y-3">
          <input
            type="file"
            accept=".pdf,image/jpeg,image/png"
            onChange={(e) => setFilePick(e.target.files?.[0] ?? null)}
          />
          <label className="block text-sm">
            Fatura no (opsiyonel)
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!filePick || busyId === fileModal?._id}
            onClick={() => void submitFile()}
            className="erp-btn erp-btn-primary w-full"
          >
            PDF gönder (Mağaza)
          </button>
        </div>
      </Modal>
    </div>
  );
}
