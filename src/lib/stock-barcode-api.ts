import { normalizeBarcode, barcodeLookupKeys } from "@/lib/barcode-normalize";

export type ScannedStockProduct = {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  stock: number;
  price: number;
};

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
  const params = new URLSearchParams();
  for (const key of keys) {
    params.append("barcode", key);
  }
  params.set("sku", code);
  const res = await fetch(`/api/inventory/adjust?${params.toString()}`);
  const data = await res.json();

  if (!data.success) {
    return { success: false, error: data.error || "Ürün bulunamadı.", code };
  }

  return { success: true, product: data.product as ScannedStockProduct, code };
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
