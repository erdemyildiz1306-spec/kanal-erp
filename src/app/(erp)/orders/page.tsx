"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, Filter, Printer, Eye, DownloadCloud, CheckCircle, RefreshCw, DollarSign, ListChecks, RotateCcw, XCircle, Package } from "lucide-react";
import PrintableLabel from "@/components/orders/PrintableLabel";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { turkishTextIncludes } from "@/lib/search-text";

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("Tümü");
  const [isSyncing, setIsSyncing] = useState(false);
  const [labelSettings, setLabelSettings] = useState<{
    storeName: string;
    printPackageContents: boolean;
  }>({ storeName: "Stok ERP", printPackageContents: true });
  const [mounted, setMounted] = useState(false);
  const [pickingOpen, setPickingOpen] = useState(false);
  const [pickingRows, setPickingRows] = useState<
    Array<{ barcode: string; productName: string; qty: number; orderNumbers: string[] }>
  >([]);
  const [pickingLoading, setPickingLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [pageBanner, setPageBanner] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    status: string;
    variant: "danger" | "warning";
  } | null>(null);
  const [cargoForm, setCargoForm] = useState({
    cargoCompany: "",
    trackingNumber: "",
    packageId: "",
  });
  const [cargoSaving, setCargoSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const triggerPrint = () => {
    requestAnimationFrame(() => {
      window.setTimeout(() => window.print(), 100);
    });
  };

  const loadPrintSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?t=" + Date.now(), {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success && data.settings) {
        const s = data.settings as Record<string, unknown>;
        setLabelSettings({
          storeName:
            typeof s.storeName === "string" && s.storeName.trim() !== ""
              ? s.storeName.trim()
              : "Stok ERP",
          printPackageContents: Boolean(s.printPackageContents ?? true),
        });
      }
    } catch {
      /* mevcut ayarlar kalsın */
    }
  }, []);

  useEffect(() => {
    void loadPrintSettings();
  }, [loadPrintSettings]);

  useEffect(() => {
    if (isPrintPreviewOpen) void loadPrintSettings();
  }, [isPrintPreviewOpen, loadPrintSettings]);

  // Siparişleri Veritabanından Çekme
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/orders');
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error("Siparişler yüklenirken hata oluştu:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const onSync = () => void fetchOrders();
    window.addEventListener("erp-orders-synced", onSync);
    return () => window.removeEventListener("erp-orders-synced", onSync);
  }, []);

  const orderDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const oid = params.get("orderId");
    const openKey = params.get("_open");
    if (!oid || !openKey || orderDeepLinkRef.current === openKey) return;
    const order = orders.find((o) => String(o._id) === oid);
    if (!order) return;
    orderDeepLinkRef.current = openKey;
    setSelectedOrder(order);
    setIsViewModalOpen(true);
    window.history.replaceState(null, "", "/orders");
  }, [loading, orders]);

  useEffect(() => {
    const onNavigateOrder = (ev: Event) => {
      const id = String((ev as CustomEvent<{ id?: string }>).detail?.id ?? "");
      if (!id) return;
      const order = orders.find((o) => String(o._id) === id);
      if (order) {
        setSelectedOrder(order);
        setIsViewModalOpen(true);
      }
    };
    window.addEventListener("erp-navigate-order", onNavigateOrder);
    return () =>
      window.removeEventListener("erp-navigate-order", onNavigateOrder);
  }, [orders]);

  const handlePrint = async (order: any) => {
    try {
      const res = await fetch(`/api/orders/process-label?id=${order._id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Etiket işlemi başarısız.");
        return;
      }
      if (data.warning) alert(data.warning);
      const updated = data.order ?? { ...order, status: "Hazırlanıyor" };
      setSelectedOrder(updated);
      setIsPrintPreviewOpen(true);
      fetchOrders();
    } catch {
      alert("Etiket işlemi sırasında bağlantı hatası.");
    }
  };

  const syncTrendyolOrders = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/trendyol/sync-orders');
      const data = await response.json();
      
      if (data.success) {
        alert(data.message);
        fetchOrders();
      } else {
        alert(data.error || "Trendyol sipariş senkronizasyonu başarısız.");
      }
    } catch (error: any) {
      alert("Hata: Trendyol sipariş senkronizasyonu başarısız oldu.");
    } finally {
      setIsSyncing(false);
    }
  };

  const syncWebOrders = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/store/sync-orders");
      const data = await res.json();
      if (data.success) {
        alert(data.message || `${data.count ?? 0} mağaza siparişi aktarıldı.`);
        fetchOrders();
      } else {
        alert(data.error || "Mağaza sipariş senkronizasyonu başarısız.");
      }
    } catch {
      alert("Bağlantı hatası.");
    } finally {
      setIsSyncing(false);
    }
  };

  const loadPickingList = async () => {
    setPickingLoading(true);
    try {
      const res = await fetch("/api/trendyol/picking-list?status=Beklemede,Hazırlanıyor");
      const data = await res.json();
      if (data.success) {
        setPickingRows(data.rows ?? []);
        setPickingOpen(true);
      } else {
        alert(data.error || "Picking listesi alınamadı.");
      }
    } catch {
      alert("Bağlantı hatası.");
    } finally {
      setPickingLoading(false);
    }
  };

  useEffect(() => {
    if (selectedOrder) {
      setCargoForm({
        cargoCompany: selectedOrder.cargoCompany || "",
        trackingNumber: selectedOrder.trackingNumber || "",
        packageId: selectedOrder.packageId || "",
      });
    }
  }, [selectedOrder]);

  const saveCargoInfo = async () => {
    if (!selectedOrder) return;
    setCargoSaving(true);
    try {
      const res = await fetch(`/api/orders?id=${selectedOrder._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cargoForm),
      });
      const data = await res.json();
      if (data.success) {
        if (data.order) setSelectedOrder(data.order);
        setPageBanner({ kind: "success", message: "Kargo bilgileri kaydedildi." });
        await fetchOrders();
      } else {
        setPageBanner({ kind: "error", message: data.error || "Kayıt hatası." });
      }
    } catch {
      setPageBanner({ kind: "error", message: "Bağlantı hatası." });
    } finally {
      setCargoSaving(false);
    }
  };

  const updateOrderStatus = async (
    orderId: string,
    newStatus: string,
    opts?: { keepModalOpen?: boolean }
  ) => {
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/orders?id=${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        const msg =
          data.message ||
          data.warning ||
          `Sipariş durumu "${newStatus}" olarak güncellendi.`;
        const isStockWarning =
          typeof data.message === "string" &&
          data.message.includes("stok iadesi yapılamadı");
        setPageBanner({
          kind: isStockWarning ? "error" : "success",
          message: msg,
        });
        if (data.order) setSelectedOrder(data.order);
        await fetchOrders();
        if (!opts?.keepModalOpen) setIsViewModalOpen(false);
      } else {
        setPageBanner({
          kind: "error",
          message: data.error || "Güncelleme hatası.",
        });
      }
    } catch (err: unknown) {
      setPageBanner({
        kind: "error",
        message: err instanceof Error ? err.message : "Bağlantı hatası.",
      });
    } finally {
      setStatusUpdating(false);
      setConfirmAction(null);
    }
  };

  const requestStatusChange = (newStatus: string) => {
    if (!selectedOrder) return;
    const isReversal =
      newStatus === "İptal Edildi" || newStatus === "İade Edildi";
    if (isReversal) {
      const lineCount = selectedOrder.items?.length ?? 0;
      const stockNote = selectedOrder.stockApplied
        ? `Stok daha önce düşülmüştü. ${lineCount} kalem için depoya otomatik stok iadesi yapılacak.`
        : "Bu siparişte stok düşümü yok; yalnızca durum güncellenecek.";
      setConfirmAction({
        title:
          newStatus === "İptal Edildi"
            ? "Siparişi iptal et"
            : "Siparişi iade et",
        message: stockNote,
        status: newStatus,
        variant: "danger",
      });
      return;
    }
    void updateOrderStatus(selectedOrder._id, newStatus);
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "Beklemede":
        return "bg-amber-100 text-amber-800";
      case "Yeni":
        return "bg-green-100 text-green-800";
      case "Hazırlanıyor":
        return "bg-blue-100 text-blue-800";
      case "Kargolandı":
        return "bg-purple-100 text-purple-800";
      case "Teslim Edildi":
        return "bg-emerald-100 text-emerald-800";
      case "İptal Edildi":
        return "bg-red-100 text-red-800";
      case "İade Edildi":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-slate-100 text-slate-800";
    }
  };



  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      turkishTextIncludes(order.orderNumber ?? "", searchTerm) ||
      turkishTextIncludes(order.customerName ?? "", searchTerm) ||
      (Array.isArray(order.items) &&
        order.items.some(
          (item: { productName?: string; sku?: string }) =>
            turkishTextIncludes(item.productName ?? "", searchTerm) ||
            turkishTextIncludes(item.sku ?? "", searchTerm)
        ));
      
    const matchesTab = activeTab === "Tümü" || order.status === activeTab;
    return matchesSearch && matchesTab;
  });

  /** Önce açık süreçteki siparişler, sonra iptal/iade, en sonda teslim edilmiş; aynı grupta yeniden eskiye */
  const statusBucket = (status: string): number => {
    if (status === "Teslim Edildi") return 2;
    if (status === "İptal Edildi" || status === "İade Edildi") return 1;
    return 0;
  };

  const sortedFilteredOrders = [...filteredOrders].sort((a, b) => {
    const da = statusBucket(String(a.status ?? ""));
    const db = statusBucket(String(b.status ?? ""));
    if (da !== db) return da - db;
    const ta = new Date(a.createdAt ?? a.updatedAt ?? 0).getTime();
    const tb = new Date(b.createdAt ?? b.updatedAt ?? 0).getTime();
    return tb - ta;
  });

  // Finansal özet hesaplamaları
  const financialSummary = filteredOrders.reduce((acc, order) => {
    acc.revenue += order.totalAmount || 0;
    acc.cost += order.costAmount || 0;
    acc.profit += order.profitAmount || 0;
    return acc;
  }, { revenue: 0, cost: 0, profit: 0 });

  return (
    <div className="space-y-6 relative">
      {/* Finansal Kar Analiz Bannerı */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 print:hidden">
        <div className="erp-card p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
            <DollarSign size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-xs erp-muted font-semibold truncate">Toplam Ciro</p>
            <h4 className="text-lg font-bold text-[var(--erp-text)]">₺{financialSummary.revenue.toFixed(2)}</h4>
          </div>
        </div>
        <div className="erp-card p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-red-500/10 text-red-600">
            <DollarSign size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-xs erp-muted font-semibold truncate">Alış Maliyeti</p>
            <h4 className="text-lg font-bold text-[var(--erp-text)]">₺{financialSummary.cost.toFixed(2)}</h4>
          </div>
        </div>
        <div className="erp-card p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
            <DollarSign size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-xs erp-muted font-semibold truncate">Net Kâr</p>
            <h4 className="text-lg font-bold text-emerald-600">₺{financialSummary.profit.toFixed(2)}</h4>
          </div>
        </div>
      </div>

      {pageBanner && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-3 print:hidden ${
            pageBanner.kind === "success"
              ? "bg-green-50 border-green-200 text-green-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          <p className="text-sm">{pageBanner.message}</p>
          <button
            type="button"
            onClick={() => setPageBanner(null)}
            className="text-sm opacity-70 hover:opacity-100 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 print:hidden">
        <div>
          <h2 className="erp-page-title">Siparişler</h2>
          <p className="text-sm erp-muted mt-1 hidden sm:block">
            Trendyol siparişleri önce <strong>Beklemede</strong> gelir; etiket
            yazdırıldığında <strong>Hazırlanıyor</strong> olur, stok düşer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadPickingList()}
            disabled={pickingLoading}
            className="erp-btn erp-btn-secondary text-sm flex-1 sm:flex-none min-w-[8rem]"
          >
            <ListChecks size={18} />
            <span>{pickingLoading ? "Liste…" : "Picking"}</span>
          </button>
          <button
            onClick={syncTrendyolOrders}
            disabled={isSyncing}
            className="erp-btn erp-btn-secondary text-sm flex-1 sm:flex-none min-w-[8rem] bg-orange-500/10 text-orange-700 dark:text-orange-300"
          >
            <DownloadCloud size={18} />
            <span>Trendyol</span>
          </button>
          <button
            onClick={syncWebOrders}
            disabled={isSyncing}
            className="erp-btn erp-btn-secondary text-sm flex-1 sm:flex-none min-w-[8rem] bg-blue-500/10 text-blue-700 dark:text-blue-300"
          >
            <DownloadCloud size={18} />
            <span>Site</span>
          </button>
        </div>
      </div>

      <div className="erp-card overflow-hidden print:hidden">
        <div className="p-3 md:p-4 border-b border-[var(--erp-border)] space-y-3 bg-[var(--erp-surface-2)]">
          <div className="erp-scroll-x flex gap-2 pb-1">
            {["Tümü", "Beklemede", "Hazırlanıyor", "Kargolandı", "Teslim Edildi", "İptal Edildi", "İade Edildi"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold transition-all touch-target-sm ${
                  activeTab === tab
                    ? "bg-[var(--erp-accent)] text-white dark:text-[#0f1210]"
                    : "bg-[var(--erp-surface)] text-[var(--erp-text-muted)] border border-[var(--erp-border)]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="relative w-full">
            <input
              type="search"
              placeholder="Sipariş no veya müşteri ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="erp-input pl-11 text-sm"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--erp-text-muted)]" size={18} />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center erp-muted font-medium">Siparişler yükleniyor…</div>
        ) : sortedFilteredOrders.length === 0 ? (
          <div className="py-12 text-center erp-muted">Aradığınız kriterlere uygun sipariş bulunamadı.</div>
        ) : (
          <>
          <div className="md:hidden divide-y divide-[var(--erp-border)]">
            {sortedFilteredOrders.map((order) => {
              const profitMargin = order.totalAmount > 0 ? ((order.profitAmount / order.totalAmount) * 100).toFixed(0) : "0";
              return (
                <article key={order._id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-[var(--erp-text)]">{order.orderNumber}</p>
                      <p className="text-sm erp-muted mt-0.5 truncate">{order.customerName}</p>
                    </div>
                    <span className="text-base font-bold text-[var(--erp-text)] shrink-0">
                      ₺{order.totalAmount?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {order.platform === "trendyol" ? (
                      <span className="px-2 py-1 rounded-lg bg-orange-500/15 text-orange-700 dark:text-orange-300 font-semibold">Trendyol</span>
                    ) : order.platform === "web" ? (
                      <span className="px-2 py-1 rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold">Web</span>
                    ) : (
                      <span className="px-2 py-1 rounded-lg bg-[var(--erp-accent-soft)] text-[var(--erp-accent)] font-semibold">Diğer</span>
                    )}
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${statusBadgeClass(order.status)}`}>
                      {order.status}
                    </span>
                    <span className="erp-muted">Kâr ₺{order.profitAmount?.toFixed(2) || "0.00"} · %{profitMargin}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setSelectedOrder(order); setIsViewModalOpen(true); }}
                      className="erp-btn erp-btn-secondary text-sm py-3"
                    >
                      <Eye size={18} />
                      Görüntüle
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrint(order)}
                      className="erp-btn erp-btn-primary text-sm py-3"
                    >
                      <Printer size={18} />
                      Etiket
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-sm text-slate-500 bg-white">
                <th className="py-4 px-6 font-medium">Sipariş No</th>
                <th className="py-4 px-6 font-medium">Müşteri</th>
                <th className="py-4 px-6 font-medium">Platform</th>
                <th className="py-4 px-6 font-medium">Satış Tutarı</th>
                <th className="py-4 px-6 font-medium">Kar / Marj</th>
                <th className="py-4 px-6 font-medium">Durum</th>
                <th className="py-4 px-6 font-medium text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {sortedFilteredOrders.map((order) => {
                const profitMargin = order.totalAmount > 0 ? ((order.profitAmount / order.totalAmount) * 100).toFixed(0) : '0';
                return (
                  <tr key={order._id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors text-sm">
                    <td className="py-4 px-6 font-bold text-slate-800">{order.orderNumber}</td>
                    <td className="py-4 px-6 font-medium text-slate-700">
                      <div>{order.customerName}</div>
                      <div className="text-xs text-slate-400 font-normal">{order.cargoCompany} | Takip: {order.trackingNumber || 'Girmedi'}</div>
                    </td>
                    <td className="py-4 px-6">
                      {order.platform === 'trendyol' ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                          Trendyol
                        </span>
                      ) : order.platform === 'web' ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                          Web Sitesi
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                          Mağaza / Diğer
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 font-semibold text-slate-800">₺{order.totalAmount?.toFixed(2) || '0.00'}</td>
                    <td className="py-4 px-6">
                      <div className="font-semibold text-green-700">₺{order.profitAmount?.toFixed(2) || '0.00'}</div>
                      <div className="text-[10px] text-slate-400 font-normal">Marj: %{profitMargin}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${statusBadgeClass(order.status)}`}>
                        {order.status}
                      </span>
                      {order.stockApplied ? (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600" title="Stok düşüldü">
                          Stok −
                        </span>
                      ) : null}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end space-x-2">
                        <button 
                          onClick={() => { setSelectedOrder(order); setIsViewModalOpen(true); }}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100" title="Görüntüle"
                        >
                          <Eye size={18} />
                        </button>
                        <button 
                          onClick={() => handlePrint(order)}
                          className="p-2 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors border border-transparent hover:border-orange-100" title="Etiket Yazdır (işleme al + stok düş)"
                        >
                          <Printer size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>

      {/* Sipariş Detay Modalı */}
      <Modal
        open={isViewModalOpen && !!selectedOrder}
        onClose={() => setIsViewModalOpen(false)}
        title={`Sipariş ${selectedOrder?.orderNumber ?? ""}`}
        subtitle={selectedOrder?.customerName}
        size="lg"
        footer={
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex flex-wrap gap-2">
              {selectedOrder?.status !== "İptal Edildi" &&
              selectedOrder?.status !== "İade Edildi" ? (
                <>
                  {selectedOrder?.status === "Beklemede" && (
                    <button
                      type="button"
                      onClick={() => requestStatusChange("Hazırlanıyor")}
                      disabled={statusUpdating}
                      className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-xs font-semibold hover:bg-blue-200 disabled:opacity-50"
                    >
                      İşleme Al
                    </button>
                  )}
                  {selectedOrder?.status === "Hazırlanıyor" && (
                    <button
                      type="button"
                      onClick={() => requestStatusChange("Kargolandı")}
                      disabled={statusUpdating}
                      className="px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg text-xs font-semibold hover:bg-purple-200 disabled:opacity-50"
                    >
                      Kargolandı
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => requestStatusChange("Teslim Edildi")}
                    disabled={statusUpdating}
                    className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold hover:bg-emerald-200 disabled:opacity-50"
                  >
                    Teslim Edildi
                  </button>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedOrder?.status !== "İptal Edildi" &&
                selectedOrder?.status !== "İade Edildi" && (
                  <>
                    <button
                      type="button"
                      onClick={() => requestStatusChange("İptal Edildi")}
                      disabled={statusUpdating}
                      className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <XCircle size={14} />
                      İptal + Stok İadesi
                    </button>
                    <button
                      type="button"
                      onClick={() => requestStatusChange("İade Edildi")}
                      disabled={statusUpdating}
                      className="px-3 py-1.5 bg-orange-50 text-orange-800 border border-orange-200 rounded-lg text-xs font-semibold hover:bg-orange-100 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <RotateCcw size={14} />
                      İade + Stok İadesi
                    </button>
                  </>
                )}
              <button
                type="button"
                onClick={() => setIsViewModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm"
              >
                Kapat
              </button>
            </div>
          </div>
        }
      >
        {selectedOrder && (
          <div className="space-y-5 text-sm text-slate-700">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">Platform</p>
                <p className="font-semibold capitalize">{selectedOrder.platform}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">Durum</p>
                <span className={`inline-flex mt-1 px-2 py-0.5 rounded text-xs font-semibold ${statusBadgeClass(selectedOrder.status)}`}>
                  {selectedOrder.status}
                </span>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">Stok</p>
                <p className="font-semibold flex items-center gap-1">
                  <Package size={14} />
                  {selectedOrder.stockApplied ? "Düşüldü" : "Düşülmedi"}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">Ciro</p>
                <p className="font-semibold">₺{selectedOrder.totalAmount?.toFixed(2)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">Maliyet</p>
                <p className="font-semibold">₺{selectedOrder.costAmount?.toFixed(2)}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-xs text-emerald-700">Net Kar</p>
                <p className="font-semibold text-emerald-800">₺{selectedOrder.profitAmount?.toFixed(2)}</p>
              </div>
            </div>

            {selectedOrder.customerAddress && (
              <p className="text-sm border-t border-slate-100 pt-3">
                <strong>Teslimat:</strong> {selectedOrder.customerAddress}
              </p>
            )}

            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-slate-800">Kargo bilgileri</h4>
                <button
                  type="button"
                  onClick={() => void saveCargoInfo()}
                  disabled={cargoSaving}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {cargoSaving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">Kargo firması</span>
                  <input
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="Örn. DHL eCommerce"
                    value={cargoForm.cargoCompany}
                    onChange={(e) => setCargoForm({ ...cargoForm, cargoCompany: e.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">Takip no</span>
                  <input
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="Kargo takip numarası"
                    value={cargoForm.trackingNumber}
                    onChange={(e) => setCargoForm({ ...cargoForm, trackingNumber: e.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">Paket no</span>
                  <input
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="Trendyol paket no"
                    value={cargoForm.packageId}
                    onChange={(e) => setCargoForm({ ...cargoForm, packageId: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {(selectedOrder.status === "İptal Edildi" ||
              selectedOrder.status === "İade Edildi") && (
              <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 text-xs text-orange-900">
                İptal/iade durumunda stok daha önce düşülmüşse otomatik geri yüklenir.
                Trendyol sync veya webhook ile gelen iptal/iade siparişlerinde de aynı kural uygulanır.
              </div>
            )}

            <div>
              <h4 className="font-bold text-slate-800 mb-2">Sipariş Kalemleri</h4>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left py-2 px-3">Ürün</th>
                      <th className="text-left py-2 px-3">SKU / Barkod</th>
                      <th className="text-right py-2 px-3">Adet</th>
                      <th className="text-right py-2 px-3">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items?.map((item: any, idx: number) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="py-2 px-3 font-medium">{item.productName}</td>
                        <td className="py-2 px-3 text-slate-500">
                          {item.sku}
                          {item.barcode ? ` · ${item.barcode}` : ""}
                        </td>
                        <td className="py-2 px-3 text-right">{item.quantity}</td>
                        <td className="py-2 px-3 text-right font-semibold">
                          ₺{((item.unitPrice || 0) * (item.quantity || 1)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (selectedOrder && confirmAction) {
            void updateOrderStatus(selectedOrder._id, confirmAction.status);
          }
        }}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        confirmLabel={confirmAction?.status === "İptal Edildi" ? "İptal et" : "İade et"}
        variant="danger"
        loading={statusUpdating}
      />

      <Modal
        open={pickingOpen}
        onClose={() => setPickingOpen(false)}
        title="Trendyol Picking Listesi"
        subtitle="Beklemede + Hazırlanıyor — barkoda göre toplam adet"
        size="lg"
      >
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Barkod</th>
                <th className="text-left px-4 py-3">Ürün</th>
                <th className="text-right px-4 py-3">Adet</th>
                <th className="text-left px-4 py-3">Siparişler</th>
              </tr>
            </thead>
            <tbody>
              {pickingRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Toplanacak kalem yok.
                  </td>
                </tr>
              ) : (
                pickingRows.map((row) => (
                  <tr key={row.barcode || row.productName} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{row.barcode || "—"}</td>
                    <td className="px-4 py-3">{row.productName}</td>
                    <td className="px-4 py-3 text-right font-bold">{row.qty}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {row.orderNumbers.slice(0, 4).join(", ")}
                      {row.orderNumbers.length > 4 ? "…" : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      {mounted &&
        isPrintPreviewOpen &&
        selectedOrder &&
        createPortal(
          <div
            id="erp-print-overlay"
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center z-[10000] overflow-y-auto print:bg-white print:overflow-visible"
          >
            <div
              id="erp-print-toolbar"
              className="w-full bg-slate-800 p-4 flex justify-between items-center sticky top-0 z-[10001] shadow-md"
            >
              <div className="text-white">
                <h3 className="font-bold text-lg">Yazdırma Önizleme</h3>
                <p className="text-sm text-slate-300">
                  Yazdır butonuna tıklayın veya Ctrl+P kullanın
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setIsPrintPreviewOpen(false)}
                  className="px-4 py-2 border border-slate-500 rounded-lg text-white hover:bg-slate-700"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={triggerPrint}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center shadow-sm"
                >
                  <Printer size={18} className="mr-2" />
                  Yazdır
                </button>
              </div>
            </div>

            <div
              id="erp-print-label"
              className="my-8 print:my-0 shadow-2xl print:shadow-none bg-white"
            >
              <PrintableLabel order={selectedOrder} settings={labelSettings} />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
