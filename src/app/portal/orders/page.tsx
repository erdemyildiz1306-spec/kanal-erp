"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ShoppingBag, Eye, Ban, Pencil } from "lucide-react";
import CustomerOrderShop from "@/components/portal/CustomerOrderShop";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { fmtMoney, portalStatusBadge } from "@/lib/portal-ui";

type OrderRow = {
  _id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt?: string;
  notes?: string;
  items?: Array<{ productName?: string; sku?: string; quantity?: number; unitPrice?: number }>;
  cargoCompany?: string;
  trackingNumber?: string;
};

export default function PortalOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopOpen, setShopOpen] = useState(false);
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/orders");
      const data = await res.json();
      if (data.success) setOrders(data.orders ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancelOrder = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/portal/orders/${cancelTarget._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (data.success) {
        setCancelTarget(null);
        setDetail(null);
        await load();
      } else alert(data.error || "İptal edilemedi");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="erp-card px-4 py-3 flex items-center gap-2 flex-1 min-w-[12rem]">
          <ShoppingBag size={18} className="text-[var(--erp-accent)]" />
          <span className="font-bold text-[var(--erp-text)]">Siparişlerim</span>
          <span className="ml-auto text-sm erp-muted">{orders.length} kayıt</span>
        </div>
        <button type="button" onClick={() => setShopOpen(true)} className="erp-btn erp-btn-primary">
          <Plus size={18} /> Sipariş Ver
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="erp-card h-24" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="erp-card p-10 text-center">
          <p className="erp-muted mb-4">Henüz sipariş yok.</p>
          <button type="button" onClick={() => setShopOpen(true)} className="erp-btn erp-btn-primary">
            İlk siparişinizi verin
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o._id} className="erp-card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-lg text-[var(--erp-text)]">{o.orderNumber}</p>
                  {o.createdAt ? (
                    <p className="text-xs erp-muted mt-0.5">
                      {new Date(o.createdAt).toLocaleString("tr-TR")}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg border ${portalStatusBadge(o.status)}`}
                  >
                    {o.status}
                  </span>
                  <p className="font-black text-xl mt-2 tabular-nums">{fmtMoney(Number(o.totalAmount) || 0)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--erp-border)]">
                <button
                  type="button"
                  onClick={() => setDetail(o)}
                  className="erp-btn erp-btn-ghost text-xs min-h-0 py-1.5 px-3"
                >
                  <Eye size={12} /> Detay
                </button>
                {o.status === "Beklemede" && (
                  <button
                    type="button"
                    onClick={() => setCancelTarget(o)}
                    className="erp-btn erp-btn-ghost text-xs min-h-0 py-1.5 px-3 text-red-600 border-red-200"
                  >
                    <Ban size={12} /> İptal
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {shopOpen ? (
        <CustomerOrderShop onClose={() => setShopOpen(false)} onSuccess={() => void load()} />
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-[150] bg-black/50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg">{detail.orderNumber}</h3>
                <p className="text-sm erp-muted">{detail.status}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="erp-btn erp-btn-ghost min-h-0 p-2">
                ✕
              </button>
            </div>
            {detail.notes ? (
              <p className="text-sm bg-[var(--erp-surface-2)] rounded-xl p-3">
                <span className="erp-muted text-xs uppercase">Not</span>
                <br />
                {detail.notes}
              </p>
            ) : null}
            {(detail.cargoCompany || detail.trackingNumber) && (
              <div className="text-sm bg-[var(--erp-surface-2)] rounded-xl p-3 space-y-1">
                <p className="erp-muted text-xs uppercase">Kargo</p>
                {detail.cargoCompany ? <p>{detail.cargoCompany}</p> : null}
                {detail.trackingNumber ? (
                  <p className="font-mono erp-muted">Takip: {detail.trackingNumber}</p>
                ) : null}
              </div>
            )}
            <table className="w-full text-xs">
              <thead className="erp-muted">
                <tr>
                  <th className="text-left py-1">Ürün</th>
                  <th className="text-right py-1">Adet</th>
                  <th className="text-right py-1">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items ?? []).map((it, i) => (
                  <tr key={i} className="border-t border-[var(--erp-border)]">
                    <td className="py-2">{it.productName || it.sku}</td>
                    <td className="py-2 text-right">{it.quantity}</td>
                    <td className="py-2 text-right">
                      {fmtMoney((Number(it.unitPrice) || 0) * (Number(it.quantity) || 1))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-right font-black text-lg">{fmtMoney(Number(detail.totalAmount) || 0)}</p>
            {detail.status === "Beklemede" && (
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(detail);
                  setDetail(null);
                }}
                className="erp-btn erp-btn-ghost w-full text-red-600 border-red-200"
              >
                <Pencil size={14} /> Siparişi iptal et
              </button>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => void cancelOrder()}
        title="Siparişi iptal et"
        message={`${cancelTarget?.orderNumber} iptal edilecek. Stok ve borç bakiyesi güncellenir.`}
        variant="danger"
        confirmLabel="İptal et"
        loading={cancelling}
      />
    </div>
  );
}
