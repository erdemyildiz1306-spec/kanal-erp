"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  X,
  Package,
  Loader2,
  Send,
} from "lucide-react";

type Warehouse = { warehouseId: string; name: string; isDefault?: boolean };
type Variant = { sku?: string; barcode?: string; stock?: number };
type Product = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  stock: number;
  image?: string | null;
  category?: string;
  hasVariants?: boolean;
  variants?: Variant[];
};

type CartLine = {
  key: string;
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  variantSku: string;
  quantity: number;
  unitPrice: number;
  maxStock: number;
};

import { fmtMoney } from "@/lib/portal-ui";

type Props = {
  onClose: () => void;
  onSuccess: () => void;
};

export default function CustomerOrderShop({ onClose, onSuccess }: Props) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("main");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(["Tümü"]);
  const [category, setCategory] = useState("Tümü");
  const [search, setSearch] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantPick, setVariantPick] = useState<Product | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/portal/warehouses")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.warehouses?.length) {
          setWarehouses(d.warehouses);
          const def = d.warehouses.find((w: Warehouse) => w.isDefault) ?? d.warehouses[0];
          setWarehouseId(def.warehouseId);
        }
      });
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        warehouseId,
        inStock: inStockOnly ? "1" : "0",
      });
      if (search.trim()) params.set("q", search.trim());
      if (category && category !== "Tümü") params.set("category", category);
      const res = await fetch(`/api/portal/products?${params}`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.products ?? []);
        if (data.categories) setCategories(data.categories);
      } else setError(data.error || "Ürünler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId, search, category, inStockOnly]);

  useEffect(() => {
    if (warehouseId) void loadProducts();
  }, [warehouseId, loadProducts]);

  const cartTotal = useMemo(
    () => cart.reduce((a, l) => a + l.unitPrice * l.quantity, 0),
    [cart]
  );

  const addSimple = (p: Product) => {
    if (p.hasVariants && p.variants?.length) {
      setVariantPick(p);
      return;
    }
    const maxStock = p.stock;
    if (maxStock <= 0) return;
    const key = `${p.id}::`;
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      if (idx >= 0) {
        const next = [...prev];
        const q = Math.min(maxStock, next[idx]!.quantity + 1);
        next[idx] = { ...next[idx]!, quantity: q };
        return next;
      }
      return [
        ...prev,
        {
          key,
          productId: p.id,
          name: p.name,
          sku: p.sku,
          barcode: String(p.barcode ?? ""),
          variantSku: "",
          quantity: 1,
          unitPrice: p.price,
          maxStock,
        },
      ];
    });
  };

  const addVariant = (p: Product, v: Variant) => {
    const maxStock = Number(v.stock) || 0;
    if (maxStock <= 0) return;
    const variantSku = String(v.sku ?? "");
    const key = `${p.id}::${variantSku}`;
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx]!, quantity: Math.min(maxStock, next[idx]!.quantity + 1) };
        return next;
      }
      return [
        ...prev,
        {
          key,
          productId: p.id,
          name: `${p.name} (${variantSku})`,
          sku: variantSku,
          barcode: String(v.barcode ?? ""),
          variantSku,
          quantity: 1,
          unitPrice: p.price,
          maxStock,
        },
      ];
    });
    setVariantPick(null);
  };

  const updateQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.key !== key) return l;
          const q = Math.max(0, Math.min(l.maxStock, l.quantity + delta));
          return { ...l, quantity: q };
        })
        .filter((l) => l.quantity > 0)
    );
  };

  const submitOrder = async () => {
    if (cart.length === 0) {
      setError("Sepet boş.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId,
          notes,
          items: cart.map((l) => ({
            productId: l.productId,
            sku: l.sku,
            barcode: l.barcode,
            variantSku: l.variantSku || undefined,
            quantity: l.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCart([]);
        onSuccess();
        onClose();
      } else setError(data.error || "Sipariş oluşturulamadı.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[var(--erp-bg)] flex flex-col text-[var(--erp-text)]">
      <header className="shrink-0 border-b border-[var(--erp-border)] bg-[var(--erp-header)] px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2">
            <ShoppingCart size={20} className="text-[var(--erp-accent)]" /> Sipariş Ver
          </h2>
          <p className="text-xs erp-muted">Ürün seçin, sepete ekleyin, siparişi gönderin</p>
        </div>
        <button type="button" onClick={onClose} className="erp-btn erp-btn-ghost min-h-0 p-2">
          <X size={22} />
        </button>
      </header>

      <div className="shrink-0 px-4 py-3 space-y-3 border-b border-[var(--erp-border)] bg-[var(--erp-surface)]">
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs erp-muted font-semibold">Depo</label>
          <select
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setCart([]);
            }}
            className="erp-input py-2 text-sm w-auto min-w-[8rem]"
          >
            {warehouses.map((w) => (
              <option key={w.warehouseId} value={w.warehouseId}>
                {w.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs erp-muted ml-auto">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
            Stokta olanlar
          </label>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 erp-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void loadProducts()}
              placeholder="Ürün ara…"
              className="erp-input pl-9 text-sm"
            />
          </div>
          <button type="button" onClick={() => void loadProducts()} className="erp-btn erp-btn-primary text-sm min-w-[4rem]">
            Ara
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 erp-scroll-x">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${
                category === c
                  ? "bg-[var(--erp-accent)] text-white dark:text-[#0f1210] border-transparent"
                  : "bg-[var(--erp-surface-2)] erp-muted border-[var(--erp-border)]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mx-4 mt-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-4 py-3 main-scroll">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 erp-muted gap-2">
            <Loader2 className="animate-spin" size={28} />
            <p className="text-sm">Ürünler yükleniyor…</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center erp-muted py-12 space-y-2">
            <p>Ürün bulunamadı.</p>
            {inStockOnly ? (
              <p className="text-xs">
                Stok filtresi açık — tüm ürünleri görmek için «Stokta olanlar» kutusunu kapatın.
              </p>
            ) : search.trim() ? (
              <p className="text-xs">Arama kriterlerinizi değiştirmeyi deneyin.</p>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-32">
            {products.map((p) => (
              <div key={p.id} className="erp-card p-3 flex gap-3">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="w-16 h-16 rounded-xl object-cover bg-[var(--erp-surface-2)]" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-[var(--erp-surface-2)] flex items-center justify-center erp-muted">
                    <Package size={24} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <p className="text-[10px] erp-muted font-mono">{p.sku}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold">{fmtMoney(p.price)}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                        p.stock > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      Stok {p.stock}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={p.stock <= 0}
                    onClick={() => addSimple(p)}
                    className="erp-btn erp-btn-primary w-full mt-2 text-xs min-h-[2.25rem] disabled:opacity-40"
                  >
                    {p.hasVariants ? "Varyant seç" : "Sepete ekle"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <footer className="shrink-0 border-t border-[var(--erp-border)] bg-[var(--erp-nav)] backdrop-blur-md px-4 py-4 space-y-3">
          <div className="max-h-32 overflow-y-auto space-y-2">
            {cart.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate flex-1">{l.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => updateQty(l.key, -1)} className="erp-btn erp-btn-ghost min-h-0 p-1">
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center font-bold">{l.quantity}</span>
                  <button type="button" onClick={() => updateQty(l.key, 1)} className="erp-btn erp-btn-ghost min-h-0 p-1">
                    <Plus size={14} />
                  </button>
                </div>
                <span className="font-semibold tabular-nums w-20 text-right">{fmtMoney(l.unitPrice * l.quantity)}</span>
              </div>
            ))}
          </div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sipariş notu (opsiyonel)"
            className="erp-input text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs erp-muted">{cart.length} kalem</p>
              <p className="text-xl font-black">{fmtMoney(cartTotal)}</p>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitOrder()}
              className="erp-btn erp-btn-primary disabled:opacity-50"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Siparişi gönder
            </button>
          </div>
        </footer>
      )}

      {variantPick ? (
        <div className="fixed inset-0 z-[210] bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="erp-card w-full max-w-md p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold">{variantPick.name}</p>
                <p className="text-xs erp-muted">Varyant seçin</p>
              </div>
              <button type="button" onClick={() => setVariantPick(null)} className="erp-btn erp-btn-ghost min-h-0 p-1">
                <X size={18} />
              </button>
            </div>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {(variantPick.variants ?? []).map((v) => (
                <li key={v.sku}>
                  <button
                    type="button"
                    disabled={(Number(v.stock) || 0) <= 0}
                    onClick={() => addVariant(variantPick, v)}
                    className="w-full flex justify-between px-3 py-2 rounded-xl bg-[var(--erp-surface-2)] border border-[var(--erp-border)] hover:bg-[var(--erp-accent-soft)] disabled:opacity-40 text-sm"
                  >
                    <span className="font-mono">{v.sku}</span>
                    <span>Stok: {v.stock ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
