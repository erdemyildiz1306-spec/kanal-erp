/**
 * Trendyol cari ekstre satır sınıflandırması.
 * API yanıtındaki transactionType çoğu zaman İngilizce sorgu adı değil Türkçe etikettir
 * (ör. DeductionInvoices sorgusu → "Kargo Faturası", "Platform Hizmet Bedeli").
 */

export function financeText(type: string, description: string): string {
  return `${String(type ?? '')} ${String(description ?? '')}`.toLocaleLowerCase('tr-TR');
}

export function isCargoFinanceRow(type: string, description: string): boolean {
  const t = financeText(type, description);
  return (
    /kargo\s*fatur|kargo fatura|kargo faturası|gönderi kargo|kargo bedel|iade kargo|shipping invoice|cargo invoice/.test(
      t
    )
  );
}

export function isAdSpendFinanceRow(type: string, description: string): boolean {
  const t = financeText(type, description);
  return /reklam|sponsor|mağaza reklam|ürün reklam|advert|\bads\b|kampanya reklam|performance/.test(
    t
  );
}

export function isServiceFeeFinanceRow(type: string, description: string): boolean {
  const t = financeText(type, description);
  return (
    /platform.*hizmet|platform hizmet|hizmet bedel|international service|ty hizmet|platformservicefee/.test(
      t
    )
  );
}

export function isStopajFinanceRow(type: string): boolean {
  const t = String(type ?? '').toLocaleLowerCase('tr-TR');
  return type === 'Stoppage' || t === 'e-ticaret stopajı' || t.includes('stopaj');
}

/** Ödeme / virman — gider değil */
export function isNonExpenseOtherFinancial(type: string): boolean {
  const t = String(type ?? '').toLocaleLowerCase('tr-TR');
  return (
    type === 'PaymentOrder' ||
    t === 'ödeme' ||
    type === 'WireTransfer' ||
    t === 'virman' ||
    type === 'IncomingTransfer' ||
    t === 'gelen havale' ||
    type === 'CashAdvance' ||
    t === 'nakit avans' ||
    type === 'ReturnInvoice' ||
    t.startsWith('returninvoice')
  );
}

export function deductionAmount(row: {
  cargoInvoiceTotal?: number | null;
  debt?: number;
  credit?: number;
}): number {
  const cargo = Number(row.cargoInvoiceTotal);
  if (Number.isFinite(cargo) && cargo > 0) return cargo;
  return Math.max(0, Number(row.debt) || 0);
}
