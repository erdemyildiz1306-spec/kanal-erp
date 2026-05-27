/** Trendyol iptal / iade kuralları — referans orderDetailHelpers.trendyolRefundActions */

export type RefundActionFlags = { canCancel: boolean; canReturn: boolean };

const TERMINAL = new Set(['İptal Edildi', 'İade Edildi']);
const RETURN_ELIGIBLE = new Set(['Kargolandı', 'Teslim Edildi']);

export function trendyolRefundActions(order: {
  platform?: string;
  status?: string;
  stockApplied?: boolean;
  stockReserved?: boolean;
  trendyolIadeIslendi?: boolean;
}): RefundActionFlags {
  if (order.platform !== 'trendyol') {
    return { canCancel: true, canReturn: true };
  }

  const st = String(order.status ?? '').trim();
  if (TERMINAL.has(st) || Boolean(order.trendyolIadeIslendi)) {
    return { canCancel: false, canReturn: false };
  }

  const stockOut =
    Boolean(order.stockApplied) ||
    Boolean(order.stockReserved) ||
    (st !== '' && st !== 'Beklemede');
  if (!stockOut) return { canCancel: false, canReturn: false };

  return {
    canCancel: st !== 'Teslim Edildi',
    canReturn: RETURN_ELIGIBLE.has(st),
  };
}

export function validateTrendyolRefund(input: {
  platform?: string;
  prevStatus?: string;
  newStatus?: string;
  stockApplied?: boolean;
  trendyolIadeIslendi?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const newStatus = String(input.newStatus ?? '').trim();
  if (newStatus !== 'İptal Edildi' && newStatus !== 'İade Edildi') {
    return { ok: true };
  }
  if (input.platform !== 'trendyol') return { ok: true };

  const prev = String(input.prevStatus ?? '').trim();
  if (TERMINAL.has(prev) || Boolean(input.trendyolIadeIslendi)) {
    return { ok: false, error: 'Bu sipariş zaten iptal veya iade edilmiş.' };
  }

  const flags = trendyolRefundActions({
    platform: 'trendyol',
    status: prev,
    stockApplied: input.stockApplied,
    trendyolIadeIslendi: input.trendyolIadeIslendi,
  });

  if (newStatus === 'İptal Edildi') {
    if (!flags.canCancel) {
      return {
        ok: false,
        error:
          prev === 'Teslim Edildi'
            ? 'Teslim edilmiş sipariş iptal edilemez; iade kullanın.'
            : 'Stok düşülmeden veya uygun durumda olmadığı için iptal yapılamaz.',
      };
    }
  }

  if (newStatus === 'İade Edildi') {
    if (!flags.canReturn) {
      return {
        ok: false,
        error: 'İade yalnızca kargolandı veya teslim edildi durumunda yapılabilir.',
      };
    }
  }

  return { ok: true };
}

export function orderStockStatusLabel(order: {
  platform?: string;
  status?: string;
  stockApplied?: boolean;
  stockReserved?: boolean;
  trendyolIadeIslendi?: boolean;
}): { label: string; cls: string } {
  const st = String(order.status ?? '').trim();
  if (TERMINAL.has(st) || Boolean(order.trendyolIadeIslendi)) {
    return { label: 'Geri yüklendi', cls: 'text-slate-600' };
  }
  if (order.stockReserved && !order.stockApplied) {
    return { label: 'Rezerve', cls: 'text-blue-700' };
  }
  if (st === 'Beklemede' && order.platform === 'trendyol') {
    return order.stockApplied
      ? { label: 'Düşüldü', cls: 'text-emerald-700' }
      : { label: 'Bekliyor', cls: 'text-amber-700' };
  }
  return order.stockApplied
    ? { label: 'Düşüldü', cls: 'text-emerald-700' }
    : { label: 'Düşülmedi', cls: 'text-amber-800' };
}
