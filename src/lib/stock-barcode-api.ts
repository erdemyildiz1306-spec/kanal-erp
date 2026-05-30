import { normalizeBarcode, barcodeLookupKeys } from "@/lib/barcode-normalize";

export type ScannedStockProduct = {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  stock: number;
  price: number;
};

async function fetchLookup(params: URLSearchParams) {
  const res = await fetch(`/api/inventory/adjust?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  return res.json();
}

export async function lookupStockProduct(
  rawCode: string
): Promise<
  | { success: true; product: ScannedStockProduct; code: string }
  | { success: false; error: string; code: string }
> {
  const code = normalizeBarcode(rawCode);
  if (!code) {
    return { success: false, error: "Geçersiz barkod.", code: "" };
  }

  const params = new URLSearchParams();
  params.set("q", code);
  for (const key of barcodeLookupKeys(code)) {
    params.append("barcode", key);
  }

  const data = await fetchLookup(params);
  if (data.success) {
    return { success: true, product: data.product as ScannedStockProduct, code };
  }

  const skuParams = new URLSearchParams();
  skuParams.set("q", code);
  skuParams.set("sku", code);
  const skuData = await fetchLookup(skuParams);
  if (skuData.success) {
    return { success: true, product: skuData.product as ScannedStockProduct, code };
  }

  return {
    success: false,
    error:
      data.error ||
      "Ürün bulunamadı. Ürün kartında barkod alanının dolu olduğundan emin olun.",
    code,
  };
}

export async function applyStockDelta(input: {
  barcode?: string;
  sku?: string;
  delta: number;
  warehouseId?: string;
  syncChannels?: boolean;
  reason?: string;
  note?: string;
}): Promise<
  | { success: true; product: ScannedStockProduct }
  | { success: false; error: string }
> {
  const res = await fetch("/api/inventory/adjust", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      barcode: input.barcode,
      sku: input.sku,
      delta: input.delta,
      warehouseId: input.warehouseId,
      syncChannels: input.syncChannels ?? true,
      reason: input.reason ?? "adjustment",
      note: input.note,
    }),
  });
  const data = await res.json();
  if (!data.success) {
    return { success: false, error: data.error || "Stok güncellenemedi." };
  }
  return { success: true, product: data.product as ScannedStockProduct };
}
