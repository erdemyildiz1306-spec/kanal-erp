"use client";

import { useEffect, useRef } from "react";

interface PrintableLabelProps {
  order: {
    orderNumber?: string;
    platform?: string;
    customerName?: string;
    customerAddress?: string;
    trackingNumber?: string;
    packageId?: string;
    cargoCompany?: string;
    totalAmount?: number;
    items?: Array<{
      barcode?: string;
      sku?: string;
      productName?: string;
      quantity?: number;
      unitPrice?: number;
      totalPrice?: number;
    }>;
    trendyolMeta?: { cargoTrackingNumber?: string };
  };
  settings: {
    storeName?: string;
    printPackageContents?: boolean;
  };
}

function dash(value: string | number | undefined | null): string {
  const s = String(value ?? "").trim();
  return s || "—";
}

function formatMoney(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)} TL`;
}

function ShippingBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const code = String(value ?? "").trim();
    if (!svgRef.current || !code) return;

    void import("jsbarcode").then((mod) => {
      const JsBarcode = mod.default;
      try {
        JsBarcode(svgRef.current!, code, {
          format: /^\d{13}$/.test(code)
            ? "EAN13"
            : /^\d{12}$/.test(code)
              ? "UPC"
              : "CODE128",
          width: 2,
          height: 72,
          displayValue: false,
          margin: 4,
        });
      } catch {
        try {
          JsBarcode(svgRef.current!, code, {
            format: "CODE128",
            width: 2,
            height: 72,
            displayValue: false,
            margin: 4,
          });
        } catch {
          /* boş bırak */
        }
      }
    });
  }, [value]);

  return (
    <div className="w-full flex flex-col items-center">
      <svg ref={svgRef} className="max-w-full h-auto" />
      <span className="text-xl font-bold tracking-[0.15em] text-slate-950 mt-2 font-mono">
        {value}
      </span>
    </div>
  );
}

export default function PrintableLabel({ order, settings }: PrintableLabelProps) {
  if (!order) return null;

  const tracking =
    String(order.trackingNumber ?? order.trendyolMeta?.cargoTrackingNumber ?? "").trim() ||
    "";
  const packageId = String(order.packageId ?? "").trim();
  const cargo = String(order.cargoCompany ?? "").trim() || "Kargo";
  const storeName = String(settings?.storeName ?? "").trim() || "Stok ERP";
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="w-[210mm] min-h-[297mm] p-[10mm] bg-white text-black font-sans box-border print:p-[8mm]">
      <div className="max-w-[190mm] mx-auto space-y-5">
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3">
          <div>
            {order.platform === "trendyol" ? (
              <div className="flex items-center space-x-1">
                <span className="text-3xl font-extrabold tracking-tighter text-black">trendyol</span>
                <span className="text-lg font-bold bg-[#ff6000] text-white px-1 py-0.5 rounded text-xs uppercase">
                  .com
                </span>
              </div>
            ) : (
              <img src="/site logo.png" alt="Mağaza" className="h-10 object-contain" />
            )}
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 uppercase">{cargo}</h2>
            <p className="text-sm text-slate-600 font-medium">{storeName}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
          <div className="border-2 border-slate-900 rounded-lg p-4 space-y-2 text-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide border-b border-slate-300 pb-2 mb-2">
              Alıcı bilgileri
            </h3>
            <p>
              <span className="text-slate-500">Sipariş no:</span>{" "}
              <strong>{dash(order.orderNumber)}</strong>
            </p>
            <p>
              <span className="text-slate-500">Ad-soyad:</span>{" "}
              <strong>{dash(order.customerName)}</strong>
            </p>
            <p className="leading-relaxed">
              <span className="text-slate-500">Adres:</span> {dash(order.customerAddress)}
            </p>
            <p>
              <span className="text-slate-500">Takip no:</span>{" "}
              <strong>{dash(tracking)}</strong>
            </p>
            {packageId ? (
              <p>
                <span className="text-slate-500">Paket ID:</span> <strong>{packageId}</strong>
              </p>
            ) : null}
          </div>

          <div className="border-2 border-slate-900 rounded-lg p-4 flex flex-col">
            <h3 className="text-sm font-bold uppercase tracking-wide border-b border-slate-300 pb-2 mb-3 text-center">
              Kargo barkodu
            </h3>
            {tracking ? (
              <ShippingBarcode value={tracking} />
            ) : (
              <p className="text-center text-slate-500 py-8 text-sm">
                Takip numarası henüz yok — Trendyol senkronundan sonra tekrar deneyin.
              </p>
            )}
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center mt-3 pt-2 border-t border-slate-200">
              Lütfen barkodu katlamayınız
            </p>
          </div>
        </div>

        {settings?.printPackageContents !== false && items.length > 0 ? (
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-bold uppercase tracking-wide">Paket içi — ürün özeti</h3>
            <table className="w-full text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="py-2 px-2 border border-slate-700 text-left">Barkod</th>
                  <th className="py-2 px-2 border border-slate-700 text-left">Stok kodu</th>
                  <th className="py-2 px-2 border border-slate-700 text-left">Ürün adı</th>
                  <th className="py-2 px-2 border border-slate-700 text-center">Adet</th>
                  <th className="py-2 px-2 border border-slate-700 text-right">Birim</th>
                  <th className="py-2 px-2 border border-slate-700 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const qty = Number(item.quantity) || 1;
                  const total = Number(item.totalPrice);
                  const unit =
                    item.unitPrice !== undefined
                      ? Number(item.unitPrice)
                      : Number.isFinite(total)
                        ? total / qty
                        : undefined;
                  return (
                    <tr key={index} className="border-b border-slate-200">
                      <td className="py-2 px-2 font-mono border border-slate-200">
                        {dash(item.barcode)}
                      </td>
                      <td className="py-2 px-2 font-mono border border-slate-200">
                        {dash(item.sku)}
                      </td>
                      <td className="py-2 px-2 border border-slate-200">{dash(item.productName)}</td>
                      <td className="py-2 px-2 text-center font-bold border border-slate-200">
                        {qty}
                      </td>
                      <td className="py-2 px-2 text-right border border-slate-200">
                        {formatMoney(unit)}
                      </td>
                      <td className="py-2 px-2 text-right font-bold border border-slate-200">
                        {formatMoney(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex justify-end pt-1">
              <p className="text-base font-extrabold">
                Genel toplam: {formatMoney(order.totalAmount)}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
