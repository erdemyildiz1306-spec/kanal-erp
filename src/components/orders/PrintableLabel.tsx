"use client";

import { AlertTriangle } from "lucide-react";

interface PrintableLabelProps {
  order: any;
  settings: any;
}

export default function PrintableLabel({ order, settings }: PrintableLabelProps) {
  if (!order) return null;

  // Real-looking CSS Barcode lines generator
  const renderBarcodeLines = () => {
    const lines = [];
    // Alternating patterns of black and white lines with varying widths
    const widths = [1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 2, 1, 3, 2, 1, 4, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 2, 1, 3, 2, 1, 4];
    for (let i = 0; i < widths.length; i++) {
      const isBlack = i % 2 === 0;
      lines.push(
        <div
          key={i}
          className={`h-full ${isBlack ? 'bg-black' : 'bg-transparent'}`}
          style={{ width: `${widths[i]}px` }}
        />
      );
    }
    return lines;
  };

  return (
    <div className="w-[210mm] min-h-[297mm] p-[10mm] bg-white text-black font-sans box-border print:p-0">
      <div className="max-w-[190mm] mx-auto space-y-6">
        
        {/* Başlık (Print ekranında görünür, tasarımda temiz durur) */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Paket Çıktısı (PDF)</h1>
        </div>

        {/* Uyarı Banner'ı */}
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex items-start space-x-4">
          <div className="p-2 bg-orange-100 text-orange-600 rounded-lg flex-shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="text-sm text-slate-700 leading-relaxed">
            <p className="font-semibold text-slate-800 mb-0.5">Önemli Bilgilendirme</p>
            <p>Bu etiket, trendyol.com üzerinden oluşturulan gönderi için kargo firması tarafından kullanılacaktır. Lütfen paketin üzerine yapıştırın ve barcode'un görünür olduğundan emin olun.</p>
          </div>
        </div>

        {/* Logolar */}
        <div className="flex justify-between items-center py-2">
          <div>
            {order.platform === 'trendyol' ? (
              <div className="flex items-center space-x-1">
                <span className="text-4xl font-extrabold tracking-tighter text-black">trendyol</span>
                <span className="text-2xl font-bold bg-[#ff6000] text-white px-1.5 py-0.5 rounded text-sm uppercase align-super">.com</span>
              </div>
            ) : (
              <img src="/site logo.png" alt="Web Sitesi" className="h-10 object-contain" />
            )}
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">
              {order.cargoCompany || 'DHL eCommerce'}
            </h2>
            <p className="text-sm text-slate-500 font-medium">{settings?.storeName || "Stok ERP"}</p>
          </div>
        </div>

        {/* İki Bölmeli Kart Yapısı (Alıcı Bilgileri & Kargo Barkodu) */}
        <div className="grid grid-cols-2 gap-6">
          
          {/* Sol Kart: Alıcı Bilgileri */}
          <div className="border border-slate-200 rounded-2xl p-5 bg-white space-y-4">
            <h3 className="text-base font-bold text-slate-950 tracking-wide uppercase border-b border-slate-100 pb-2">
              Alıcı Bilgileri
            </h3>
            
            <div className="space-y-3 text-sm">
              <div className="flex">
                <span className="w-24 text-slate-500 font-medium">Sipariş No</span>
                <span className="text-slate-900 font-semibold">: {order.orderNumber}</span>
              </div>
              <div className="flex">
                <span className="w-24 text-slate-500 font-medium">Ad-Soyad</span>
                <span className="text-slate-900 font-bold">: {order.customerName}</span>
              </div>
              <div className="flex items-start">
                <span className="w-24 text-slate-500 font-medium flex-shrink-0">Adres</span>
                <span className="text-slate-700 leading-relaxed">: {order.customerAddress || 'Atatürk Mah. 1234. Sok. No: 56 Daire: 7 Kat: 3 (Pınar Apt.) 34722 Kadıköy / İstanbul'}</span>
              </div>
              <div className="flex">
                <span className="w-24 text-slate-500 font-medium">Takip No</span>
                <span className="text-slate-900 font-semibold">: {order.trackingNumber || '7280032734032128'}</span>
              </div>
              <div className="flex">
                <span className="w-24 text-slate-500 font-medium">Paket ID</span>
                <span className="text-slate-900 font-semibold">: {order.packageId || 'PKT-20250519-8421'}</span>
              </div>
            </div>
          </div>

          {/* Sağ Kart: Kargo Barkodu */}
          <div className="border border-slate-200 rounded-2xl p-5 bg-white flex flex-col items-center justify-between">
            <h3 className="text-base font-bold text-slate-950 tracking-wide uppercase border-b border-slate-100 pb-2 w-full text-center">
              Kargo Barkodu
            </h3>
            
            {/* Barkod Alanı */}
            <div className="w-full flex-grow flex flex-col items-center justify-center py-4">
              <div className="h-16 flex items-center justify-center space-x-[1px] w-full overflow-hidden">
                {renderBarcodeLines()}
              </div>
              <span className="text-2xl font-bold tracking-[0.2em] text-slate-950 mt-3">
                {order.trackingNumber || '7280032734032128'}
              </span>
            </div>

            <div className="w-full text-center border-t border-slate-100 pt-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                LÜTFEN BARKODU KATLAMAYINIZ
              </span>
            </div>
          </div>

        </div>

        {/* Ürün Özeti Bölümü */}
        {settings?.printPackageContents !== false && (
          <div className="space-y-3 pt-4">
            <h3 className="text-base font-bold text-slate-950 tracking-wide uppercase">
              Paket içi — ürün özeti
            </h3>
            
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4 border-r border-slate-800">Barkod</th>
                    <th className="py-3 px-4 border-r border-slate-800">Stok kodu</th>
                    <th className="py-3 px-4 border-r border-slate-800">Ürün adı</th>
                    <th className="py-3 px-4 text-center border-r border-slate-800">Adet</th>
                    <th className="py-3 px-4 text-right border-r border-slate-800">Birim fiyat</th>
                    <th className="py-3 px-4 text-right">Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items?.map((item: any, index: number) => (
                    <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 border-r border-slate-100">{item.barcode || '8681234567890'}</td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 border-r border-slate-100">{item.sku || 'TY-98765'}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-800 border-r border-slate-100">{item.productName || 'Örnek Ürün'}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-900 border-r border-slate-100">{item.quantity}</td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-700 border-r border-slate-100">{(item.totalPrice / item.quantity || 249.90).toFixed(2)} TL</td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">{(item.totalPrice || 249.90).toFixed(2)} TL</td>
                    </tr>
                  ))}
                  {!order.items && (
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 border-r border-slate-100">8681234567890</td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 border-r border-slate-100">TY-98765</td>
                      <td className="py-3.5 px-4 font-medium text-slate-800 border-r border-slate-100">Kadın Oversize Basic T-Shirt Beyaz - L</td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-900 border-r border-slate-100">1</td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-700 border-r border-slate-100">249,90 TL</td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">249,90 TL</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pr-2">
              <div className="text-right">
                <span className="text-sm font-medium text-slate-500 mr-2">Genel toplam:</span>
                <span className="text-xl font-extrabold text-slate-950">{order.totalAmount?.toFixed(2) || '249.90'} TL</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
