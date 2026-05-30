"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Search,
  MoreHorizontal,
  DownloadCloud,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ImageIcon,
  Layers,
  Link2,
  Upload,
  CheckCircle2,
  X,
  ScanBarcode,
  Pencil,
  Package,
} from "lucide-react";
import {
  generateEan13,
  generateModelSku,
  variantSkuFromParts,
} from "@/lib/codes";
import {
  buildAttributeSelections,
  validateRequiredAttributes,
  validateVariantDimensionsForPublish,
  fieldsForProductLevel,
  findVariantDimensionFields,
  isVariantDimensionField,
  selectionsFromStored,
  type TyAttributeField,
  type TyAttributeFormValue,
} from "@/lib/trendyol-attributes";
import {
  PRESET_VARIANT_COLORS,
  presetSizesForKind,
  sizePresetLabel,
  toggleInList,
  isSelectedInList,
  uniqueStrings,
  type SizePresetKind,
} from "@/lib/variant-presets";
import { turkishTextIncludes } from "@/lib/search-text";
import {
  isTrendyolPublicImageUrl,
  resolveTrendyolImageUrls,
  toAbsolutePublicUrl,
  trendyolImagePublishError,
} from "@/lib/public-image-url";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import StockBarcodePanel from "@/components/scanner/StockBarcodePanel";

type CategoryLeaf = { categoryId: number; path: string; name?: string };

type CategoryTreeNode = {
  categoryId: number;
  name: string;
  isLeaf?: boolean;
  children?: CategoryTreeNode[];
};

const emptyVariant = () => ({
  sku: "",
  barcode: "",
  stock: "0",
  sizeLabel: "",
  colorLabel: "",
});

const PRODUCT_PAGE_SIZE = 20;

function variantStockLabel(row: {
  sizeLabel?: string;
  colorLabel?: string;
  sku?: string;
}): string {
  const parts = [row.sizeLabel, row.colorLabel].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  return row.sku?.trim() || "Varyant";
}

function productStockUnits(product: {
  stock?: number;
  hasVariants?: boolean;
  variants?: Array<{ stock?: number }>;
}): number {
  if (product.hasVariants && Array.isArray(product.variants)) {
    return product.variants.reduce(
      (a, v) => a + Math.max(0, Number(v.stock) || 0),
      0
    );
  }
  return Math.max(0, Number(product.stock) || 0);
}

function productListFinancials(products: Array<{
  stock?: number;
  costPrice?: number;
  price?: number;
  hasVariants?: boolean;
  variants?: Array<{ stock?: number }>;
  prices?: { trendyol?: number; website?: number };
}>) {
  let units = 0;
  let costValue = 0;
  let saleValue = 0;
  for (const p of products) {
    const cost = Number(p.costPrice) || 0;
    const price =
      Number(p.prices?.trendyol) || Number(p.price) || 0;
    const qty = productStockUnits(p);
    units += qty;
    costValue += qty * cost;
    saleValue += qty * price;
  }
  return {
    units,
    costValue,
    saleValue,
    netProfit: saleValue - costValue,
  };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categoryLeaves, setCategoryLeaves] = useState<CategoryLeaf[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);
  const [categoryPickPath, setCategoryPickPath] = useState<number[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [categorySearchOpen, setCategorySearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Trendyol'dan çek — tabloyu gizlemeden sadece buton/feedback */
  const [trendyolSyncing, setTrendyolSyncing] = useState(false);
  const [trendyolSyncSummary, setTrendyolSyncSummary] = useState<{
    kind: "success" | "partial" | "error";
    message: string;
    stats?: {
      trendyolRows: number;
      productGroups: number;
      productsSynced: number;
      productsCreated: number;
      productsUpdated: number;
      variantProducts: number;
      singleProducts: number;
      totalVariantLines: number;
      failedGroups: number;
    };
    hint?: string;
    errors?: string[];
    mockUsed?: boolean;
  } | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [modalActionMsg, setModalActionMsg] = useState<{
    kind: "error" | "info" | "success";
    text: string;
  } | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [bulkPublishConfirmOpen, setBulkPublishConfirmOpen] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Tümü");
  /** Stok durumuna göre liste — Trendyol çekimi sonrası kullanıcı akışı */
  const [inventoryFilter, setInventoryFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [productPage, setProductPage] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  /** Toplu kanal gönderimi için satır seçimi */
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    () => new Set()
  );
  const [pushingChannel, setPushingChannel] = useState<
    null | "ty" | "web" | "publish"
  >(null);
  const [channelPushSummary, setChannelPushSummary] = useState<{
    kind: "success" | "partial" | "error";
    title: string;
    message: string;
    errors?: string[];
  } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [productData, setProductData] = useState({
    name: "",
    description: "",
    sku: "",
    barcode: "",
    costPrice: "",
    dimensionalWeight: "1",
    cargoFee: "",
    price: "",
    priceWebsite: "",
    priceTrendyol: "",
    stock: "",
    safetyStock: "2",
    warehouseLocation: "",
    categoryPath: "",
    trendyolCategoryId: "" as string,
    hasVariants: false,
  });

  const [images, setImages] = useState<{ url: string }[]>([{ url: "" }]);
  const [variants, setVariants] = useState([emptyVariant()]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [tyAttrFields, setTyAttrFields] = useState<TyAttributeField[]>([]);
  const [tyVariantHints, setTyVariantHints] = useState<{
    sizeAttributeName?: string | null;
    colorAttributeName?: string | null;
    ageAttributeName?: string | null;
  }>({});
  const [matrixColors, setMatrixColors] = useState<string[]>([]);
  const [matrixSizes, setMatrixSizes] = useState<string[]>([]);
  const [sizePresetKind, setSizePresetKind] = useState<SizePresetKind>("kids");
  const [bulkVariantStock, setBulkVariantStock] = useState("");
  const [variantBuilderOpen, setVariantBuilderOpen] = useState(true);
  const [variantTemplates, setVariantTemplates] = useState<
    Array<{ name: string; values: string[] }>
  >([]);
  const [tyAttrLoading, setTyAttrLoading] = useState(false);
  const [tyAttrValues, setTyAttrValues] = useState<
    Record<number, TyAttributeFormValue>
  >({});

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isBarcodeStockOpen, setIsBarcodeStockOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [newStockValue, setNewStockValue] = useState("");
  const [stockVariantRows, setStockVariantRows] = useState<
    Array<{
      sku: string;
      barcode: string;
      stock: string;
      sizeLabel: string;
      colorLabel: string;
    }>
  >([]);
  const [stockSaving, setStockSaving] = useState(false);
  /** GET /api/products başarısız (Mongo vb.) */
  const [productsFetchError, setProductsFetchError] = useState<string | null>(
    null
  );
  /** Portal yalnızca tarayıcıda — SSR'de document.body yok */
  const [isClient, setIsClient] = useState(false);
  const [highlightProductId, setHighlightProductId] = useState<string | null>(
    null
  );
  const [publicAppUrl, setPublicAppUrl] = useState("");

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/products");
      let data: { success?: boolean; products?: unknown[]; error?: string } =
        {};
      try {
        data = await res.json();
      } catch {
        setProductsFetchError(`Geçersiz yanıt (HTTP ${res.status})`);
        setProducts([]);
        return;
      }
      if (!res.ok || data.success !== true) {
        setProductsFetchError(
          data.error ||
            `Ürün listesi alınamadı (HTTP ${res.status}). MongoDB bağlantısını kontrol edin.`
        );
        setProducts([]);
        return;
      }
      setProductsFetchError(null);
      setProducts((data.products as any[]) || []);
    } catch (err) {
      console.error(err);
      setProductsFetchError(
        err instanceof Error ? err.message : "Ağ veya sunucu hatası"
      );
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const refreshProductsQuiet = async () => {
    try {
      const res = await fetch("/api/products");
      let data: { success?: boolean; products?: unknown[]; error?: string } =
        {};
      try {
        data = await res.json();
      } catch {
        setProductsFetchError(`Geçersiz yanıt (HTTP ${res.status})`);
        return;
      }
      if (!res.ok || data.success !== true) {
        setProductsFetchError(
          data.error || `Liste alınamadı (HTTP ${res.status})`
        );
        return;
      }
      setProductsFetchError(null);
      setProducts((data.products as any[]) || []);
    } catch (err) {
      console.error(err);
      setProductsFetchError(
        err instanceof Error ? err.message : "Yenileme hatası"
      );
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/categories");
      const data = await res.json();
      if (data.success && Array.isArray(data.leafOnly)) {
        const leaves: CategoryLeaf[] = data.leafOnly.map(
          (c: { categoryId: number; path: string; name: string }) => ({
            categoryId: c.categoryId,
            path: c.path || c.name,
            name: c.name,
          })
        );
        setCategoryLeaves(leaves);
      }
      if (data.success && Array.isArray(data.tree)) {
        setCategoryTree(data.tree as CategoryTreeNode[]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const findCategoryPathInTree = (
    tree: CategoryTreeNode[],
    targetId: number,
    trail: number[] = []
  ): number[] | null => {
    for (const node of tree) {
      const next = [...trail, node.categoryId];
      if (node.categoryId === targetId) return next;
      if (node.children?.length) {
        const hit = findCategoryPathInTree(node.children, targetId, next);
        if (hit) return hit;
      }
    }
    return null;
  };

  const categoryCascadeLevels = useMemo(() => {
    const levels: CategoryTreeNode[][] = [];
    let nodes = categoryTree;
    if (!nodes.length) return levels;
    levels.push(nodes);
    for (const id of categoryPickPath) {
      const hit = nodes.find((n) => n.categoryId === id);
      if (!hit?.children?.length) break;
      nodes = hit.children;
      levels.push(nodes);
    }
    return levels;
  }, [categoryTree, categoryPickPath]);

  const filteredCategoryLeaves = useMemo(() => {
    const q = categorySearch.trim();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    return categoryLeaves
      .filter((c) => terms.every((term) => turkishTextIncludes(c.path, term)))
      .slice(0, 100);
  }, [categoryLeaves, categorySearch]);

  const variantColorOptions = useMemo(() => {
    const extra = variantTemplates.flatMap((t) =>
      /renk|color/i.test(t.name) ? t.values : []
    );
    return [...new Set([...PRESET_VARIANT_COLORS, ...extra])];
  }, [variantTemplates]);

  const variantSizeOptions = useMemo(() => {
    const extra = variantTemplates.flatMap((t) =>
      /beden|yaş|numara|size|ay/i.test(t.name) ? t.values : []
    );
    return [...new Set([...presetSizesForKind(sizePresetKind), ...extra])];
  }, [sizePresetKind, variantTemplates]);

  const productLevelTyFields = useMemo(
    () => fieldsForProductLevel(tyAttrFields, productData.hasVariants),
    [tyAttrFields, productData.hasVariants]
  );

  useEffect(() => {
    if (!productData.hasVariants || tyAttrFields.length === 0) return;
    setTyAttrValues((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const f of tyAttrFields) {
        if (isVariantDimensionField(f) && next[f.attributeId]) {
          delete next[f.attributeId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [productData.hasVariants, tyAttrFields]);

  const matrixRowCount = matrixColors.length * matrixSizes.length;

  const handleSizePresetChange = (kind: SizePresetKind) => {
    setSizePresetKind(kind);
    setMatrixSizes([]);
  };

  const buildVariantsFromMatrix = (replace: boolean) => {
    if (matrixColors.length === 0 || matrixSizes.length === 0) {
      alert("En az bir renk ve bir beden/yaş seçin.");
      return;
    }
    let base = productData.sku.trim();
    if (!base) {
      base = generateModelSku({
        nameHint: productData.name,
        categoryHint: productData.categoryPath,
      });
      setProductData((p) => ({ ...p, sku: base }));
    }
    const rows: ReturnType<typeof emptyVariant>[] = [];
    let idx = 0;
    for (const colorLabel of matrixColors) {
      for (const sizeLabel of matrixSizes) {
        rows.push({
          sku: variantSkuFromParts(base, colorLabel, sizeLabel, idx),
          barcode: generateEan13(),
          stock: "0",
          colorLabel,
          sizeLabel,
        });
        idx += 1;
      }
    }
    setVariants((prev) => (replace ? rows : [...prev, ...rows]));
  };

  const applyBulkStockToVariants = () => {
    const raw = bulkVariantStock.trim();
    if (raw === "") {
      alert("Toplu stok için bir değer girin.");
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      alert("Geçerli bir stok miktarı girin (0 veya üzeri).");
      return;
    }
    const value = String(Math.floor(n));
    setVariants((prev) => prev.map((row) => ({ ...row, stock: value })));
  };

  const applyCategorySelection = (categoryId: number, pathLabel?: string) => {
    const leaf = categoryLeaves.find((l) => l.categoryId === categoryId);
    const path = findCategoryPathInTree(categoryTree, categoryId);
    if (path) setCategoryPickPath(path);
    else setCategoryPickPath([]);
    const label = pathLabel ?? leaf?.path ?? "";
    setProductData((prev) => ({
      ...prev,
      trendyolCategoryId: String(categoryId),
      categoryPath: label,
    }));
    setCategorySearch(label);
    setCategorySearchOpen(false);
    void loadTyAttributes(String(categoryId), {});
  };

  const syncCategories = async () => {
    try {
      setCategoryLoading(true);
      const res = await fetch("/api/trendyol/sync-categories");
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        await fetchCategories();
      } else alert("Eşitleme hatası: " + data.error);
    } catch {
      alert("Kategori senkronizasyonu başarısız.");
    } finally {
      setCategoryLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    void fetch("/api/trendyol/variant-templates")
      .then((r) => r.json())
      .then((d: { success?: boolean; templates?: Array<{ name: string; values: string[] }> }) => {
        if (d.success && Array.isArray(d.templates)) setVariantTemplates(d.templates);
      })
      .catch(() => {});
    void fetch("/api/settings?t=" + Date.now(), { cache: "no-store" })
      .then((r) => r.json())
      .then((d: {
        success?: boolean;
        settings?: { publicAppUrl?: string };
        effectivePublicAppUrl?: string;
      }) => {
        if (d.success) {
          setPublicAppUrl(
            String(d.effectivePublicAppUrl ?? d.settings?.publicAppUrl ?? "").trim()
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const applyProductsSearch = (q: string, highlightId?: string) => {
    const term = String(q ?? "").trim();
    if (term) {
      setSearchTerm(term);
      setSelectedCategory("Tümü");
      setInventoryFilter("all");
      setProductPage(0);
    }
    if (highlightId) {
      setHighlightProductId(String(highlightId));
    }
  };

  useEffect(() => {
    if (!isClient) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const highlight = params.get("highlight");
    const isNew = params.get("new") === "1";
    const barcodeParam = params.get("barcode")?.trim() ?? "";
    if (q || highlight) {
      applyProductsSearch(q ?? barcodeParam, highlight ?? undefined);
      window.history.replaceState(null, "", "/products");
    } else if (isNew) {
      openModalForNew(barcodeParam || undefined);
      window.history.replaceState(null, "", "/products");
    }
  }, [isClient]);

  useEffect(() => {
    const onSearch = (ev: Event) => {
      const d = (ev as CustomEvent<{ q?: string; highlightId?: string }>).detail;
      applyProductsSearch(String(d?.q ?? ""), d?.highlightId);
    };
    window.addEventListener("erp-products-search", onSearch);
    return () => window.removeEventListener("erp-products-search", onSearch);
  }, []);

  useEffect(() => {
    setProductPage(0);
  }, [searchTerm, selectedCategory, inventoryFilter]);

  const handleGenerateBarcode = () => {
    setProductData((prev) => ({ ...prev, barcode: generateEan13() }));
  };

  const handleGenerateSku = () => {
    setProductData((prev) => ({
      ...prev,
      sku: generateModelSku({
        nameHint: prev.name,
        categoryHint: prev.categoryPath,
      }),
    }));
  };

  const uploadImageAt = async (idx: number, file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploadingIdx(idx);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success && (data.absoluteUrl || data.url)) {
        const savedUrl = String(data.absoluteUrl || data.url).trim();
        setImages((prev) => {
          const n = [...prev];
          n[idx] = { url: savedUrl };
          return n;
        });
        if (data.trendyolReady === false) {
          alert(
            "Görsel kaydedildi ama Trendyol için henüz uygun değil.\n\nAyarlar > Trendyol > «Yayımlama adresi (HTTPS)» alanına canlı mağaza adresinizi yazın (Railway vb.) veya bu satıra doğrudan HTTPS CDN linki yapıştırın."
          );
        }
      } else alert(data.error || "Yükleme başarısız.");
    } finally {
      setUploadingIdx(null);
    }
  };

  const applyVariantCodes = (idx: number, regenBarcode = false) => {
    let base = productData.sku.trim();
    if (!base) {
      base = generateModelSku({
        nameHint: productData.name,
        categoryHint: productData.categoryPath,
      });
      setProductData((p) => ({ ...p, sku: base }));
    }
    setVariants((prev) => {
      const row = prev[idx];
      if (!row) return prev;
      const next = [...prev];
      next[idx] = {
        ...row,
        sku: variantSkuFromParts(base, row.colorLabel, row.sizeLabel, idx),
        barcode:
          regenBarcode || !String(row.barcode).trim()
            ? generateEan13()
            : row.barcode,
      };
      return next;
    });
  };

  const addImageRow = () => setImages((prev) => [...prev, { url: "" }]);
  const removeImageRow = (idx: number) =>
    setImages((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const addVariantRow = () => {
    setVariants((prev) => {
      const base =
        productData.sku.trim() ||
        generateModelSku({
          nameHint: productData.name,
          categoryHint: productData.categoryPath,
        });
      if (!productData.sku.trim()) {
        queueMicrotask(() =>
          setProductData((p) => ({ ...p, sku: base }))
        );
      }
      const i = prev.length;
      return [
        ...prev,
        {
          sku: variantSkuFromParts(base, "", "", i),
          barcode: generateEan13(),
          stock: "0",
          sizeLabel: "",
          colorLabel: "",
        },
      ];
    });
  };

  const updateVariantRow = (
    idx: number,
    field: keyof ReturnType<typeof emptyVariant>,
    value: string
  ) =>
    setVariants((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });

  const removeVariantRow = (idx: number) =>
    setVariants((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)
    );

  const loadTyAttributes = async (
    categoryId: string,
    preset?: Record<number, TyAttributeFormValue>
  ) => {
    if (!categoryId) {
      setTyAttrFields([]);
      setTyAttrValues({});
      setTyVariantHints({});
      return;
    }
    setTyAttrLoading(true);
    try {
      const res = await fetch(
        `/api/trendyol/create-product?categoryId=${encodeURIComponent(categoryId)}`
      );
      const data = (await res.json()) as {
        success?: boolean;
        fields?: TyAttributeField[];
        variantHints?: {
          sizeAttributeName?: string | null;
          colorAttributeName?: string | null;
          ageAttributeName?: string | null;
        };
        error?: string;
      };
      if (data.success && Array.isArray(data.fields)) {
        setTyAttrFields(data.fields);
        setTyAttrValues(preset ?? {});
        setTyVariantHints({
          sizeAttributeName: data.variantHints?.sizeAttributeName ?? null,
          colorAttributeName: data.variantHints?.colorAttributeName ?? null,
          ageAttributeName: data.variantHints?.ageAttributeName ?? null,
        });
      } else {
        setTyAttrFields([]);
        setTyVariantHints({});
        if (!preset) setTyAttrValues({});
        if (data.error) {
          setModalActionMsg({ kind: "error", text: data.error });
        }
      }
    } catch {
      setTyAttrFields([]);
      setTyVariantHints({});
    } finally {
      setTyAttrLoading(false);
    }
  };

  const resetModalActionState = () => {
    setSavingProduct(false);
    setPushingChannel(null);
    setModalActionMsg(null);
    setPublishConfirmOpen(false);
    setBulkPublishConfirmOpen(false);
  };

  const openProductModal = () => {
    resetModalActionState();
    setIsModalOpen(true);
  };

  const validateProductForm = (): string | null => {
    if (!productData.name.trim()) return "Ürün adı zorunludur.";
    if (!productData.hasVariants && (!productData.sku || !productData.barcode)) {
      return "Tekil ürün için model kodu ve barkod zorunludur.";
    }
    if (productData.hasVariants) {
      const modelSku = productData.sku.trim();
      const badRow = variants.find((v) => !v.sku.trim() || !v.barcode.trim());
      if (!modelSku || badRow) {
        return "Varyantlı üründe model SKU ve her satırda SKU + barkod zorunludur.";
      }
    }
    if (productData.trendyolCategoryId) {
      if (tyAttrFields.length === 0 && !tyAttrLoading) {
        return "Trendyol kategori öznitelikleri yüklenemedi. Önce «Kategori Ağacını Eşitle» deyin, kategoriyi yeniden seçin.";
      }
      if (tyAttrFields.length > 0) {
        const attrsForForm = fieldsForProductLevel(
          tyAttrFields,
          productData.hasVariants
        );
        const attrErr = validateRequiredAttributes(attrsForForm, tyAttrValues);
        if (attrErr) return attrErr;
      }
      if (productData.hasVariants && tyAttrFields.length > 0) {
        const variantErr = validateVariantDimensionsForPublish(
          tyAttrFields,
          variants.map((v) => ({
            sizeLabel: v.sizeLabel,
            colorLabel: v.colorLabel,
          }))
        );
        if (variantErr) return variantErr;
      }
      const imageUrls = images.map((im) => String(im.url ?? "").trim()).filter(Boolean);
      if (imageUrls.length > 0) {
        const { bad } = resolveTrendyolImageUrls(imageUrls, publicAppUrl);
        if (bad.length > 0) {
          return trendyolImagePublishError(bad, publicAppUrl);
        }
      }
    }
    return null;
  };

  const buildProductPayload = (): Record<string, unknown> => {
    const imagesPayload = images
      .map((i) => {
        const trimmed = i.url.trim();
        if (!trimmed) return null;
        const { ok } = resolveTrendyolImageUrls([trimmed], publicAppUrl);
        return { url: ok[0] ?? trimmed };
      })
      .filter((i): i is { url: string } => Boolean(i?.url));

    const variantsPayload = productData.hasVariants
      ? variants
          .filter((v) => v.sku.trim() && v.barcode.trim())
          .map((v) => ({
            sku: v.sku.trim(),
            barcode: v.barcode.trim(),
            stock: Math.max(0, Number(v.stock) || 0),
            sizeLabel: v.sizeLabel.trim(),
            colorLabel: v.colorLabel.trim(),
          }))
      : [];

    let stockTotal = Number(productData.stock) || 0;
    if (productData.hasVariants) {
      stockTotal = variantsPayload.reduce((a, v) => a + v.stock, 0);
    }

    const payload: Record<string, unknown> = {
      name: productData.name.trim(),
      description: productData.description.trim(),
      sku: productData.sku.trim(),
      hasVariants: productData.hasVariants,
      images: imagesPayload,
      costPrice: Number(productData.costPrice) || 0,
      dimensionalWeight: Number(productData.dimensionalWeight) || 1,
      cargoFee: Math.max(0, Number(productData.cargoFee) || 0),
      price: Number(productData.price) || 0,
      prices: {
        website: Number(productData.priceWebsite) || Number(productData.price) || 0,
        trendyol: Number(productData.priceTrendyol) || Number(productData.price) || 0,
      },
      stock: stockTotal,
      safetyStock: Number(productData.safetyStock) || 0,
      warehouseLocation: productData.warehouseLocation,
      category: productData.categoryPath,
      trendyolCategoryId:
        productData.trendyolCategoryId !== ""
          ? Number(productData.trendyolCategoryId)
          : undefined,
      variants: variantsPayload,
      platforms: [],
    };

    const tySelections = buildAttributeSelections(
      fieldsForProductLevel(tyAttrFields, productData.hasVariants),
      tyAttrValues
    );
    if (tySelections.length > 0) {
      payload.trendyolAttributes = tySelections;
    }

    if (!productData.hasVariants) {
      payload.barcode = productData.barcode.trim();
    } else if (productData.barcode.trim()) {
      payload.barcode = productData.barcode.trim();
    }

    return payload;
  };

  const persistProductForm = async (): Promise<
    { ok: true; id: string } | { ok: false; error: string }
  > => {
    const payload = buildProductPayload();
    const res = editingId
      ? await fetch(`/api/products?id=${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    const text = await res.text();
    let resData: {
      success?: boolean;
      error?: string;
      product?: { _id?: string };
    } = {};
    try {
      resData = text ? JSON.parse(text) : {};
    } catch {
      return {
        ok: false,
        error: `Sunucudan beklenmedik yanıt (HTTP ${res.status}).`,
      };
    }

    if (!res.ok || !resData.success) {
      return {
        ok: false,
        error: resData.error || `Kayıt tamamlanamadı (${res.status}).`,
      };
    }

    const id = String(editingId ?? resData.product?._id ?? "");
    if (!id) {
      return { ok: false, error: "Ürün kaydedildi ancak kimlik alınamadı." };
    }
    if (!editingId && resData.product?._id) {
      setEditingId(String(resData.product._id));
    }
    return { ok: true, id };
  };

  const callTrendyolCreateApi = async (
    productId: string
  ): Promise<{ ok: true; message: string } | { ok: false; error: string }> => {
    const res = await fetch("/api/trendyol/create-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const text = await res.text();
    let data: {
      success?: boolean;
      error?: string;
      message?: string;
      batchRequestId?: string;
      itemErrors?: string[];
    } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return {
        ok: false,
        error: `Trendyol yanıtı okunamadı (HTTP ${res.status}). Oturum süreniz dolmuş olabilir.`,
      };
    }
    if (!data.success) {
      const errText = String(data.error || "").trim();
      const extra =
        Array.isArray(data.itemErrors) && data.itemErrors.length
          ? `\n\n${data.itemErrors.slice(0, 3).join("\n")}`
          : data.batchRequestId
            ? `\n\nİşlem no: ${data.batchRequestId}`
            : "";
      return {
        ok: false,
        error:
          (errText ||
            `Trendyol gönderimi başarısız (HTTP ${res.status}). Ayarlar > Trendyol API bilgilerini kontrol edin.`) +
          extra,
      };
    }
    return {
      ok: true,
      message:
        data.message ||
        "Trendyol onay kuyruğuna alındı. Satıcı panelinde «Onay bekleyenler» listesini kontrol edin.",
    };
  };

  const showTrendyolPublishFeedback = (
    title: string,
    ok: number,
    total: number,
    errs: string[]
  ) => {
    setChannelPushSummary({
      kind: errs.length === 0 ? "success" : ok > 0 ? "partial" : "error",
      title,
      message:
        errs.length === 0 && ok > 0
          ? `${ok}/${total} ürün Trendyol «Onay bekleyenler» kuyruğuna gitti. Satıcı panelinde Ürünler → Onay bekleyenler — onaylı ürünler listesi değil.`
          : ok > 0
            ? `${ok}/${total} ürün gönderildi; ${errs.length} üründe hata var.`
            : "Trendyol yayımlama başarısız — ürün mağazaya gitmedi.",
      errors: errs.length ? errs.slice(0, 8) : undefined,
    });

    if (errs.length === 0 && ok > 0) {
      alert(
        `${title}\n\n${ok}/${total} ürün gönderildi.\n\nTrendyol satıcı paneli:\nÜrünler → Onay bekleyenler\n(Onaylı ürünler listesinde görünmez — 1–5 dk bekleyin.)`
      );
    } else if (errs.length > 0) {
      alert(
        `${ok > 0 ? `${ok}/${total} başarılı.\n\n` : "Yayımlama başarısız.\n\n"}Hatalar:\n${errs.slice(0, 3).join("\n\n")}`
      );
    } else {
      alert(`${title}\n\nGönderim yapılamadı. Ürün seçimi ve zorunlu alanları kontrol edin.`);
    }

    requestAnimationFrame(() => {
      document
        .getElementById("channel-push-summary")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const handleSaveProduct = async () => {
    setModalActionMsg(null);
    const validationError = validateProductForm();
    if (validationError) {
      setModalActionMsg({ kind: "error", text: validationError });
      return;
    }

    try {
      setSavingProduct(true);
      const wasEdit = Boolean(editingId);
      const saved = await persistProductForm();
      if (!saved.ok) {
        setModalActionMsg({ kind: "error", text: saved.error });
        return;
      }

      setModalActionMsg({
        kind: "success",
        text: wasEdit ? "Ürün güncellendi." : "Ürün kaydedildi.",
      });
      await refreshProductsQuiet();
      window.setTimeout(() => closeModal(), 600);
    } catch (err: unknown) {
      setModalActionMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "Kayıt hatası.",
      });
    } finally {
      setSavingProduct(false);
    }
  };

  const requestPublishFromModal = () => {
    setModalActionMsg(null);
    const validationError = validateProductForm();
    if (validationError) {
      setModalActionMsg({ kind: "error", text: validationError });
      return;
    }
    if (!productData.trendyolCategoryId) {
      setModalActionMsg({ kind: "error", text: "Trendyol kategorisi seçin." });
      return;
    }
    const imageCount = images.map((i) => i.url.trim()).filter(Boolean).length;
    if (imageCount === 0) {
      setModalActionMsg({
        kind: "error",
        text: "Trendyol için en az bir görsel gerekli. Görsel yükleyin veya erişilebilir URL girin.",
      });
      return;
    }
    setPublishConfirmOpen(true);
  };

  const confirmPublishFromModal = async () => {
    setPublishConfirmOpen(false);
    setModalActionMsg({ kind: "info", text: "Kaydediliyor ve Trendyol'a gönderiliyor…" });

    try {
      setSavingProduct(true);
      setPushingChannel("publish");
      const saved = await persistProductForm();
      if (!saved.ok) {
        setModalActionMsg({ kind: "error", text: saved.error });
        return;
      }
      const published = await callTrendyolCreateApi(saved.id);
      if (!published.ok) {
        setModalActionMsg({
          kind: "error",
          text: `Trendyol'a gönderilemedi: ${published.error}`,
        });
        showTrendyolPublishFeedback("Trendyol'a Yayımla", 0, 1, [published.error]);
        await refreshProductsQuiet();
        return;
      }
      setModalActionMsg({
        kind: "success",
        text: published.message || "Trendyol onay kuyruğuna alındı. Panelde birkaç dakika içinde görünür.",
      });
      showTrendyolPublishFeedback("Trendyol'a Yayımla", 1, 1, []);
      await refreshProductsQuiet();
      window.setTimeout(() => closeModal(), 900);
    } catch (err: unknown) {
      setModalActionMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "Yayımlama hatası.",
      });
    } finally {
      setSavingProduct(false);
      setPushingChannel(null);
    }
  };

  const openModalForNew = (prefillBarcode?: string) => {
    setEditingId(null);
    const firstLeaf = categoryLeaves[0];
    const hintPath = firstLeaf?.path || "";
    const initialSku = generateModelSku({
      nameHint: "",
      categoryHint: hintPath,
    });
    const scannedBarcode = String(prefillBarcode ?? "").trim();
    setProductData({
      name: "",
      description: "",
      sku: initialSku,
      barcode: scannedBarcode || generateEan13(),
      costPrice: "",
      dimensionalWeight: "1",
      cargoFee: "",
      price: "",
      priceWebsite: "",
      priceTrendyol: "",
      stock: "",
      safetyStock: "2",
      warehouseLocation: "",
      categoryPath: hintPath,
      trendyolCategoryId: firstLeaf ? String(firstLeaf.categoryId) : "",
      hasVariants: false,
    });
    setImages([{ url: "" }]);
    setVariants([emptyVariant()]);
    setTyAttrFields([]);
    setTyAttrValues({});
    setTyVariantHints({});
    setCategoryPickPath([]);
    setCategorySearch("");
    openProductModal();
    if (firstLeaf) {
      const path = findCategoryPathInTree(categoryTree, firstLeaf.categoryId);
      if (path) setCategoryPickPath(path);
      void loadTyAttributes(String(firstLeaf.categoryId));
    }
  };

  const handleCategoryLevelChange = (levelIdx: number, raw: string) => {
    const val = raw ? Number(raw) : null;
    const nextPath =
      val != null
        ? [...categoryPickPath.slice(0, levelIdx), val]
        : categoryPickPath.slice(0, levelIdx);
    setCategoryPickPath(nextPath);

    if (val == null) {
      setProductData({
        ...productData,
        trendyolCategoryId: "",
        categoryPath: "",
      });
      setTyAttrFields([]);
      setTyAttrValues({});
      setTyVariantHints({});
      return;
    }

    let nodes = categoryTree;
    let node: CategoryTreeNode | undefined;
    for (let i = 0; i < nextPath.length; i++) {
      node = nodes.find((n) => n.categoryId === nextPath[i]);
      if (!node) break;
      nodes = node.children ?? [];
    }

    const isLeaf = Boolean(node?.isLeaf || !node?.children?.length);
    if (isLeaf && node) {
      const leaf = categoryLeaves.find((l) => l.categoryId === node!.categoryId);
      applyCategorySelection(
        node.categoryId,
        leaf?.path ?? node.name
      );
    } else {
      setProductData({
        ...productData,
        trendyolCategoryId: "",
        categoryPath: "",
      });
      setTyAttrFields([]);
      setTyAttrValues({});
      setTyVariantHints({});
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setTyAttrFields([]);
    setTyAttrValues({});
    resetModalActionState();
  };

  const handleSyncTrendyolProducts = async () => {
    setTrendyolSyncing(true);
    setTrendyolSyncSummary(null);
    try {
      const res = await fetch("/api/trendyol/sync-products");
      const text = await res.text();
      if (!text.trim()) {
        setTrendyolSyncSummary({
          kind: "error",
          message: `Sunucu boş yanıt döndü (HTTP ${res.status}).`,
        });
        return;
      }
      let data: {
        success?: boolean;
        message?: string;
        hint?: string;
        error?: string;
        count?: number;
        stats?: {
          trendyolRows: number;
          productGroups: number;
          productsSynced: number;
          productsCreated: number;
          productsUpdated: number;
          variantProducts: number;
          singleProducts: number;
          totalVariantLines: number;
          failedGroups: number;
        };
        errors?: string[];
        mockUsed?: boolean;
        mockOnlyMode?: boolean;
        diagnostics?: unknown;
      };
      try {
        data = JSON.parse(text);
      } catch {
        setTrendyolSyncSummary({
          kind: "error",
          message: `Sunucu yanıtı okunamadı (HTTP ${res.status}).`,
        });
        return;
      }

      const kind: "success" | "partial" | "error" = data.success
        ? data.stats?.failedGroups
          ? "partial"
          : "success"
        : "error";

      const mockHint =
        data.mockOnlyMode === true
          ? "Yalnızca örnek veri modu (TRENDYOL_SYNC_ONLY_MOCK)."
          : data.mockUsed === true
            ? "Test/mock verisi kullanıldı (TRENDYOL_ALLOW_SYNC_MOCK)."
            : undefined;

      setTrendyolSyncSummary({
        kind,
        message: data.message || data.error || "Eşitleme tamamlandı.",
        stats: data.stats,
        hint: [data.hint, mockHint].filter(Boolean).join(" ") || undefined,
        errors: Array.isArray(data.errors) ? data.errors.slice(0, 8) : undefined,
        mockUsed: data.mockUsed,
      });

      if (data.success) {
        setInventoryFilter("all");
        setSearchTerm("");
        setSelectedCategory("Tümü");
        setProductPage(0);
        await refreshProductsQuiet();
      }
    } catch (e: unknown) {
      setTrendyolSyncSummary({
        kind: "error",
        message:
          e instanceof Error
            ? e.message
            : "Ürün senkronizasyonu başarısız (ağ veya sunucu).",
      });
    } finally {
      setTrendyolSyncing(false);
    }
  };

  const handleSyncWeb = async () => {
    try {
      const res = await fetch("/api/store/sync-products");
      const data = await res.json();
      if (data.success) {
        alert(data.message || `${data.count ?? 0} ürün mağazadan aktarıldı.`);
        await refreshProductsQuiet();
      } else {
        alert(data.error || "Mağaza ürün çekimi başarısız.");
      }
    } catch {
      alert("Bağlantı hatası.");
    }
  };

  const trendyolPublishReadiness = (product: {
    name?: string;
    trendyolCategoryId?: number;
    images?: Array<{ url?: string }>;
    hasVariants?: boolean;
    barcode?: string;
    variants?: Array<{ barcode?: string }>;
  }): string | null => {
    const label = String(product.name ?? "Ürün").slice(0, 60);
    if (product.trendyolCategoryId == null || !Number.isFinite(Number(product.trendyolCategoryId))) {
      return `«${label}»: Trendyol kategorisi seçilmemiş (ürünü düzenleyin).`;
    }
    const hasImg =
      Array.isArray(product.images) &&
      product.images.some((im) => String(im?.url ?? "").trim().length > 0);
    if (!hasImg) {
      return `«${label}»: en az bir görsel gerekli.`;
    }
    const { bad } = resolveTrendyolImageUrls(
      (product.images ?? [])
        .map((im) => String(im?.url ?? "").trim())
        .filter(Boolean),
      publicAppUrl
    );
    if (bad.length) {
      return `«${label}»: görsel(ler) Trendyol için herkese açık HTTPS değil.`;
    }
    if (product.hasVariants) {
      const vars = product.variants ?? [];
      if (!vars.length) return `«${label}»: varyant satırı yok.`;
      if (vars.some((v) => !String(v.barcode ?? "").trim())) {
        return `«${label}»: tüm varyantlarda barkod olmalı.`;
      }
    } else if (!String(product.barcode ?? "").trim()) {
      return `«${label}»: barkod gerekli.`;
    }
    return null;
  };

  const runBulkTrendyolPublish = async () => {
    setBulkPublishConfirmOpen(false);
    setPushingChannel("publish");
    setChannelPushSummary(null);
    let ok = 0;
    const errs: string[] = [];
    try {
      for (const id of selectedProductIds) {
        const published = await callTrendyolCreateApi(id);
        if (published.ok) ok++;
        else errs.push(published.error);
      }
      showTrendyolPublishFeedback(
        "Trendyol'a Yayımla",
        ok,
        selectedProductIds.size,
        errs
      );
      if (ok > 0) await refreshProductsQuiet();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Yayımlama hatası.");
    } finally {
      setPushingChannel(null);
    }
  };

  const publishSelectedToTrendyolCreate = () => {
    if (selectedProductIds.size === 0) {
      alert("Önce listede sol sütundan en az bir ürün işaretleyin (checkbox).");
      return;
    }

    const selected = products.filter((p) =>
      selectedProductIds.has(String(p._id))
    );
    const blockers: string[] = [];
    for (const p of selected) {
      const issue = trendyolPublishReadiness(p);
      if (issue) blockers.push(issue);
    }
    if (blockers.length) {
      alert(
        "Yayımlamadan önce düzeltin:\n\n" + blockers.slice(0, 6).join("\n")
      );
      return;
    }

    setBulkPublishConfirmOpen(true);
  };

  const handleActionClick = (action: string, product: any = null) => {
    if (action === "Sil" && product) {
      setSelectedProduct(product);
      setIsDeleteModalOpen(true);
    } else if (action === "Düzenle" && product) {
      setEditingId(product._id);
      const firstLeafMatch =
        product.trendyolCategoryId != null
          ? categoryLeaves.find(
              (l) => l.categoryId === product.trendyolCategoryId
            )
          : null;
      const path =
        firstLeafMatch?.path ||
        product.category ||
        categoryLeaves[0]?.path ||
        "";

      setProductData({
        name: product.name || "",
        description:
          typeof product.description === "string" ? product.description : "",
        sku: product.sku || "",
        barcode: product.barcode || "",
        costPrice: product.costPrice?.toString() || "0",
        dimensionalWeight:
          (product as { dimensionalWeight?: number }).dimensionalWeight?.toString() || "1",
        cargoFee: (product as { cargoFee?: number }).cargoFee?.toString() || "",
        price: product.price?.toString() || "0",
        priceWebsite:
          product.prices?.website?.toString() || product.price?.toString() || "0",
        priceTrendyol:
          product.prices?.trendyol?.toString() || product.price?.toString() || "0",
        stock: product.stock?.toString() || "0",
        safetyStock: product.safetyStock?.toString() || "2",
        warehouseLocation: product.warehouseLocation || "",
        categoryPath: path,
        trendyolCategoryId:
          product.trendyolCategoryId != null
            ? String(product.trendyolCategoryId)
            : firstLeafMatch
              ? String(firstLeafMatch.categoryId)
              : categoryLeaves[0]
                ? String(categoryLeaves[0].categoryId)
                : "",
        hasVariants: !!product.hasVariants,
      });

      const imgs =
        product.images?.length > 0
          ? product.images.map((img: { url: string }) => ({ url: img.url || "" }))
          : [{ url: "" }];
      setImages(imgs);

      if (product.hasVariants && Array.isArray(product.variants)) {
        setVariants(
          product.variants.map((v: any) => ({
            sku: v.sku || "",
            barcode: v.barcode || "",
            stock: String(v.stock ?? 0),
            sizeLabel: v.sizeLabel || "",
            colorLabel: v.colorLabel || "",
          }))
        );
      } else {
        setVariants([emptyVariant()]);
      }

      const editCategoryId =
        product.trendyolCategoryId != null
          ? String(product.trendyolCategoryId)
          : firstLeafMatch
            ? String(firstLeafMatch.categoryId)
            : categoryLeaves[0]
              ? String(categoryLeaves[0].categoryId)
              : "";
      if (editCategoryId) {
        const path = findCategoryPathInTree(
          categoryTree,
          Number(editCategoryId)
        );
        if (path) setCategoryPickPath(path);
        setCategorySearch(
          firstLeafMatch?.path || product.category || ""
        );
        void loadTyAttributes(
          editCategoryId,
          selectionsFromStored(product.trendyolAttributes)
        );
      } else {
        setCategoryPickPath([]);
        setTyAttrFields([]);
        setTyAttrValues({});
        setTyVariantHints({});
      }

      openProductModal();
    } else if (action === "Stok Güncelle" && product) {
      setSelectedProduct(product);
      if (
        product.hasVariants &&
        Array.isArray(product.variants) &&
        product.variants.length > 0
      ) {
        setStockVariantRows(
          product.variants.map((v: {
            sku?: string;
            barcode?: string;
            stock?: number;
            sizeLabel?: string;
            colorLabel?: string;
          }) => ({
            sku: v.sku || "",
            barcode: v.barcode || "",
            stock: String(v.stock ?? 0),
            sizeLabel: v.sizeLabel || "",
            colorLabel: v.colorLabel || "",
          }))
        );
        setNewStockValue("");
      } else {
        setStockVariantRows([]);
        setNewStockValue(String(product.stock ?? 0));
      }
      setIsStockModalOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (!selectedProduct) return;
    try {
      const res = await fetch(`/api/products?id=${selectedProduct._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        alert("Ürün silindi.");
        fetchProducts();
        setIsDeleteModalOpen(false);
        setSelectedProduct(null);
      } else alert(data.error || "Silinemedi.");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Hata");
    }
  };

  const confirmBulkDelete = async () => {
    const ids = [...selectedProductIds];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/products/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `${data.deletedCount ?? ids.length} ürün silindi.`);
        setSelectedProductIds(new Set());
        setIsBulkDeleteModalOpen(false);
        await fetchProducts();
      } else {
        alert(data.error || "Silinemedi.");
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Hata");
    } finally {
      setBulkDeleting(false);
    }
  };

  const confirmStockUpdate = async () => {
    if (!selectedProduct) return;

    const hasVariantRows =
      selectedProduct.hasVariants && stockVariantRows.length > 0;

    if (!hasVariantRows && Number.isNaN(Number(newStockValue))) return;

    setStockSaving(true);
    try {
      let payload: Record<string, unknown>;

      if (hasVariantRows) {
        const variants = stockVariantRows.map((v) => ({
          sku: v.sku.trim(),
          barcode: v.barcode.trim(),
          stock: Math.max(0, Number(v.stock) || 0),
          sizeLabel: v.sizeLabel.trim(),
          colorLabel: v.colorLabel.trim(),
        }));
        payload = {
          hasVariants: true,
          variants,
          stock: variants.reduce((a, v) => a + v.stock, 0),
        };
      } else {
        payload = { stock: Math.max(0, Number(newStockValue) || 0) };
      }

      const res = await fetch(`/api/products?id=${selectedProduct._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        fetchProducts();
        setIsStockModalOpen(false);
        setSelectedProduct(null);
        setStockVariantRows([]);
      } else alert(data.error || "Hata");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Hata");
    } finally {
      setStockSaving(false);
    }
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      turkishTextIncludes(product.name ?? "", searchTerm) ||
      turkishTextIncludes(product.sku ?? "", searchTerm) ||
      turkishTextIncludes(product.barcode ?? "", searchTerm) ||
      (Array.isArray(product.variants) &&
        product.variants.some(
          (v: { sku?: string; barcode?: string; sizeLabel?: string }) =>
            turkishTextIncludes(v.sku ?? "", searchTerm) ||
            turkishTextIncludes(v.barcode ?? "", searchTerm) ||
            turkishTextIncludes(v.sizeLabel ?? "", searchTerm)
        ));
    const matchesCategory =
      selectedCategory === "Tümü" ||
      product.category === selectedCategory ||
      product.category?.includes(selectedCategory);
    const st = Number(product.stock) || 0;
    const matchesInventory =
      inventoryFilter === "all" ||
      (inventoryFilter === "active" && st > 0) ||
      (inventoryFilter === "inactive" && st <= 0);
    return matchesSearch && matchesCategory && matchesInventory;
  });

  const listFinancials = useMemo(
    () => productListFinancials(filteredProducts),
    [filteredProducts]
  );

  const listEmptyReason: "none" | "filter" | "db" =
    products.length === 0
      ? "db"
      : filteredProducts.length === 0
        ? "filter"
        : "none";

  const totalProductPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE)
  );

  useEffect(() => {
    if (productPage > totalProductPages - 1) {
      setProductPage(Math.max(0, totalProductPages - 1));
    }
  }, [filteredProducts.length, totalProductPages, productPage]);

  const pageOffset = productPage * PRODUCT_PAGE_SIZE;
  const paginatedProducts = filteredProducts.slice(
    pageOffset,
    pageOffset + PRODUCT_PAGE_SIZE
  );

  useEffect(() => {
    if (!highlightProductId || filteredProducts.length === 0) return;
    const idx = filteredProducts.findIndex(
      (p) => String(p._id) === highlightProductId
    );
    if (idx < 0) return;
    const targetPage = Math.floor(idx / PRODUCT_PAGE_SIZE);
    if (productPage !== targetPage) {
      setProductPage(targetPage);
      return;
    }
    const t = window.setTimeout(() => {
      document
        .getElementById(`product-row-${highlightProductId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const clear = window.setTimeout(() => setHighlightProductId(null), 8000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(clear);
    };
  }, [highlightProductId, filteredProducts, productPage]);

  const toggleProductRowSelected = (id: string) => {
    setSelectedProductIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const allPageSelected =
    paginatedProducts.length > 0 &&
    paginatedProducts.every((p) =>
      selectedProductIds.has(String(p._id))
    );

  const toggleSelectCurrentPage = () => {
    setSelectedProductIds((prev) => {
      const n = new Set(prev);
      if (allPageSelected) {
        paginatedProducts.forEach((p) => n.delete(String(p._id)));
      } else {
        paginatedProducts.forEach((p) => n.add(String(p._id)));
      }
      return n;
    });
  };

  const pushSelectedToTrendyol = async () => {
    const ids = [...selectedProductIds];
    if (!ids.length) {
      alert("Önce listede ürünleri işaretleyin (sol sütundaki kutular).");
      return;
    }
    setPushingChannel("ty");
    try {
      const res = await fetch("/api/trendyol/push-stock-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: ids }),
      });
      const text = await res.text();
      let data: {
        success?: boolean;
        error?: string;
        message?: string;
        sent?: number;
        skipped?: string[];
      } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setChannelPushSummary({
          kind: "error",
          title: "Trendyol Stok/Fiyat",
          message: `Yanıt okunamadı (HTTP ${res.status}).`,
        });
        return;
      }
      if (data.success) {
        setChannelPushSummary({
          kind:
            Array.isArray(data.skipped) && data.skipped.length ? "partial" : "success",
          title: "Trendyol Stok/Fiyat",
          message: data.message || `${data.sent ?? 0} barkod satırı gönderildi.`,
          errors: data.skipped,
        });
      } else {
        const hint502 =
          res.status === 502
            ? " Ayarlar > Trendyol: Satıcı ID, API Key, Secret ve Marka ID/adı."
            : "";
        setChannelPushSummary({
          kind: "error",
          title: "Trendyol Stok/Fiyat",
          message: (data.error || `Hata (HTTP ${res.status}).`) + hint502,
        });
      }
    } catch (e: unknown) {
      setChannelPushSummary({
        kind: "error",
        title: "Trendyol Stok/Fiyat",
        message: e instanceof Error ? e.message : "Bağlantı hatası.",
      });
    } finally {
      setPushingChannel(null);
    }
  };

  const pushSelectedToWebStore = async () => {
    const ids = [...selectedProductIds];
    if (!ids.length) {
      alert("Önce listede ürünleri işaretleyin (sol sütundaki kutular).");
      return;
    }
    setPushingChannel("web");
    try {
      const res = await fetch("/api/store/push-stock-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: ids }),
      });
      const text = await res.text();
      let data: {
        success?: boolean;
        error?: string;
        message?: string;
        sent?: number;
        endpoint?: string;
        skipped?: string[];
      } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setChannelPushSummary({
          kind: "error",
          title: "Mağazaya Aktar",
          message: `Yanıt okunamadı (HTTP ${res.status}).`,
        });
        return;
      }
      if (data.success) {
        setChannelPushSummary({
          kind:
            Array.isArray(data.skipped) && data.skipped.length ? "partial" : "success",
          title: "Mağazaya Aktar",
          message: data.message || `${data.sent ?? 0} satır gönderildi.`,
          errors: data.skipped,
        });
      } else {
        setChannelPushSummary({
          kind: "error",
          title: "Mağazaya Aktar",
          message:
            (data.error || `Hata (HTTP ${res.status}).`) +
            (data.endpoint ? ` Uç: ${data.endpoint}` : ""),
        });
      }
    } catch (e: unknown) {
      setChannelPushSummary({
        kind: "error",
        title: "Mağazaya Aktar",
        message: e instanceof Error ? e.message : "Bağlantı hatası.",
      });
    } finally {
      setPushingChannel(null);
    }
  };

  const topCategories = [...new Set(categoryLeaves.map((c) => c.path.split(" › ")[0]))];

  const bulkPushDisabled =
    pushingChannel !== null ||
    loading ||
    trendyolSyncing ||
    selectedProductIds.size === 0;

  const bulkDeleteToolbarDisabled =
    loading || selectedProductIds.size === 0 || bulkDeleting;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Ürün Yönetimi (ERP PIM)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Trendyol&apos;da <strong>yeni ürün</strong> açmak için «Yayımla»; panelde zaten kayıtlı ürünün{" "}
            <strong>stok/fiyatını</strong> güncellemek için «Stok/Fiyat Gönder».
            Kanala göndermek için listede ürünleri işaretleyin.
            {selectedProductIds.size > 0 ? (
              <span className="block text-blue-700 font-medium mt-0.5">
                {selectedProductIds.size} ürün seçili
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsBarcodeStockOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-semibold"
          >
            <ScanBarcode size={18} />
            <span>Barkod Giriş/Çıkış</span>
          </button>
          <button
            onClick={syncCategories}
            disabled={categoryLoading}
            className="flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-200 disabled:opacity-50"
          >
            <RefreshCw
              size={18}
              className={categoryLoading ? "animate-spin" : ""}
            />
            <span>Kategori Ağacını Eşitle</span>
          </button>
          <button
            type="button"
            disabled={trendyolSyncing || categoryLoading}
            onClick={() => void handleSyncTrendyolProducts()}
            className="flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-2 rounded-lg hover:bg-orange-200 disabled:opacity-55 disabled:cursor-wait"
          >
            <DownloadCloud
              size={18}
              className={trendyolSyncing ? "animate-pulse" : ""}
            />
            <span>
              {trendyolSyncing ? "Trendyol’dan çekiliyor…" : "Trendyol'dan Çek"}
            </span>
          </button>
          <button
            onClick={() => void handleSyncWeb()}
            className="flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200"
          >
            <DownloadCloud size={18} />
            <span>Siteden Çek</span>
          </button>
          <button
            type="button"
            disabled={bulkPushDisabled || pushingChannel === "publish"}
            onClick={publishSelectedToTrendyolCreate}
            title="Yeni ürün oluşturur — Trendyol onay bekleyenler listesine düşer"
            className="flex items-center gap-2 bg-orange-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {pushingChannel === "publish"
              ? "Yayımlanıyor…"
              : `Trendyol'a Yayımla (${selectedProductIds.size})`}
          </button>
          <button
            type="button"
            disabled={bulkPushDisabled}
            title={
              selectedProductIds.size === 0
                ? "Sol sütundan ürün seçin"
                : "Trendyol'da zaten kayıtlı ürünün stok ve fiyatını günceller — yeni ürün açmaz"
            }
            onClick={() => void pushSelectedToTrendyol()}
            className="flex items-center gap-2 bg-orange-50 text-orange-800 border border-orange-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-100 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            Stok/Fiyat Gönder ({selectedProductIds.size})
          </button>
          <button
            type="button"
            disabled={bulkPushDisabled}
            title={
              selectedProductIds.size === 0
                ? "Sol sütundan ürün seçin"
                : "Seçililerin stok/fiyatını mağaza API’sine gönder"
            }
            onClick={() => void pushSelectedToWebStore()}
            className="flex items-center gap-2 bg-indigo-50 text-indigo-800 border border-indigo-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            Mağazaya Aktar ({selectedProductIds.size})
          </button>
          <button
            type="button"
            disabled={bulkDeleteToolbarDisabled}
            title={
              selectedProductIds.size === 0
                ? "Sol sütundan ürün seçin"
                : "Seçili ürünleri kalıcı olarak sil"
            }
            onClick={() => setIsBulkDeleteModalOpen(true)}
            className="flex items-center gap-2 bg-red-50 text-red-800 border border-red-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <Trash2 size={16} />
            Seçilileri Sil ({selectedProductIds.size})
          </button>
          <button
            onClick={() => openModalForNew()}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            <span>Yeni Ürün</span>
          </button>
        </div>
      </div>

      {trendyolSyncSummary && (
        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            trendyolSyncSummary.kind === "success"
              ? "bg-green-50 border-green-200"
              : trendyolSyncSummary.kind === "partial"
                ? "bg-amber-50 border-amber-200"
                : "bg-red-50 border-red-200"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {trendyolSyncSummary.kind === "error" ? (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    trendyolSyncSummary.kind === "partial"
                      ? "text-amber-600"
                      : "text-green-600"
                  }`}
                />
              )}
              <div className="min-w-0 space-y-2">
                <p
                  className={`font-semibold text-sm ${
                    trendyolSyncSummary.kind === "error"
                      ? "text-red-900"
                      : trendyolSyncSummary.kind === "partial"
                        ? "text-amber-900"
                        : "text-green-900"
                  }`}
                >
                  Trendyol eşitleme özeti
                </p>
                <p className="text-sm text-slate-700">{trendyolSyncSummary.message}</p>
                {trendyolSyncSummary.stats && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white/70 rounded-lg px-3 py-2 border border-slate-200/80">
                      <div className="text-slate-500">Trendyol satırı</div>
                      <div className="font-bold text-slate-900">
                        {trendyolSyncSummary.stats.trendyolRows}
                      </div>
                    </div>
                    <div className="bg-white/70 rounded-lg px-3 py-2 border border-slate-200/80">
                      <div className="text-slate-500">Ürün modeli</div>
                      <div className="font-bold text-slate-900">
                        {trendyolSyncSummary.stats.productsSynced}{" "}
                        <span className="font-normal text-slate-500">
                          ({trendyolSyncSummary.stats.productsCreated} yeni,{" "}
                          {trendyolSyncSummary.stats.productsUpdated} güncellendi)
                        </span>
                      </div>
                    </div>
                    <div className="bg-white/70 rounded-lg px-3 py-2 border border-slate-200/80">
                      <div className="text-slate-500">Varyantlı ürün</div>
                      <div className="font-bold text-slate-900">
                        {trendyolSyncSummary.stats.variantProducts}
                      </div>
                    </div>
                    <div className="bg-white/70 rounded-lg px-3 py-2 border border-slate-200/80">
                      <div className="text-slate-500">Toplam varyant satırı</div>
                      <div className="font-bold text-slate-900">
                        {trendyolSyncSummary.stats.totalVariantLines}
                      </div>
                    </div>
                  </div>
                )}
                {trendyolSyncSummary.hint ? (
                  <p className="text-xs text-slate-600">{trendyolSyncSummary.hint}</p>
                ) : null}
                {trendyolSyncSummary.errors?.length ? (
                  <ul className="text-xs text-red-700 list-disc pl-4 space-y-0.5">
                    {trendyolSyncSummary.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTrendyolSyncSummary(null)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-white/80 hover:text-slate-800 shrink-0"
              aria-label="Özeti kapat"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {channelPushSummary && (
        <div
          id="channel-push-summary"
          className={`rounded-2xl border p-4 shadow-sm ${
            channelPushSummary.kind === "success"
              ? "bg-green-50 border-green-200"
              : channelPushSummary.kind === "partial"
                ? "bg-amber-50 border-amber-200"
                : "bg-red-50 border-red-200"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <p className="font-semibold text-sm text-slate-900">
                {channelPushSummary.title}
              </p>
              <p className="text-sm text-slate-700">{channelPushSummary.message}</p>
              {channelPushSummary.errors?.length ? (
                <ul className="text-xs text-red-700 list-disc pl-4 space-y-0.5">
                  {channelPushSummary.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setChannelPushSummary(null)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-white/80 hover:text-slate-800 shrink-0"
              aria-label="Özeti kapat"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="erp-card p-4 md:p-5 min-w-0">
        <div className="flex flex-col gap-4 mb-4">
          <div className="relative w-full">
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Ürün adı, SKU veya barkod ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="erp-input pl-11"
            />
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--erp-text-muted)]"
              size={20}
            />
          </div>
          <div className="erp-scroll-x flex gap-2 pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategory("Tümü")}
              className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold touch-target-sm ${
                selectedCategory === "Tümü"
                  ? "bg-[var(--erp-accent)] text-white dark:text-[#0f1210]"
                  : "bg-[var(--erp-surface-2)] text-[var(--erp-text-muted)] border border-[var(--erp-border)]"
              }`}
            >
              Tümü
            </button>
            {topCategories.slice(0, 5).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedCategory(t)}
                className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold max-w-[10rem] truncate touch-target-sm ${
                  selectedCategory === t
                    ? "bg-[var(--erp-accent)] text-white dark:text-[#0f1210]"
                    : "bg-[var(--erp-surface-2)] text-[var(--erp-text-muted)] border border-[var(--erp-border)]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="erp-scroll-x flex gap-2 items-center mb-4 pb-4 border-b border-[var(--erp-border)]">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-1">
            Stok
          </span>
          {(
            [
              { id: "all" as const, label: "Tümü" },
              { id: "active" as const, label: "Aktif (stoklu)" },
              { id: "inactive" as const, label: "Pasif (stoksuz)" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setInventoryFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                inventoryFilter === tab.id
                  ? tab.id === "active"
                    ? "bg-emerald-600 text-white"
                    : tab.id === "inactive"
                      ? "bg-slate-600 text-white"
                      : "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Yükleniyor...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-12 text-center text-slate-500 max-w-lg mx-auto space-y-3 px-4">
            {productsFetchError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm p-4 text-left">
                <p className="font-semibold">Ürün listesi API’den alınamadı</p>
                <p className="mt-1 whitespace-pre-wrap">{productsFetchError}</p>
                <button
                  type="button"
                  onClick={() => void fetchProducts()}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-red-100 text-red-900 text-sm font-medium hover:bg-red-200"
                >
                  Tekrar dene
                </button>
              </div>
            ) : (
              <>
                <p className="font-medium text-slate-600">
                  {listEmptyReason === "db"
                    ? "Henüz kayıtlı ürün yok."
                    : "Filtre / arama sonucu boş."}
                </p>
                <p className="text-sm">
                  {listEmptyReason === "db"
                    ? "Önce Ayarlar > Trendyol’da Satıcı ID + API Key + Secret kaydedin, ardından «Trendyol’dan Çek» deyin. Liste yine boşsa Trendyol panelinde onaylı ürün olmalı veya .env.local içinde TRENDYOL_ALLOW_SYNC_MOCK=1 ile test verisi yükleyin. Kalıcı kayıt için MONGODB_URI kullanın (bellek içi DB’de sunucu her yeniden başlayınca veri kaybolabilir)."
                    : "Üstteki «Stok» bölümünde Tümü seçin, kategori Tümü olsun, arama kutusunu temizleyin. Trendyol’dan gelen ürünler stok 0 ise «Aktif (stoklu)» sekmesinde görünmez."}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {paginatedProducts.map((product) => {
                const thumb = product.images?.[0]?.url;
                const stockQty = productStockUnits(product);
                const listPrice = Number(product.price) || 0;
                const tyPrice = Number(product.prices?.trendyol) || listPrice;
                return (
                  <article
                    key={product._id}
                    id={`product-row-${product._id}`}
                    className={`erp-card p-4 space-y-3 ${
                      highlightProductId === String(product._id) ? "ring-2 ring-[var(--erp-accent)]" : ""
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="w-16 h-16 rounded-xl bg-[var(--erp-surface-2)] overflow-hidden flex items-center justify-center shrink-0 border border-[var(--erp-border)]">
                        {thumb ? (
                          <img src={thumb} alt="" className="object-cover w-full h-full" />
                        ) : (
                          <ImageIcon size={22} className="text-[var(--erp-text-muted)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1 rounded border-[var(--erp-border)]"
                            checked={selectedProductIds.has(String(product._id))}
                            onChange={() => toggleProductRowSelected(String(product._id))}
                            aria-label={`Seç: ${product.name}`}
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-[var(--erp-text)] leading-snug">{product.name}</p>
                            <p className="text-xs erp-muted mt-1 font-mono">{product.sku}</p>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 px-2.5 py-1 rounded-full text-sm font-bold ${
                          product.stock > (product.safetyStock ?? 2)
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-red-500/15 text-red-700 dark:text-red-300"
                        }`}
                      >
                        {stockQty}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 rounded-lg bg-[var(--erp-surface-2)]">Liste ₺{listPrice.toFixed(0)}</span>
                      <span className="px-2 py-1 rounded-lg bg-orange-500/10 text-orange-700 dark:text-orange-300">TY ₺{tyPrice.toFixed(0)}</span>
                      {product.barcode ? (
                        <span className="px-2 py-1 rounded-lg bg-[var(--erp-surface-2)] font-mono truncate max-w-full">
                          {product.barcode}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleActionClick("Düzenle", product)}
                        className="erp-btn erp-btn-secondary text-sm py-3"
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        onClick={() => handleActionClick("Stok Güncelle", product)}
                        className="erp-btn erp-btn-primary text-sm py-3"
                      >
                        Stok
                      </button>
                      <button
                        type="button"
                        onClick={() => handleActionClick("Sil", product)}
                        className="erp-btn erp-btn-ghost text-sm py-3 text-red-600"
                      >
                        Sil
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden lg:block w-full min-w-0">
              <table className="w-full table-fixed text-left border-collapse text-sm">
                <colgroup>
                  <col className="w-9" />
                  <col className="w-11" />
                  <col className="w-[28%]" />
                  <col className="w-[14%]" />
                  <col className="w-[11%]" />
                  <col className="w-[16%]" />
                  <col className="w-[4.5rem]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-1 text-center" title="Bu sayfadaki ürünler — toplu kanal gönderimi">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={allPageSelected}
                        onChange={toggleSelectCurrentPage}
                        disabled={paginatedProducts.length === 0}
                        aria-label="Bu sayfadaki tümünü seç"
                      />
                    </th>
                  <th className="py-2.5 px-1">Görsel</th>
                  <th className="py-2.5 px-2 font-medium">Ürün</th>
                  <th className="py-2.5 px-2 font-medium">Kodlar</th>
                  <th className="py-2.5 px-2 font-medium">Stok</th>
                  <th className="py-2.5 px-2 font-medium">Fiyat / kâr</th>
                  <th className="py-2.5 px-1 font-medium text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((product) => {
                  const thumb = product.images?.[0]?.url;
                  const syncStock = Math.max(
                    0,
                    product.stock - (product.safetyStock || 0)
                  );
                  const listPrice = Number(product.price) || 0;
                  const tyPrice =
                    Number(product.prices?.trendyol) || listPrice;
                  const cost = Number(product.costPrice) || 0;
                  const unitNetKar = tyPrice - cost;
                  const stockQty = productStockUnits(product);
                  const stockNetKar = unitNetKar * stockQty;
                  return (
                    <tr
                      key={product._id}
                      id={`product-row-${product._id}`}
                      className={`border-b border-slate-100 hover:bg-slate-50 ${
                        highlightProductId === String(product._id)
                          ? "bg-blue-50 ring-2 ring-inset ring-blue-300"
                          : ""
                      }`}
                    >
                      <td
                        className="py-3 px-2 text-center align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={selectedProductIds.has(String(product._id))}
                          onChange={() =>
                            toggleProductRowSelected(String(product._id))
                          }
                          aria-label={`Seç: ${product.name}`}
                        />
                      </td>
                      <td className="py-3 px-2 align-middle">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <ImageIcon size={18} className="text-slate-300" />
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 overflow-hidden align-top">
                        <div className="font-medium text-slate-800 flex items-center gap-1 min-w-0">
                          <span className="truncate" title={product.name}>{product.name}</span>
                          {product.hasVariants && (
                            <span title="Varyantlı ürün">
                              <Layers
                                size={14}
                                className="text-indigo-500 shrink-0"
                              />
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate" title={product.category}>
                          {product.category}
                        </div>
                        {product.hasVariants &&
                          Array.isArray(product.variants) &&
                          product.variants.length > 0 && (
                            <div className="mt-1 text-[10px] text-slate-600 space-y-0.5 overflow-hidden">
                              {product.variants.slice(0, 4).map((v: any, idx: number) => {
                                const tag = [v.sizeLabel, v.colorLabel]
                                  .filter(
                                    (x: string) =>
                                      x && String(x).trim() && x !== "—"
                                  )
                                  .join(" · ");
                                const label =
                                  tag ||
                                  (v.sku
                                    ? String(v.sku).replace(/^TY-/, "")
                                    : "—");
                                return (
                                  <div
                                    key={`${String(v.sku)}-${String(v.barcode ?? '')}-${idx}`}
                                    className="flex justify-between gap-2 border-l-2 border-indigo-100 pl-1.5"
                                  >
                                    <span className="truncate" title={label}>
                                      {label}
                                    </span>
                                    <span className="shrink-0 font-semibold tabular-nums">
                                      {v.stock ?? 0} ad.
                                    </span>
                                  </div>
                                );
                              })}
                              {product.variants.length > 4 ? (
                                <div className="text-slate-400">+{product.variants.length - 4} varyant</div>
                              ) : null}
                            </div>
                          )}
                      </td>
                      <td className="py-2.5 px-2 font-mono text-[11px] text-slate-600 overflow-hidden align-top">
                        <div className="truncate" title={product.sku}>{product.sku}</div>
                        <div className="truncate" title={product.barcode}>{product.barcode}</div>
                      </td>
                      <td className="py-2.5 px-2 align-top">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                product.stock > (product.safetyStock ?? 2)
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {product.stock}
                              {product.hasVariants &&
                                Array.isArray(product.variants) &&
                                product.variants.length > 1 && (
                                  <span className="font-normal opacity-80 ml-0.5">(t)</span>
                                )}
                            </span>
                            {product.stock <= (product.safetyStock ?? 2) && (
                              <AlertTriangle
                                size={13}
                                className="text-red-500 shrink-0"
                              />
                            )}
                            <span className="text-[10px] text-slate-400">
                              s:{syncStock}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 align-top overflow-hidden">
                        <p className="text-[11px] text-slate-800 truncate" title={`Liste ${listPrice} TY ${tyPrice}`}>
                          L ₺{listPrice.toFixed(0)} · TY ₺{tyPrice.toFixed(0)}
                        </p>
                        <p
                          className={`text-[11px] font-semibold truncate ${
                            unitNetKar >= 0 ? "text-green-700" : "text-red-600"
                          }`}
                        >
                          Kâr ₺{unitNetKar.toFixed(2)}/ad
                        </p>
                        {stockQty > 0 ? (
                          <p className="text-[10px] text-green-600 truncate">
                            Stok: ₺{stockNetKar.toFixed(0)}
                          </p>
                        ) : null}
                        {cost <= 0 ? (
                          <p className="text-[10px] text-amber-600 truncate">Maliyet yok</p>
                        ) : null}
                      </td>
                      <td className="py-2.5 px-1 align-middle">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                            title="Düzenle"
                            onClick={() => handleActionClick("Düzenle", product)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md"
                            title="Stok güncelle"
                            onClick={() => handleActionClick("Stok Güncelle", product)}
                          >
                            <Package size={15} />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                            title="Sil"
                            onClick={() => handleActionClick("Sil", product)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-600">
                Toplam{" "}
                <span className="font-semibold">{filteredProducts.length}</span>{" "}
                ürün · Sayfa{" "}
                <span className="font-semibold">{productPage + 1}</span> /{" "}
                <span className="font-semibold">{totalProductPages}</span> ·{" "}
                <span className="font-semibold">{PRODUCT_PAGE_SIZE}</span>
                {" "}/ sayfa
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={productPage <= 0}
                  onClick={() => setProductPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Önceki
                </button>
                <button
                  type="button"
                  disabled={productPage >= totalProductPages - 1}
                  onClick={() =>
                    setProductPage((p) =>
                      Math.min(totalProductPages - 1, p + 1)
                    )
                  }
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Sonraki
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Stok adedi (filtre)
                </p>
                <p className="font-bold text-slate-800 tabular-nums">
                  {listFinancials.units.toLocaleString("tr-TR")}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Stok maliyet değeri
                </p>
                <p className="font-bold text-slate-800 tabular-nums">
                  ₺{listFinancials.costValue.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Tahmini net kâr (stok × TY fiyat − maliyet)
                </p>
                <p className="font-bold text-green-700 tabular-nums">
                  ₺{listFinancials.netProfit.toFixed(2)}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 px-1">
              Gerçekleşen sipariş kârı için Siparişler sayfasına bakın. Trendyol
              siparişleri ERP açıkken otomatik çekilir ve stok düşer.
            </p>
          </>
        )}
      </div>

      {isClient &&
        isModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              aria-label="Kapat"
              className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
              onClick={closeModal}
            />
            <div
              className="relative bg-white w-full max-w-4xl rounded-2xl shadow-xl flex flex-col max-h-[min(92vh,900px)] min-h-0 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? "Ürünü düzenle" : "Yeni ürün"}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600"
              >
                Kapat
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Ürün adı *
                  </label>
                  <input
                    type="text"
                    value={productData.name}
                    onChange={(e) =>
                      setProductData({ ...productData, name: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Layers size={14} />
                    Ürün / model kodu (SKU) *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={productData.sku}
                      onChange={(e) =>
                        setProductData({ ...productData, sku: e.target.value })
                      }
                      onBlur={() => {
                        if (!productData.hasVariants) return;
                        const base = productData.sku.trim();
                        if (!base) return;
                        setVariants((prev) =>
                          prev.map((row, i) => ({
                            ...row,
                            sku: variantSkuFromParts(
                              base,
                              row.colorLabel,
                              row.sizeLabel,
                              i
                            ),
                          }))
                        );
                      }}
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-lg outline-none"
                      placeholder={
                        productData.hasVariants
                          ? "örn: EAY-XXXXX"
                          : "örn: EAY-XXXXX"
                      }
                    />
                    <button
                      type="button"
                      onClick={handleGenerateSku}
                      className="px-3 py-2 text-sm bg-slate-100 rounded-lg border"
                    >
                      Üret
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Ürün açıklaması
                </label>
                <textarea
                  value={productData.description}
                  onChange={(e) =>
                    setProductData({
                      ...productData,
                      description: e.target.value,
                    })
                  }
                  rows={4}
                  placeholder="Liste ve kanallar için kısa açıklama (Trendyol’da yayın gereksinimi vb.)"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y min-h-[100px]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">
                    Trendyol kategori ara ve seç
                  </label>

                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={categorySearch}
                      onChange={(e) => {
                        setCategorySearch(e.target.value);
                        setCategorySearchOpen(true);
                      }}
                      onFocus={() => setCategorySearchOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => setCategorySearchOpen(false), 180);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && filteredCategoryLeaves[0]) {
                          e.preventDefault();
                          applyCategorySelection(filteredCategoryLeaves[0].categoryId);
                        }
                        if (e.key === "Escape") setCategorySearchOpen(false);
                      }}
                      placeholder="Yazın: elbise, çocuk tişört, bebek body, kız çocuk…"
                      className="w-full pl-9 pr-4 py-2.5 border border-orange-200 rounded-lg outline-none text-sm focus:ring-2 focus:ring-orange-400 bg-white"
                    />
                    {categorySearchOpen && categorySearch.trim() ? (
                      <ul
                        className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                        role="listbox"
                      >
                        {filteredCategoryLeaves.length === 0 ? (
                          <li className="px-3 py-2.5 text-sm text-slate-500">
                            «{categorySearch}» ile eşleşen kategori yok. Farklı
                            kelime deneyin veya aşağıdaki ağaçtan seçin.
                          </li>
                        ) : (
                          filteredCategoryLeaves.map((c) => (
                            <li key={c.categoryId}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={
                                  String(c.categoryId) ===
                                  productData.trendyolCategoryId
                                }
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() =>
                                  applyCategorySelection(c.categoryId)
                                }
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 border-b border-slate-50 last:border-0 ${
                                  String(c.categoryId) ===
                                  productData.trendyolCategoryId
                                    ? "bg-orange-50 font-medium text-orange-900"
                                    : "text-slate-800"
                                }`}
                              >
                                {c.path}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </div>

                  <p className="text-xs text-slate-500">
                    {categorySearch.trim()
                      ? `${filteredCategoryLeaves.length} sonuç — tıklayın veya Enter ile ilkini seçin`
                      : "En az bir kelime yazın; tüm yol eşleşir (örn. «çocuk tişört»)"}
                  </p>

                  <details className="rounded-lg border border-slate-200 bg-slate-50/80">
                    <summary className="cursor-pointer px-3 py-2 text-sm text-slate-600 select-none">
                      İsterseniz ağaçtan sırayla seçin
                    </summary>
                    <div className="space-y-2 p-3 pt-0 border-t border-slate-100">
                      {categoryTree.length > 0 ? (
                        categoryCascadeLevels.map((levelNodes, levelIdx) => (
                          <select
                            key={`cat-level-${levelIdx}`}
                            value={categoryPickPath[levelIdx] ?? ""}
                            onChange={(e) =>
                              handleCategoryLevelChange(levelIdx, e.target.value)
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none bg-white text-sm"
                          >
                            <option value="">
                              {levelIdx === 0
                                ? "Ana kategori…"
                                : "Alt kategori…"}
                            </option>
                            {levelNodes.map((n) => (
                              <option key={n.categoryId} value={n.categoryId}>
                                {n.name}
                                {n.isLeaf ? " ✓" : ""}
                              </option>
                            ))}
                          </select>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400">
                          Önce «Kategori Ağacını Eşitle» çalıştırın.
                        </p>
                      )}
                    </div>
                  </details>

                  {productData.categoryPath ? (
                    <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                      Seçili: <strong>{productData.categoryPath}</strong>
                      {productData.trendyolCategoryId
                        ? ` (ID: ${productData.trendyolCategoryId})`
                        : null}
                    </p>
                  ) : null}

                  <p className="text-xs text-slate-400 flex items-start gap-1">
                    <Link2 size={12} className="mt-0.5 shrink-0" />
                    Trendyol yalnızca en alt (yaprak) kategoride ürün kabul eder.
                    Arama kutusu en hızlı yol; ağaç seçimi isteğe bağlıdır.
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer w-fit md:col-span-2">
                  <input
                    type="checkbox"
                    checked={productData.hasVariants}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      let nextSku = productData.sku.trim();
                      if (!nextSku) {
                        nextSku = generateModelSku({
                          nameHint: productData.name,
                          categoryHint:
                            productData.categoryPath ||
                            categoryLeaves[0]?.path ||
                            "",
                        });
                      }
                      setProductData({
                        ...productData,
                        hasVariants: checked,
                        sku: nextSku,
                      });
                      if (checked) {
                        setVariants((prev) =>
                          prev.map((row, i) => ({
                            ...row,
                            sku: variantSkuFromParts(
                              nextSku,
                              row.colorLabel,
                              row.sizeLabel,
                              i
                            ),
                            barcode: row.barcode.trim()
                              ? row.barcode
                              : generateEan13(),
                          }))
                        );
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span className="text-sm font-semibold text-slate-800">
                    Varyantlı ürün (beden / renk — öznitelik formundan ayrı)
                  </span>
                </label>

                {productData.trendyolCategoryId ? (
                  <div className="md:col-span-2 space-y-3 rounded-lg border border-slate-200 p-4 bg-slate-50/50">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium text-slate-700">
                        Trendyol kategori öznitelikleri
                      </label>
                      {tyAttrLoading ? (
                        <span className="text-xs text-slate-400">Yükleniyor…</span>
                      ) : null}
                    </div>
                    {!tyAttrLoading && tyAttrFields.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Bu kategori için öznitelik bulunamadı veya Trendyol API
                        yanıt vermedi.
                      </p>
                    ) : null}
                    {productData.hasVariants &&
                    productLevelTyFields.length < tyAttrFields.length ? (
                      <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                        Trendyol paneli gibi: Beden, Renk ve Yaş öznitelikleri bu
                        bölümde <strong>gösterilmez</strong> — yalnızca aşağıdaki{" "}
                        <strong>varyant satırlarından</strong> gönderilir (Cinsiyet,
                        Menşei, Web Color vb. burada kalır).
                      </p>
                    ) : null}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {productLevelTyFields.map((field) => {
                        const sel = tyAttrValues[field.attributeId] ?? {};
                        return (
                          <div key={field.attributeId} className="space-y-1">
                            <label className="text-xs font-medium text-slate-600 flex flex-wrap items-center gap-1">
                              <span>
                                {field.name}
                                {field.required ? (
                                  <span className="text-red-500"> *</span>
                                ) : null}
                              </span>
                            </label>
                            {field.values.length > 0 ? (
                              <select
                                value={sel.valueId ?? ""}
                                onChange={(e) => {
                                  const valueId = e.target.value
                                    ? Number(e.target.value)
                                    : undefined;
                                  setTyAttrValues((prev) => ({
                                    ...prev,
                                    [field.attributeId]: {
                                      valueId,
                                      custom: undefined,
                                    },
                                  }));
                                }}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                              >
                                <option value="">Seçin…</option>
                                {field.values.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {field.allowCustom || field.values.length === 0 ? (
                              <input
                                type="text"
                                placeholder={
                                  field.values.length
                                    ? "Özel değer (liste dışı)"
                                    : "Değer girin"
                                }
                                value={sel.custom ?? ""}
                                onChange={(e) =>
                                  setTyAttrValues((prev) => ({
                                    ...prev,
                                    [field.attributeId]: {
                                      ...prev[field.attributeId],
                                      custom: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-400">
                      Yıldızlı alanlar ürün düzeyinde zorunludur (Trendyol panelindeki
                      genel özellikler). Varyantlı üründe beden/renk/yaş ayrı tabloda.
                    </p>
                  </div>
                ) : null}
              </div>

              {!productData.hasVariants && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Barkod (EAN) *
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={productData.barcode}
                          onChange={(e) =>
                            setProductData({
                              ...productData,
                              barcode: e.target.value,
                            })
                          }
                          className="flex-1 px-4 py-2 border rounded-lg outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleGenerateBarcode}
                          className="px-3 py-2 bg-slate-100 rounded-lg border text-sm"
                        >
                          Üret
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Fiili stok
                      </label>
                      <input
                        type="number"
                        value={productData.stock}
                        onChange={(e) =>
                          setProductData({
                            ...productData,
                            stock: e.target.value,
                          })
                        }
                        className="w-full px-4 py-2 border rounded-lg outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {productData.hasVariants && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">
                      Varyant satırları
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVariantBuilderOpen((o) => !o)}
                        className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded border border-slate-200 bg-white"
                      >
                        {variantBuilderOpen ? "Oluşturucuyu gizle" : "Hazır varyant"}
                      </button>
                      <button
                        type="button"
                        onClick={addVariantRow}
                        className="text-sm text-blue-600 font-medium"
                      >
                        + Satır ekle
                      </button>
                    </div>
                  </div>

                  {variantBuilderOpen ? (
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            Hazır varyant oluştur
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Renk × beden kombinasyonları otomatik satır olur
                          </p>
                        </div>
                        <div className="text-xs font-medium text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
                          {matrixColors.length} renk × {matrixSizes.length} beden
                          = <strong>{matrixRowCount || 0}</strong> satır
                        </div>
                      </div>

                      <div className="p-4 space-y-4">
                        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit max-w-full">
                          {(["kids", "adult", "shoes"] as const).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => handleSizePresetChange(kind)}
                              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                                sizePresetKind === kind
                                  ? "bg-white text-indigo-700 shadow-sm"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              {sizePresetLabel(kind)}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="rounded-lg border border-slate-100 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                                Renkler
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  setMatrixColors(
                                    matrixColors.length ===
                                      variantColorOptions.length
                                      ? []
                                      : [...variantColorOptions]
                                  )
                                }
                                className="text-[11px] text-orange-700 hover:underline"
                              >
                                {matrixColors.length === variantColorOptions.length
                                  ? "Temizle"
                                  : "Tümü"}
                              </button>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto pr-1">
                              {variantColorOptions.map((c) => {
                                const on = isSelectedInList(matrixColors, c);
                                return (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() =>
                                      setMatrixColors(toggleInList(matrixColors, c))
                                    }
                                    className={`text-xs px-2 py-1.5 rounded-md border text-center truncate transition-colors ${
                                      on
                                        ? "bg-orange-600 text-white border-orange-600"
                                        : "bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300"
                                    }`}
                                    title={c}
                                  >
                                    {c}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="rounded-lg border border-slate-100 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                                {sizePresetLabel(sizePresetKind)}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  setMatrixSizes(
                                    matrixSizes.length === variantSizeOptions.length
                                      ? []
                                      : [...variantSizeOptions]
                                  )
                                }
                                className="text-[11px] text-indigo-700 hover:underline"
                              >
                                {matrixSizes.length === variantSizeOptions.length
                                  ? "Temizle"
                                  : "Tümü"}
                              </button>
                            </div>
                            <div
                              className={`grid gap-1.5 max-h-36 overflow-y-auto pr-1 ${
                                sizePresetKind === "shoes"
                                  ? "grid-cols-5 sm:grid-cols-6"
                                  : sizePresetKind === "adult"
                                    ? "grid-cols-5"
                                    : "grid-cols-3 sm:grid-cols-4"
                              }`}
                            >
                              {variantSizeOptions.map((s) => {
                                const on = isSelectedInList(matrixSizes, s);
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() =>
                                      setMatrixSizes(toggleInList(matrixSizes, s))
                                    }
                                    className={`text-xs px-1.5 py-1.5 rounded-md border text-center truncate transition-colors ${
                                      on
                                        ? "bg-indigo-600 text-white border-indigo-600"
                                        : "bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300"
                                    }`}
                                    title={s}
                                  >
                                    {s}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={matrixRowCount === 0}
                          onClick={() => buildVariantsFromMatrix(true)}
                          className="text-sm font-semibold bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {matrixRowCount || 0} satır oluştur
                        </button>
                        <button
                          type="button"
                          disabled={matrixRowCount === 0}
                          onClick={() => buildVariantsFromMatrix(false)}
                          className="text-sm font-medium bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                        >
                          Listeye ekle
                        </button>
                        <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-slate-200">
                          <span className="text-xs text-slate-600 whitespace-nowrap">
                            Toplu stok
                          </span>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={bulkVariantStock}
                            onChange={(e) => setBulkVariantStock(e.target.value)}
                            className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
                          />
                          <button
                            type="button"
                            disabled={variants.length === 0}
                            onClick={applyBulkStockToVariants}
                            className="text-sm font-medium bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            Tüm satırlara uygula
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setMatrixColors([]);
                            setMatrixSizes([]);
                          }}
                          className="text-sm text-slate-500 hover:text-slate-800 ml-auto"
                        >
                          Seçimi sıfırla
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 text-left border-b">
                          <th className="py-2 px-2">Renk</th>
                          <th className="py-2 px-2">Beden</th>
                          <th className="py-2 px-2 whitespace-nowrap">
                            SKU *
                            <span className="font-normal text-slate-400">
                              {" "}
                              · otomatik
                            </span>
                          </th>
                          <th className="py-2 px-2 whitespace-nowrap">
                            Barkod *
                            <span className="font-normal text-slate-400">
                              {" "}
                              · otomatik
                            </span>
                          </th>
                          <th className="py-2 px-2">Stok</th>
                          <th className="py-2 px-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {variants.map((row, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="py-2 px-2 align-middle">
                              <select
                                className="w-full min-w-[100px] px-2 py-1 border rounded text-sm bg-white"
                                value={row.colorLabel}
                                onChange={(e) => {
                                  updateVariantRow(
                                    idx,
                                    "colorLabel",
                                    e.target.value
                                  );
                                  applyVariantCodes(idx);
                                }}
                              >
                                <option value="">Renk…</option>
                                {uniqueStrings([
                                  ...variantColorOptions,
                                  row.colorLabel,
                                ]).map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-2 align-middle">
                              <select
                                className="w-full min-w-[100px] px-2 py-1 border rounded text-sm bg-white"
                                value={row.sizeLabel}
                                onChange={(e) => {
                                  updateVariantRow(
                                    idx,
                                    "sizeLabel",
                                    e.target.value
                                  );
                                  applyVariantCodes(idx);
                                }}
                              >
                                <option value="">Beden/yaş…</option>
                                {uniqueStrings([
                                  ...variantSizeOptions,
                                  row.sizeLabel,
                                ]).map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-2 align-middle">
                              <div className="flex gap-1 items-center min-w-[120px]">
                                <input
                                  className="w-full flex-1 min-w-0 px-2 py-1 border rounded font-mono text-xs"
                                  value={row.sku}
                                  onChange={(e) =>
                                    updateVariantRow(
                                      idx,
                                      "sku",
                                      e.target.value
                                    )
                                  }
                                />
                                <button
                                  type="button"
                                  title="SKU’yu model + renk/beden ile yeniden üret"
                                  onClick={() => applyVariantCodes(idx)}
                                  className="p-1.5 shrink-0 text-slate-400 hover:text-emerald-700 rounded border border-transparent hover:border-emerald-200 hover:bg-emerald-50"
                                >
                                  <RefreshCw size={14} />
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-2 align-middle">
                              <div className="flex gap-1 items-center min-w-[120px]">
                                <input
                                  className="w-full flex-1 min-w-0 px-2 py-1 border rounded font-mono text-xs"
                                  value={row.barcode}
                                  onChange={(e) =>
                                    updateVariantRow(
                                      idx,
                                      "barcode",
                                      e.target.value
                                    )
                                  }
                                />
                                <button
                                  type="button"
                                  title="Yeni EAN-13 barkod üret"
                                  onClick={() => applyVariantCodes(idx, true)}
                                  className="p-1.5 shrink-0 text-slate-400 hover:text-emerald-700 rounded border border-transparent hover:border-emerald-200 hover:bg-emerald-50"
                                >
                                  <RefreshCw size={14} />
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-2 align-middle">
                              <input
                                type="number"
                                min={0}
                                className="w-20 px-2 py-1 border rounded"
                                value={row.stock}
                                onChange={(e) =>
                                  updateVariantRow(
                                    idx,
                                    "stock",
                                    e.target.value
                                  )
                                }
                              />
                            </td>
                            <td className="py-2 px-1 align-middle">
                              <button
                                type="button"
                                onClick={() => removeVariantRow(idx)}
                                className="p-2 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500">
                    Toplam stok otomatik: varyant stokları toplanarak kaydedilir.
                  </p>
                </div>
              )}

              <div className="space-y-3 border-t border-slate-100 pt-6">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <ImageIcon size={16} /> Ürün görselleri
                  </span>
                  <button
                    type="button"
                    onClick={addImageRow}
                    className="text-sm text-blue-600"
                  >
                    + Görsel ekle
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Canlı sitede «Görsel seç» ile yükleyin — dosyalar Vercel Blob&apos;a
                  kaydedilir ve Trendyol&apos;a HTTPS link olarak gider. İsterseniz doğrudan{" "}
                  <strong>https://</strong> CDN linki de yapıştırabilirsiniz.
                </p>
                {!publicAppUrl ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Yayımlama adresi henüz kayıtlı değil; canlı sitede otomatik
                    doldurulacak. «Görsel seç» ile yüklemeniz yeterli (Blob HTTPS).
                  </p>
                ) : (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                    Görsel yayımlama adresi: <span className="font-mono">{publicAppUrl}</span>
                  </p>
                )}
                <div className="space-y-2">
                  {images.map((im, idx) => (
                    <div
                      key={idx}
                      className="flex gap-3 items-start bg-slate-50 p-3 rounded-xl"
                    >
                      {(im.url.trim().startsWith("http") ||
                        im.url.trim().startsWith("/")) && (
                        <div className="w-16 h-16 shrink-0 rounded-lg border bg-white overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={im.url.trim()}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 flex flex-col gap-2 min-w-0">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 w-fit rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 hover:border-emerald-300 hover:bg-emerald-50/50">
                          <Upload size={16} className="text-slate-500" />
                          {uploadingIdx === idx
                            ? "Yükleniyor…"
                            : im.url.trim()
                              ? "Görseli değiştir"
                              : "Görsel seç"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            disabled={uploadingIdx === idx}
                            onChange={(e) => {
                              uploadImageAt(
                                idx,
                                e.target.files?.[0] ?? null
                              );
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <input
                          type="url"
                          placeholder="https://… (Blob veya CDN)"
                          value={im.url}
                          onChange={(e) =>
                            setImages((prev) => {
                              const n = [...prev];
                              n[idx] = { url: e.target.value };
                              return n;
                            })
                          }
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono bg-white"
                        />
                        {im.url.trim() ? (
                          <p
                            className={`text-xs ${
                              isTrendyolPublicImageUrl(
                                toAbsolutePublicUrl(im.url, publicAppUrl)
                              )
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}
                          >
                            {isTrendyolPublicImageUrl(
                              toAbsolutePublicUrl(im.url, publicAppUrl)
                            )
                              ? "Trendyol için uygun HTTPS görsel"
                              : "Trendyol yayımlama için uygun değil — HTTPS CDN veya yayımlama adresi gerekli"}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400">
                            Henüz görsel seçilmedi.
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImageRow(idx)}
                        className="p-2 text-slate-400 hover:text-red-600 shrink-0"
                        aria-label="Görsel satırını kaldır"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 border-t pt-6">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">
                    Emniyet stoğu
                  </label>
                  <input
                    type="number"
                    value={productData.safetyStock}
                    onChange={(e) =>
                      setProductData({
                        ...productData,
                        safetyStock: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Raf konumu
                  </label>
                  <input
                    type="text"
                    value={productData.warehouseLocation}
                    onChange={(e) =>
                      setProductData({
                        ...productData,
                        warehouseLocation: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Raf kodu"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-800">
                  Fiyatlar (liste)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600">Maliyet</label>
                    <input
                      type="number"
                      value={productData.costPrice}
                      onChange={(e) =>
                        setProductData({
                          ...productData,
                          costPrice: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600">Sabit kargo (₺/adet)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={productData.cargoFee}
                      onChange={(e) =>
                        setProductData({
                          ...productData,
                          cargoFee: e.target.value,
                        })
                      }
                      placeholder="Boş = ayarlardan"
                      className="w-full px-3 py-1.5 border rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600">Desi (kargo)</label>
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={productData.dimensionalWeight}
                      onChange={(e) =>
                        setProductData({
                          ...productData,
                          dimensionalWeight: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600">Liste ₺</label>
                    <input
                      type="number"
                      value={productData.price}
                      onChange={(e) =>
                        setProductData({
                          ...productData,
                          price: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-orange-700">Trendyol ₺</label>
                    <input
                      type="number"
                      value={productData.priceTrendyol}
                      onChange={(e) =>
                        setProductData({
                          ...productData,
                          priceTrendyol: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 border border-orange-100 rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-blue-700">Mağaza web ₺</label>
                    <input
                      type="number"
                      value={productData.priceWebsite}
                      onChange={(e) =>
                        setProductData({
                          ...productData,
                          priceWebsite: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 border border-blue-100 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                Trendyol&apos;a yeni ürün göndermek için alttaki turuncu «Trendyol&apos;a
                Yayımla» butonunu kullanın; önce kaydeder sonra gönderir. Toplu işlem için
                ürün listesinden seçip üstteki butonu da kullanabilirsiniz.
              </p>
            </div>

            <div className="relative z-10 shrink-0 p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl space-y-3">
              {modalActionMsg ? (
                <p
                  className={`text-sm rounded-lg px-3 py-2 ${
                    modalActionMsg.kind === "error"
                      ? "bg-red-50 text-red-800 border border-red-100"
                      : modalActionMsg.kind === "success"
                        ? "bg-green-50 text-green-800 border border-green-100"
                        : "bg-blue-50 text-blue-800 border border-blue-100"
                  }`}
                >
                  {modalActionMsg.text}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-white"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={requestPublishFromModal}
                disabled={savingProduct || pushingChannel === "publish"}
                className="px-5 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-55 disabled:cursor-not-allowed"
              >
                {pushingChannel === "publish" ? "Yayımlanıyor…" : "Trendyol'a Yayımla"}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveProduct()}
                disabled={savingProduct || pushingChannel === "publish"}
                className="px-8 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-55 disabled:cursor-not-allowed"
              >
                {savingProduct && pushingChannel !== "publish"
                  ? "Kaydediliyor…"
                  : "Kaydet"}
              </button>
              </div>
            </div>
          </div>
          </div>,
          document.body
        )}

      <ConfirmModal
        open={bulkPublishConfirmOpen}
        onClose={() => !pushingChannel && setBulkPublishConfirmOpen(false)}
        onConfirm={() => void runBulkTrendyolPublish()}
        title="Trendyol'a toplu yayımla"
        message={`${selectedProductIds.size} ürün Trendyol onay bekleyenler listesine gönderilsin mi?\n\nKategori, barkod, görsel ve marka bilgileri tam olmalı.`}
        confirmLabel="Gönder"
        variant="info"
        loading={pushingChannel === "publish"}
      />

      <ConfirmModal
        open={publishConfirmOpen}
        onClose={() => !pushingChannel && setPublishConfirmOpen(false)}
        onConfirm={() => void confirmPublishFromModal()}
        title="Trendyol'a yayımla"
        message={`"${productData.name.trim() || "Ürün"}" önce kaydedilir, sonra Trendyol onay bekleyenler listesine gönderilir.`}
        confirmLabel="Gönder"
        variant="info"
        loading={pushingChannel === "publish"}
      />

      <ConfirmModal
        open={isDeleteModalOpen && !!selectedProduct}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => void confirmDelete()}
        title="Ürünü sil"
        message={
          selectedProduct
            ? `"${selectedProduct.name}" kalıcı olarak silinsin mi?`
            : ""
        }
        confirmLabel="Sil"
        variant="danger"
      />

      <ConfirmModal
        open={isBulkDeleteModalOpen}
        onClose={() => !bulkDeleting && setIsBulkDeleteModalOpen(false)}
        onConfirm={() => void confirmBulkDelete()}
        title="Seçili ürünleri sil"
        message={`${selectedProductIds.size} ürün kalıcı olarak silinecek. Emin misiniz?`}
        confirmLabel={bulkDeleting ? "Siliniyor…" : "Hepsini sil"}
        variant="danger"
        loading={bulkDeleting}
      />

      <Modal
        open={isBarcodeStockOpen}
        onClose={() => setIsBarcodeStockOpen(false)}
        title="Barkod ile stok giriş/çıkış"
        subtitle="Okut, adet seç, stok ekle veya düş"
        size="lg"
        tone="emerald"
        icon={<ScanBarcode size={18} className="text-emerald-600" />}
        scrollBody
      >
        <StockBarcodePanel
          variant="embedded"
          syncChannels
          onStockChanged={() => {
            void fetchProducts();
          }}
        />
      </Modal>

      <Modal
        open={isStockModalOpen && !!selectedProduct}
        onClose={() => setIsStockModalOpen(false)}
        title="Stok güncelle"
        subtitle={selectedProduct?.name}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsStockModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-white"
            >
              İptal
            </button>
            <button
              type="button"
              disabled={stockSaving}
              onClick={() => void confirmStockUpdate()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50"
            >
              {stockSaving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        }
      >
        {selectedProduct &&
          (selectedProduct.hasVariants && stockVariantRows.length > 0 ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  Her satır bir varyant (beden / renk). Yalnızca değiştirmek
                  istediğiniz satırın stok adedini güncelleyin.
                </p>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="py-2.5 px-3 font-medium">Beden / Renk</th>
                        <th className="py-2.5 px-3 font-medium hidden sm:table-cell">SKU</th>
                        <th className="py-2.5 px-3 font-medium hidden sm:table-cell">Barkod</th>
                        <th className="py-2.5 px-3 font-medium w-28 min-w-[7rem]">Stok</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockVariantRows.map((row, idx) => (
                        <tr
                          key={`${row.sku}-${row.barcode}-${idx}`}
                          className="border-t border-slate-100"
                        >
                          <td className="py-2.5 px-3 max-w-0 w-full">
                            <span className="font-medium text-slate-800">
                              {variantStockLabel(row)}
                            </span>
                            <div className="sm:hidden mt-1 space-y-0.5">
                              <p
                                className="text-[10px] font-mono text-slate-500 truncate"
                                title={row.sku}
                              >
                                SKU: {row.sku}
                              </p>
                              {row.barcode ? (
                                <p
                                  className="text-[10px] font-mono text-slate-500 truncate"
                                  title={row.barcode}
                                >
                                  Barkod: {row.barcode}
                                </p>
                              ) : null}
                            </div>
                            {row.sizeLabel && row.colorLabel ? null : (
                              <span className="block text-[11px] text-slate-400 mt-0.5">
                                {row.sizeLabel || row.colorLabel
                                  ? "Eksik etiket — düzenlemeden stok güncellenebilir"
                                  : "Beden/renk etiketi yok"}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-600 hidden sm:table-cell max-w-[9rem] truncate">
                            {row.sku}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-600 hidden sm:table-cell max-w-[9rem] truncate">
                            {row.barcode}
                          </td>
                          <td className="py-2.5 px-3 w-28 min-w-[7rem]">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              autoComplete="off"
                              value={row.stock}
                              onChange={(e) =>
                                setStockVariantRows((prev) => {
                                  const next = [...prev];
                                  next[idx] = {
                                    ...next[idx],
                                    stock: e.target.value.replace(/\D/g, ""),
                                  };
                                  return next;
                                })
                              }
                              className="erp-stock-input"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-slate-600">
                  Toplam stok:{" "}
                  <strong>
                    {stockVariantRows.reduce(
                      (a, v) => a + Math.max(0, Number(v.stock) || 0),
                      0
                    )}
                  </strong>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">
                  Stok adedi
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={newStockValue}
                  onChange={(e) =>
                    setNewStockValue(e.target.value.replace(/\D/g, ""))
                  }
                  className="erp-stock-input w-28"
                />
              </div>
            ))}

      </Modal>
    </div>
  );
}
