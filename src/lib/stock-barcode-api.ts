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

  const keys = barcodeLookupKeys(code);

  const barcodeParams = new URLSearchParams();
  for (const key of keys) {
    barcodeParams.append("barcode", key);
  }
  let data = await fetchLookup(barcodeParams);
  if (data.success) {
    return { success: true, product: data.product as ScannedStockProduct, code };
  }

  const skuParams = new URLSearchParams();
  skuParams.set("sku", code);
  data = await fetchLookup(skuParams);
  if (data.success) {
    return { success: true, product: data.product as ScannedStockProduct, code };
  }

  const looseParams = new URLSearchParams();
  looseParams.set("q", code);
  for (const key of keys) looseParams.append("barcode", key);
  data = await fetchLookup(looseParams);
  if (data.success) {
    return { success: true, product: data.product as ScannedStockProduct, code };
  }

  return {
    success: false,
    error: data.error || "Ürün bulunamadı. Barkodun ürün kartında kayıtlı olduğundan emin olun.",
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
