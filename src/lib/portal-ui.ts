/** Müşteri portalı — ERP ile uyumlu durum rozetleri */
export const portalStatusClass: Record<string, string> = {
  Beklemede: "bg-amber-100 text-amber-800 border-amber-200",
  Yeni: "bg-sky-100 text-sky-800 border-sky-200",
  Hazırlanıyor: "bg-violet-100 text-violet-800 border-violet-200",
  Kargoda: "bg-blue-100 text-blue-800 border-blue-200",
  Kargolandı: "bg-blue-100 text-blue-800 border-blue-200",
  Teslim: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Teslim Edildi": "bg-emerald-100 text-emerald-800 border-emerald-200",
  İptal: "bg-red-100 text-red-800 border-red-200",
  "İptal Edildi": "bg-red-100 text-red-800 border-red-200",
};

export function portalStatusBadge(status: string): string {
  return (
    portalStatusClass[status] ??
    "bg-[var(--erp-surface-2)] text-[var(--erp-text-muted)] border-[var(--erp-border)]"
  );
}

export function fmtMoney(n: number): string {
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
