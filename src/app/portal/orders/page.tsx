"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ShoppingBag, Eye, Ban, Pencil } from "lucide-react";
import CustomerOrderShop from "@/components/portal/CustomerOrderShop";
import ConfirmModal from "@/components/ui/ConfirmModal";

function fmt(n: number) {
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const statusStyle: Record<string, string> = {
  Beklemede: "bg-amber-500/20 text-amber-200 border-amber-400/30",
  Yeni: "bg-sky-500/20 text-sky-200 border-sky-400/30",
  Hazırlanıyor: "bg-violet-500/20 text-violet-200 border-violet-400/30",
  Kargolandı: "bg-blue-500/20 text-blue-200 border-blue-400/30",
  "Teslim Edildi": "bg-emerald-500/20 text-emerald-200 border-emerald-400/30",
  "İptal Edildi": "bg-red-500/20 text-red-200 border-red-400/30",
};

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
        <div className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3 flex items-center gap-2">
          <ShoppingBag size={18} />
          <span className="font-bold">Siparişlerim</span>
          <span className="ml-auto text-sm text-violet-200">{orders.length} kayıt</span>
        </div>
        <button
          type="button"
          onClick={() => setShopOpen(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 font-bold shadow-lg hover:scale-[1.02] transition-transform"
        >
          <Plus size={18} /> Sipariş Ver
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/10" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-white/5 border border-white/10">
          <p className="text-violet-200 mb-4">Henüz sipariş yok.</p>
          <button
            type="button"
            onClick={() => setShopOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-violet-600 font-semibold"
          >
            İlk siparişinizi verin
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li
              key={o._id}
              className="rounded-2xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-lg">{o.orderNumber}</p>
                  {o.createdAt ? (
                    <p className="text-xs text-violet-300 mt-0.5">
                      {new Date(o.createdAt).toLocaleString("tr-TR")}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg border ${
                      statusStyle[o.status] ?? "bg-white/10 text-violet-200 border-white/20"
                    }`}
                  >
                    {o.status}
                  </span>
                  <p className="font-black text-xl mt-2 tabular-nums">{fmt(Number(o.totalAmount) || 0)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setDetail(o)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 inline-flex items-center gap-1"
                >
                  <Eye size={12} /> Detay
                </button>
                {o.status === "Beklemede" && (
                  <button
                    type="button"
                    onClick={() => setCancelTarget(o)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500/20 text-red-200 inline-flex items-center gap-1"
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
        <CustomerOrderShop
          onClose={() => setShopOpen(false)}
          onSuccess={() => void load()}
        />
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg">{detail.orderNumber}</h3>
                <p className="text-sm text-violet-300">{detail.status}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="text-violet-300 hover:text-white">
                ✕
              </button>
            </div>
            {detail.notes ? (
              <p className="text-sm bg-white/5 rounded-xl p-3">
                <span className="text-violet-400 text-xs uppercase">Not</span>
                <br />
                {detail.notes}
              </p>
            ) : null}
            {(detail.cargoCompany || detail.trackingNumber) && (
              <div className="text-sm bg-white/5 rounded-xl p-3 space-y-1">
                <p className="text-violet-400 text-xs uppercase">Kargo</p>
                {detail.cargoCompany ? <p>{detail.cargoCompany}</p> : null}
                {detail.trackingNumber ? (
                  <p className="font-mono text-violet-200">Takip: {detail.trackingNumber}</p>
                ) : null}
              </div>
            )}
            <table className="w-full text-xs">
              <thead className="text-violet-400">
                <tr>
                  <th className="text-left py-1">Ürün</th>
                  <th className="text-right py-1">Adet</th>
                  <th className="text-right py-1">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items ?? []).map((it, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-2">{it.productName || it.sku}</td>
                    <td className="py-2 text-right">{it.quantity}</td>
                    <td className="py-2 text-right">
                      {fmt((Number(it.unitPrice) || 0) * (Number(it.quantity) || 1))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-right font-black text-lg">{fmt(Number(detail.totalAmount) || 0)}</p>
            {detail.status === "Beklemede" && (
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(detail);
                  setDetail(null);
                }}
                className="w-full py-2 rounded-xl bg-red-500/20 text-red-200 text-sm font-semibold flex items-center justify-center gap-1"
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
