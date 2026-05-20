/** Müşteri portalı — ERP ile uyumlu durum rozetleri */
export const portalStatusClass: Record<string, string> = {
  Beklemede: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/45 dark:text-amber-200 dark:border-amber-800/50",
  Yeni: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/45 dark:text-sky-200 dark:border-sky-800/50",
  Hazırlanıyor: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/45 dark:text-violet-200 dark:border-violet-800/50",
  Kargoda: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/45 dark:text-blue-200 dark:border-blue-800/50",
  Kargolandı: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/45 dark:text-blue-200 dark:border-blue-800/50",
  Teslim: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-200 dark:border-emerald-800/50",
  "Teslim Edildi": "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-200 dark:border-emerald-800/50",
  İptal: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/45 dark:text-red-200 dark:border-red-800/50",
  "İptal Edildi": "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/45 dark:text-red-200 dark:border-red-800/50",
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
