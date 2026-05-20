"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchHit = {
  products: Array<{ _id: string; name: string; sku: string; stock: number }>;
  orders: Array<{ _id: string; orderNumber: string; customerName: string; status: string }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function MobileSearchSheet({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit | null>(null);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      setLoading(false);
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: ac.signal,
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((d) => {
          if (reqId !== reqRef.current) return;
          setHits(
            d.success
              ? { products: d.products ?? [], orders: d.orders ?? [] }
              : null
          );
        })
        .catch(() => {
          if (reqId === reqRef.current) setHits(null);
        })
        .finally(() => {
          if (reqId === reqRef.current) setLoading(false);
        });
    }, 280);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  const openProduct = (p: { _id: string; name: string; sku: string }) => {
    onClose();
    const term = String(p.name || p.sku || "").trim();
    window.dispatchEvent(new CustomEvent("erp-products-search", { detail: { q: term, highlightId: p._id } }));
    router.push(`/products?q=${encodeURIComponent(term)}&highlight=${encodeURIComponent(p._id)}`);
  };

  const openOrder = (id: string) => {
    onClose();
    window.dispatchEvent(new CustomEvent("erp-navigate-order", { detail: { id } }));
    router.push(`/orders?orderId=${encodeURIComponent(id)}&_open=${Date.now()}`);
  };

  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-[130] animate-fade-in">
      <div className="absolute inset-0 bg-[var(--erp-bg)] flex flex-col">
        <div
          className="flex items-center gap-2 px-3 py-3 border-b border-[var(--erp-border)] bg-[var(--erp-header)]"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--erp-text-muted)]" size={20} />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün, SKU, barkod veya sipariş..."
              className="erp-input pl-11 pr-4 text-base"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target-sm shrink-0 rounded-xl border border-[var(--erp-border)] flex items-center justify-center"
            aria-label="Kapat"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {query.trim().length < 2 ? (
            <p className="text-sm erp-muted text-center py-8">En az 2 karakter yazın</p>
          ) : loading ? (
            <p className="text-sm erp-muted text-center py-8">Aranıyor…</p>
          ) : hits &&
            hits.products.length === 0 &&
            hits.orders.length === 0 ? (
            <p className="text-sm erp-muted text-center py-8">Sonuç bulunamadı</p>
          ) : hits ? (
            <div className="space-y-4">
              {hits.products.length > 0 ? (
                <section>
                  <p className="text-xs font-bold uppercase tracking-wide erp-muted mb-2 px-1">Ürünler</p>
                  <div className="space-y-2">
                    {hits.products.map((p) => (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => openProduct(p)}
                        className="erp-card w-full text-left p-4 active:scale-[0.99] transition-transform"
                      >
                        <p className="font-semibold text-[var(--erp-text)]">{p.name}</p>
                        <p className="text-sm erp-muted mt-1">
                          {p.sku} · Stok {p.stock}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              {hits.orders.length > 0 ? (
                <section>
                  <p className="text-xs font-bold uppercase tracking-wide erp-muted mb-2 px-1">Siparişler</p>
                  <div className="space-y-2">
                    {hits.orders.map((o) => (
                      <button
                        key={o._id}
                        type="button"
                        onClick={() => openOrder(o._id)}
                        className="erp-card w-full text-left p-4 active:scale-[0.99] transition-transform"
                      >
                        <p className="font-semibold text-[var(--erp-text)]">{o.orderNumber}</p>
                        <p className="text-sm erp-muted mt-1">
                          {o.customerName} · {o.status}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
