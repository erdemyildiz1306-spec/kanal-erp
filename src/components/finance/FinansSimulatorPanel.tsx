"use client";

import { useCallback, useEffect, useState } from "react";
import { Calculator, TrendingUp } from "lucide-react";
import Spinner from "@/components/ui/Spinner";

type SimulateResult = {
  quantity: number;
  listPrice: number;
  grossSales: number;
  sellerDiscount: number;
  netListPrice: number;
  commission: number;
  sellerRevenue: number;
  cargoFee: number;
  cargoDesi: number;
  cargoTierLabel: string;
  cargoMethod?: "fixed" | "desi";
  serviceFee: number;
  stopaj: number;
  productCost: number;
  adCost: number;
  netProfit: number;
  netProfitPerUnit: number;
  marginPct: number;
  salesVat: number;
  netVat: number;
  breakEvenPrice: number;
};

type TargetMargin = { marginPct: number; price: number };

function fmt(n: number) {
  return `₺${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
}

export default function FinansSimulatorPanel() {
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [listPrice, setListPrice] = useState("299");
  const [costPrice, setCostPrice] = useState("120");
  const [commissionPct, setCommissionPct] = useState("20");
  const [cargoFee, setCargoFee] = useState("");
  const [desi, setDesi] = useState("1");
  const [quantity, setQuantity] = useState("1");
  const [sellerDiscountPct, setSellerDiscountPct] = useState("0");
  const [platformDiscount, setPlatformDiscount] = useState("0");
  const [adCostPerOrder, setAdCostPerOrder] = useState("0");
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [targets, setTargets] = useState<TargetMargin[]>([]);

  const runSimulate = useCallback(async () => {
    setSimulating(true);
    try {
      const res = await fetch("/api/finance/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listPrice: Number(listPrice.replace(",", ".")),
          costPrice: Number(costPrice.replace(",", ".")),
          commissionPct: Number(commissionPct.replace(",", ".")),
          desi: Number(desi.replace(",", ".")),
          cargoFee: cargoFee.trim() ? Number(cargoFee.replace(",", ".")) : undefined,
          quantity: Number(quantity.replace(",", ".")),
          sellerDiscountPct: Number(sellerDiscountPct.replace(",", ".")),
          platformDiscount: Number(platformDiscount.replace(",", ".")),
          adCostPerOrder: Number(adCostPerOrder.replace(",", ".")),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setResult(json.result);
      setTargets(json.targetMargins ?? []);
      if (json.defaults?.defaultCommissionPct != null) {
        setCommissionPct(String(json.defaults.defaultCommissionPct));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Simülasyon hatası");
    } finally {
      setSimulating(false);
      setLoading(false);
    }
  }, [
    listPrice,
    costPrice,
    commissionPct,
    desi,
    quantity,
    sellerDiscountPct,
    platformDiscount,
    adCostPerOrder,
    cargoFee,
  ]);

  useEffect(() => {
    void runSimulate();
  }, []);

  return (
    <div className="space-y-4">
      <div className="erp-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calculator size={20} className="text-[var(--erp-accent)]" />
          <h3 className="font-bold text-[var(--erp-text)]">Fiyat &amp; Kampanya Simülatörü</h3>
        </div>
        <p className="text-sm erp-muted mb-4">
          Satış öncesi net kâr — komisyon, desi kargo, stopaj, KDV ve kampanya indirimi dahil.
          Gerçek hakediş gelince otomatik güncellenir.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Liste fiyatı (₺)", value: listPrice, set: setListPrice },
            { label: "Maliyet (₺)", value: costPrice, set: setCostPrice },
            { label: "Komisyon %", value: commissionPct, set: setCommissionPct },
            { label: "Desi", value: desi, set: setDesi },
            { label: "Sabit kargo ₺/adet", value: cargoFee, set: setCargoFee },
            { label: "Adet", value: quantity, set: setQuantity },
            { label: "Satıcı indirimi %", value: sellerDiscountPct, set: setSellerDiscountPct },
            { label: "Kupon/indirim (₺/adet)", value: platformDiscount, set: setPlatformDiscount },
            { label: "Reklam (₺/sipariş)", value: adCostPerOrder, set: setAdCostPerOrder },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="text-xs erp-muted block mb-1">{label}</label>
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => set(e.target.value)}
                className="erp-input w-full text-sm py-2"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={simulating}
          onClick={() => void runSimulate()}
          className="erp-btn erp-btn-primary text-sm py-2"
        >
          {simulating ? "Hesaplanıyor…" : "Simüle Et"}
        </button>
      </div>

      {loading && !result ? (
        <Spinner label="Varsayılanlar yükleniyor…" />
      ) : result ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="erp-card p-4 border-l-4 border-emerald-500">
              <p className="text-xs erp-muted">Net kâr</p>
              <p
                className={`text-xl font-bold ${
                  result.netProfit >= 0 ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {fmt(result.netProfit)}
              </p>
              <p className="text-xs erp-muted">%{result.marginPct.toFixed(1)} marj</p>
            </div>
            <div className="erp-card p-4">
              <p className="text-xs erp-muted">Hakediş</p>
              <p className="text-lg font-bold">{fmt(result.sellerRevenue)}</p>
            </div>
            <div className="erp-card p-4">
              <p className="text-xs erp-muted">Kargo ({result.cargoDesi} desi)</p>
              <p className="text-lg font-bold">{fmt(result.cargoFee)}</p>
              <p className="text-xs erp-muted">
                {result.cargoTierLabel}
                {result.cargoMethod === "desi" && result.cargoDesi > 0
                  ? ` · ${result.cargoDesi} desi`
                  : ""}
              </p>
            </div>
            <div className="erp-card p-4">
              <p className="text-xs erp-muted">Başabaş fiyat</p>
              <p className="text-lg font-bold">{fmt(result.breakEvenPrice)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="erp-card p-5">
              <h4 className="font-bold mb-3">Maliyet kırılımı</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span>Brüt satış</span>
                  <span>{fmt(result.grossSales)}</span>
                </li>
                <li className="flex justify-between erp-muted">
                  <span>− Satıcı indirimi</span>
                  <span>{fmt(result.sellerDiscount)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Net liste</span>
                  <span>{fmt(result.netListPrice)}</span>
                </li>
                <li className="flex justify-between erp-muted">
                  <span>− Komisyon</span>
                  <span>{fmt(result.commission)}</span>
                </li>
                <li className="flex justify-between erp-muted">
                  <span>− Ürün maliyeti</span>
                  <span>{fmt(result.productCost)}</span>
                </li>
                <li className="flex justify-between erp-muted">
                  <span>− Kargo</span>
                  <span>{fmt(result.cargoFee)}</span>
                </li>
                <li className="flex justify-between erp-muted">
                  <span>− Hizmet / stopaj / reklam</span>
                  <span>
                    {fmt(result.serviceFee + result.stopaj + result.adCost)}
                  </span>
                </li>
                <li className="flex justify-between font-bold border-t pt-2">
                  <span>Net KDV</span>
                  <span>{fmt(result.netVat)}</span>
                </li>
              </ul>
            </div>

            <div className="erp-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={18} />
                <h4 className="font-bold">Hedef marj fiyatları</h4>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left erp-muted border-b">
                    <th className="py-2">Hedef marj</th>
                    <th className="py-2 text-right">Liste fiyatı</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t) => (
                    <tr key={t.marginPct} className="border-b border-slate-50">
                      <td className="py-2">%{t.marginPct}</td>
                      <td className="py-2 text-right font-medium">{fmt(t.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
