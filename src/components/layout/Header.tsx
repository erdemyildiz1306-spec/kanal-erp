"use client";

import { Bell, LogOut, Search, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MobileSearchSheet from "@/components/layout/MobileSearchSheet";

type NotifItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "order" | "stock" | "info";
  read?: boolean;
};

type SearchHit = {
  products: Array<{ _id: string; name: string; sku: string; stock: number }>;
  orders: Array<{ _id: string; orderNumber: string; customerName: string; status: string }>;
};

export default function Header() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchReqRef = useRef(0);
  const [me, setMe] = useState<{ name: string; email: string; role: string } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const applyNotifPayload = (data: { items?: NotifItem[]; unreadCount?: number }) => {
    if (Array.isArray(data.items)) {
      setItems(data.items);
      setUnread(Number(data.unreadCount) || 0);
      setLoadStatus("ok");
    }
  };

  const markRead = async (id: string) => {
    setActionBusy(id);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", id }),
      });
      const data = await res.json();
      if (data.success) applyNotifPayload(data);
    } finally {
      setActionBusy(null);
    }
  };

  const markAllRead = async () => {
    setActionBusy("all");
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "readAll" }),
      });
      const data = await res.json();
      if (data.success) applyNotifPayload(data);
    } finally {
      setActionBusy(null);
    }
  };

  const deleteNotif = async (id: string) => {
    setActionBusy(`del-${id}`);
    try {
      const res = await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) applyNotifPayload(data);
    } finally {
      setActionBusy(null);
    }
  };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoadStatus("loading");
      const res = await fetch("/api/notifications");
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setItems(data.items);
        setUnread(Number(data.unreadCount) || 0);
        setLoadStatus("ok");
      } else {
        setItems([]);
        setUnread(0);
        setLoadStatus("err");
      }
    } catch {
      setItems([]);
      setUnread(0);
      setLoadStatus("err");
    }
  }, []);

  useEffect(() => {
    void load({ silent: false });
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.user) setMe(d.user);
      })
      .catch(() => {});
    const t = window.setInterval(() => load({ silent: true }), 60_000);
    const onSync = () => void load({ silent: true });
    window.addEventListener("erp-orders-synced", onSync);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("erp-orders-synced", onSync);
    };
  }, [load]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchHits(null);
      setSearchLoading(false);
      return;
    }
    const reqId = ++searchReqRef.current;
    setSearchLoading(true);
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: ac.signal,
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((d) => {
          if (reqId !== searchReqRef.current) return;
          if (d.success) {
            setSearchHits({ products: d.products ?? [], orders: d.orders ?? [] });
          } else {
            setSearchHits(null);
          }
        })
        .catch(() => {
          if (reqId === searchReqRef.current) setSearchHits(null);
        })
        .finally(() => {
          if (reqId === searchReqRef.current) setSearchLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  const openProduct = (p: { _id: string; name: string; sku: string }) => {
    setSearchOpen(false);
    setQuery("");
    const term = String(p.name || p.sku || "").trim();
    window.dispatchEvent(new CustomEvent("erp-products-search", { detail: { q: term, highlightId: p._id } }));
    router.push(`/products?q=${encodeURIComponent(term)}&highlight=${encodeURIComponent(p._id)}`);
  };

  const openOrder = (id: string) => {
    setSearchOpen(false);
    setQuery("");
    window.dispatchEvent(new CustomEvent("erp-navigate-order", { detail: { id } }));
    router.push(`/orders?orderId=${encodeURIComponent(id)}&_open=${Date.now()}`);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <>
      <header
        className="h-14 lg:h-[4.25rem] bg-[var(--erp-header)] lg:backdrop-blur border-b border-[var(--erp-border)] flex items-center justify-between px-4 lg:px-8 gap-3"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-3 min-w-0 lg:hidden">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--erp-text-muted)]">
              KanalERP
            </p>
            <p className="text-sm font-semibold text-[var(--erp-text)] truncate">
              {me?.name ?? "Stok Paneli"}
            </p>
          </div>
        </div>

        <div className="hidden lg:flex items-center w-1/3 min-w-0" ref={searchRef}>
          <div className="relative w-full max-w-md">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Ürün veya sipariş ara..."
              className="erp-input pl-10 pr-4 py-2.5 rounded-full text-sm"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--erp-text-muted)]" size={18} />
            {searchOpen && query.trim().length >= 2 && (
              <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-xl z-[100] max-h-80 overflow-y-auto text-sm">
                {searchLoading ? (
                  <p className="px-4 py-3 erp-muted">Aranıyor…</p>
                ) : searchHits &&
                  searchHits.products.length === 0 &&
                  searchHits.orders.length === 0 ? (
                  <p className="px-4 py-3 erp-muted">Sonuç yok.</p>
                ) : searchHits ? (
                  <>
                    {searchHits.products.length > 0 ? (
                      <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide erp-muted">
                        Ürünler
                      </p>
                    ) : null}
                    {searchHits.products.map((p) => (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => openProduct(p)}
                        className="block w-full text-left px-4 py-3 hover:bg-[var(--erp-surface-2)] border-b border-[var(--erp-border)]"
                      >
                        <span className="font-medium text-[var(--erp-text)]">{p.name}</span>
                        <span className="text-xs erp-muted ml-2">
                          {p.sku} · stok {p.stock}
                        </span>
                      </button>
                    ))}
                    {searchHits.orders.length > 0 ? (
                      <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide erp-muted">
                        Siparişler
                      </p>
                    ) : null}
                    {searchHits.orders.map((o) => (
                      <button
                        key={o._id}
                        type="button"
                        onClick={() => openOrder(o._id)}
                        className="block w-full text-left px-4 py-3 hover:bg-[var(--erp-surface-2)] border-b border-[var(--erp-border)] last:border-0"
                      >
                        <span className="font-medium text-[var(--erp-text)]">{o.orderNumber}</span>
                        <span className="text-xs erp-muted ml-2">
                          {o.customerName} · {o.status}
                        </span>
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 lg:gap-5 ml-auto">
          <button
            type="button"
            aria-label="Ara"
            onClick={() => setMobileSearch(true)}
            className="lg:hidden touch-target-sm rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] flex items-center justify-center"
          >
            <Search size={20} />
          </button>

          <div className="relative" ref={wrapRef}>
            <button
              type="button"
              aria-label="Bildirimler"
              onClick={() => {
                setOpen((v) => !v);
                if (!open) void load({ silent: true });
              }}
              className="relative touch-target-sm rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] flex items-center justify-center"
            >
              <Bell size={20} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-0.5 flex items-center justify-center text-[10px] font-bold bg-red-600 text-white rounded-full">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] max-h-[28rem] overflow-y-auto rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-xl z-[100]">
                <div className="px-4 py-3 border-b border-[var(--erp-border)] flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--erp-text)]">Bildirimler</span>
                  {unread > 0 ? (
                    <button
                      type="button"
                      disabled={actionBusy === "all"}
                      onClick={() => void markAllRead()}
                      className="text-[11px] font-medium text-[var(--erp-accent)] hover:underline disabled:opacity-50"
                    >
                      Tümünü okundu
                    </button>
                  ) : null}
                </div>
                <ul className="py-1">
                  {loadStatus === "loading" && items.length === 0 ? (
                    <li className="px-4 py-6 text-sm erp-muted text-center">Yükleniyor…</li>
                  ) : items.length === 0 ? (
                    <li className="px-4 py-6 text-sm erp-muted text-center">Gösterilecek bildirim yok.</li>
                  ) : (
                    items.map((n) => (
                      <li
                        key={n.id}
                        className={`px-4 py-3 border-b border-[var(--erp-border)] text-sm ${
                          n.read ? "opacity-80" : "bg-[var(--erp-surface-2)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className={`font-medium ${n.read ? "erp-muted" : "text-[var(--erp-text)]"}`}>
                              {n.title}
                            </p>
                            <p className="erp-muted text-xs mt-0.5 leading-snug">{n.detail}</p>
                            {n.time ? <p className="text-[11px] erp-muted mt-1">{n.time}</p> : null}
                          </div>
                          {n.kind !== "info" ? (
                            <div className="flex shrink-0 flex-col gap-1">
                              {!n.read ? (
                                <button
                                  type="button"
                                  disabled={actionBusy === n.id}
                                  onClick={() => void markRead(n.id)}
                                  className="text-[10px] px-2 py-1 rounded-md bg-[var(--erp-accent-soft)] text-[var(--erp-accent)] disabled:opacity-50"
                                >
                                  Okundu
                                </button>
                              ) : null}
                              <button
                                type="button"
                                disabled={actionBusy === `del-${n.id}`}
                                onClick={() => void deleteNotif(n.id)}
                                className="text-[10px] px-2 py-1 rounded-md bg-red-500/10 text-red-600 disabled:opacity-50"
                              >
                                Sil
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-3 border-l border-[var(--erp-border)] pl-5">
            <div className="w-10 h-10 rounded-full bg-[var(--erp-accent-soft)] flex items-center justify-center text-[var(--erp-accent)]">
              <User size={20} />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--erp-text)]">{me?.name ?? "Kanal ERP"}</p>
              <p className="text-xs erp-muted">{me?.role ?? "Panel"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            title="Çıkış"
            className="touch-target-sm rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] flex items-center justify-center"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <MobileSearchSheet open={mobileSearch} onClose={() => setMobileSearch(false)} />
    </>
  );
}
