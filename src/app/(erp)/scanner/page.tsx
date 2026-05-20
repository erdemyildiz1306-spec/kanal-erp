"use client";

import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Camera, Package, CheckCircle } from "lucide-react";

type ProductRow = {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  stock: number;
  price: number;
};

export default function ScannerPage() {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [productDetails, setProductDetails] = useState<ProductRow | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!scanning) return;
    const scanner = new Html5QrcodeScanner("reader", { qrbox: { width: 250, height: 150 }, fps: 5 }, false);
    scanner.render(
      (text) => {
        setScanResult(text);
        scanner.clear().catch(() => {});
        setScanning(false);
        void fetchProduct(text);
      },
      () => {}
    );
    return () => {
      scanner.clear().catch(() => {});
    };
  }, [scanning]);

  const fetchProduct = async (barcode: string) => {
    setError("");
    try {
      const res = await fetch(`/api/inventory/adjust?barcode=${encodeURIComponent(barcode)}`);
      const data = await res.json();
      if (!data.success) {
        setProductDetails(null);
        setError(data.error || "Ürün bulunamadı.");
        return;
      }
      setProductDetails(data.product);
    } catch {
      setError("Bağlantı hatası.");
    }
  };

  const updateStock = async (delta: number) => {
    if (!productDetails) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: productDetails.barcode || scanResult,
          sku: productDetails.sku,
          delta,
          syncChannels: true,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Stok güncellenemedi.");
        return;
      }
      setProductDetails(data.product);
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-800">Mobil Barkod Okuyucu</h2>
        <p className="text-sm text-slate-500 mt-1">Kameranızla ürün arayın ve stok güncelleyin.</p>
      </div>

      {!scanning && !scanResult && (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center space-y-4">
          <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
            <Camera size={40} />
          </div>
          <button onClick={() => setScanning(true)} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">
            Kamerayı Aç
          </button>
        </div>
      )}

      <div id="reader" className={scanning ? "block w-full rounded-2xl overflow-hidden border border-slate-200" : "hidden"} />

      {error ? <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p> : null}

      {scanResult && productDetails && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-xl"><CheckCircle size={24} /></div>
            <div>
              <h3 className="font-bold text-slate-800">Barkod Okundu</h3>
              <p className="text-sm text-slate-500 font-mono">{scanResult}</p>
            </div>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex space-x-4">
            <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center border border-slate-200">
              <Package className="text-slate-400" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">{productDetails.name}</h4>
              <p className="text-xs text-slate-500 mt-1">SKU: {productDetails.sku}</p>
              <div className="flex items-center space-x-4 mt-2">
                <span className="text-sm font-bold text-blue-600">{productDetails.price} TL</span>
                <span className="text-sm font-medium text-slate-600">Stok: {productDetails.stock}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button disabled={busy} onClick={() => void updateStock(1)} className="py-3 bg-green-50 text-green-700 border border-green-200 rounded-xl font-bold hover:bg-green-100 disabled:opacity-60">+1 Stok</button>
            <button disabled={busy} onClick={() => void updateStock(-1)} className="py-3 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold hover:bg-red-100 disabled:opacity-60">-1 Stok</button>
          </div>
          <button onClick={() => { setScanResult(null); setProductDetails(null); setScanning(true); }} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold">Yeni Barkod</button>
        </div>
      )}
    </div>
  );
}