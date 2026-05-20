"use client";

import { useEffect, useState } from "react";
import { Search, Package } from "lucide-react";

function fmt(n: number) {
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
      <div className="rounded-2xl bg-white/10 border border-white/10 p-4">
        <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
          <Package size={18} /> Ürün kataloğu
        </h2>
        <p className="text-sm text-violet-200 mb-3">Güncel stok ve fiyat bilgisi (salt okunur)</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-300" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load(q)}
              placeholder="Ürün adı, SKU…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-violet-300 outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
          <button
            type="button"
            onClick={() => load(q)}
            className="px-4 py-2.5 rounded-xl bg-white text-violet-900 font-semibold text-sm hover:bg-violet-100"
          >
            Ara
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/10" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-violet-200 text-sm p-6 text-center rounded-2xl bg-white/5 border border-white/10">
          Ürün bulunamadı.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {products.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-colors"
            >
              <div className="flex gap-3">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="w-16 h-16 rounded-xl object-cover bg-white/10" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center text-violet-300">
                    <Package size={24} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">{p.name}</p>
                  <p className="text-xs text-violet-300 font-mono mt-0.5">{p.sku}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-black text-lg tabular-nums">{fmt(p.price)}</span>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-lg ${
                        p.stock > 0 ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200"
                      }`}
                    >
                      Stok: {p.stock}
                    </span>
                  </div>
                </div>
              </div>
              {p.hasVariants && p.variants && p.variants.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-1.5">
                  {p.variants.slice(0, 4).map((v) => (
                    <span key={v.sku} className="text-[10px] px-2 py-1 rounded-lg bg-white/10 text-violet-200">
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
