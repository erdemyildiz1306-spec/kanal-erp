"use client";

import { useEffect, useState } from "react";
import { Search, Package } from "lucide-react";
import { fmtMoney } from "@/lib/portal-ui";

type CatalogProduct = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  stock: number;
  image?: string | null;
  hasVariants?: boolean;
  variants?: Array<{ sku?: string; stock?: number }>;
};

export default function PortalCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = (search = "") => {
    setLoading(true);
    void fetch(`/api/portal/products${search ? `?q=${encodeURIComponent(search)}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setProducts(d.products ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="erp-card p-4">
        <h2 className="font-bold text-lg mb-1 flex items-center gap-2 text-[var(--erp-text)]">
          <Package size={18} className="text-[var(--erp-accent)]" /> Ürün kataloğu
        </h2>
        <p className="text-sm erp-muted mb-3">Güncel stok ve fiyat bilgisi (salt okunur)</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 erp-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load(q)}
              placeholder="Ürün adı, SKU…"
              className="erp-input pl-9"
            />
          </div>
          <button type="button" onClick={() => load(q)} className="erp-btn erp-btn-primary min-w-[4.5rem]">
            Ara
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="erp-card h-28" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="erp-muted text-sm p-6 text-center erp-card">Ürün bulunamadı.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {products.map((p) => (
            <div key={p.id} className="erp-card p-4 hover:shadow-md transition-shadow">
              <div className="flex gap-3">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="w-16 h-16 rounded-xl object-cover bg-[var(--erp-surface-2)]" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-[var(--erp-surface-2)] flex items-center justify-center erp-muted">
                    <Package size={24} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate text-[var(--erp-text)]">{p.name}</p>
                  <p className="text-xs erp-muted font-mono mt-0.5">{p.sku}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-black text-lg tabular-nums">{fmtMoney(p.price)}</span>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-lg ${
                        p.stock > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      Stok: {p.stock}
                    </span>
                  </div>
                </div>
              </div>
              {p.hasVariants && p.variants && p.variants.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-[var(--erp-border)] flex flex-wrap gap-1.5">
                  {p.variants.slice(0, 4).map((v) => (
                    <span
                      key={v.sku}
                      className="text-[10px] px-2 py-1 rounded-lg bg-[var(--erp-surface-2)] erp-muted"
                    >
                      {v.sku}: {v.stock ?? 0}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
