/** Trendyol webhook / API alan adı uyumluluğu (TY Nisan 2026 yeniden adlandırma). */

export function tyScalarToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    if (Math.abs(v) >= 1e15) return v.toFixed(0);
    return String(Math.trunc(v));
  }
  const s = String(v).trim();
  if (/^\d+\.?\d*e\+\d+$/i.test(s)) {
    try {
      return BigInt(s.split('.')[0] ?? s).toString();
    } catch {
      return s;
    }
  }
  return s;
}

export function coalesceTrendyolPackageFields(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const p: Record<string, unknown> = { ...raw };

  const pkgId = tyScalarToString(p.shipmentPackageId ?? p.id);
  if (pkgId) {
    p.id = pkgId;
    p.shipmentPackageId = pkgId;
  }

  if (p.totalPrice == null && p.packageTotalPrice != null) {
    p.totalPrice = p.packageTotalPrice;
  }
  if (p.grossAmount == null && p.packageGrossAmount != null) {
    p.grossAmount = p.packageGrossAmount;
  }

  const status =
    p.status ??
    p.shipmentPackageStatus ??
    p.packageStatus ??
    (p as { shipmentPackageStatusName?: unknown }).shipmentPackageStatusName;
  if (status != null) p.status = status;

  if (Array.isArray(p.lines)) {
    p.lines = (p.lines as Record<string, unknown>[]).map((line) => {
      const ln = { ...line };
      if (ln.lineId == null && ln.id != null) ln.lineId = ln.id;
      if (ln.stockCode == null && ln.merchantSku != null) ln.stockCode = ln.merchantSku;
      if (ln.merchantSku == null && ln.stockCode != null) ln.merchantSku = ln.stockCode;
      if (ln.lineUnitPrice == null && ln.price != null) ln.lineUnitPrice = ln.price;
      if (ln.price == null && ln.lineUnitPrice != null) ln.price = ln.lineUnitPrice;
      if (ln.lineGrossAmount == null && ln.amount != null) ln.lineGrossAmount = ln.amount;
      if (ln.amount == null && ln.lineGrossAmount != null) ln.amount = ln.lineGrossAmount;
      if (ln.barcode != null) ln.barcode = tyScalarToString(ln.barcode);
      if (ln.lineId != null) ln.lineId = tyScalarToString(ln.lineId);
      return ln;
    });
  }

  const cargoTracking = resolveTrendyolCargoTrackingFromPackage(p);
  if (cargoTracking) {
    p.cargoTrackingNumber = cargoTracking;
  } else if (p.cargoTrackingNumber != null) {
    p.cargoTrackingNumber = tyScalarToString(p.cargoTrackingNumber);
  }
  if (p.orderNumber != null) p.orderNumber = tyScalarToString(p.orderNumber);

  return p;
}

/** Ortak etiket için sayısal cargoTrackingNumber — TY alan adı varyantları. */
export function resolveTrendyolCargoTrackingFromPackage(
  pkg: Record<string, unknown>
): string {
  for (const key of [
    'cargoTrackingNumber',
    'cargoTracking',
    'trackingNumber',
    'shipmentNumber',
  ]) {
    const s = tyScalarToString(pkg[key]);
    if (!s || isCorruptedNumericIdString(s)) continue;
    const digits = s.replace(/\s+/g, '');
    if (/^\d+$/.test(digits)) return digits;
  }
  return '';
}

/** Trendyol marketplace üzerinden DHL (ortak etiket API yok; DHL paneli + takip bildirimi). */
export function isTrendyolDhlCargo(cargoProviderName: string): boolean {
  const n = String(cargoProviderName ?? '').toLowerCase();
  return n.includes('dhl') || n.includes('dhlmp');
}

export function trendyolDhlProviderCode(): string {
  return 'DHLMP';
}

/** Satıcının kendi kargo anlaşması (ortak etiket API genelde geçersiz). DHL Trendyol hariç. */
export function isSellerOwnCargoContract(
  cargoProviderName: string,
  trackingNumber?: string
): boolean {
  if (isTrendyolDhlCargo(cargoProviderName)) return false;
  const n = String(cargoProviderName ?? '').toLowerCase();
  const track = String(trackingNumber ?? '').trim();
  if (track && /[a-z]/i.test(track)) return true;
  return (
    n.includes('mng') ||
    n.includes('ups') ||
    n.includes('fedex') ||
    (n.includes('ptt') && n.includes('satıcı'))
  );
}

export function parseTrendyolWebhookPackages(raw: unknown): Record<string, unknown>[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      return parseTrendyolWebhookPackages(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) {
    return raw.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  }
  if (typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.content)) {
    return o.content.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  }
  if (
    o.shipmentPackageId != null ||
    o.orderNumber != null ||
    o.id != null ||
    (Array.isArray(o.lines) && o.lines.length > 0)
  ) {
    return [o];
  }
  return [];
}

export function trendyolPackageSellerIdFromPayload(
  pkg: Record<string, unknown>
): string {
  const sid = tyScalarToString(pkg.supplierId ?? pkg.sellerId);
  if (sid) return sid;
  const lines = Array.isArray(pkg.lines) ? (pkg.lines as Record<string, unknown>[]) : [];
  const first = lines[0];
  if (first) {
    const lineSid = tyScalarToString(first.sellerId ?? first.supplierId);
    if (lineSid) return lineSid;
  }
  return '';
}

export function resolveTrendyolPackageStatusFromPayload(
  pkg: Record<string, unknown>
): string {
  const candidates = [
    pkg.status,
    pkg.shipmentPackageStatus,
    pkg.packageStatus,
    (pkg as { shipmentPackageStatusName?: unknown }).shipmentPackageStatusName,
  ];
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (s) return s;
  }
  return '';
}

export function isCorruptedNumericIdString(s: string): boolean {
  return /e\+/i.test(s) || /e-/i.test(s);
}

export function extractTrendyolPackageMeta(
  pkg: Record<string, unknown>
): Record<string, unknown> {
  const addr = (pkg.shipmentAddress ?? {}) as Record<string, unknown>;
  const invoiceAddr = (pkg.invoiceAddress ?? {}) as Record<string, unknown>;
  const cargoTrackingNumber = resolveTrendyolCargoTrackingFromPackage(pkg);
  return {
    cargoTrackingNumber,
    cargoTracking: cargoTrackingNumber,
    shipmentPackageId: tyScalarToString(pkg.shipmentPackageId ?? pkg.id),
    orderNumber: tyScalarToString(pkg.orderNumber),
    cargoProviderName: String(pkg.cargoProviderName ?? ''),
    customerFirstName: String(addr.firstName ?? pkg.customerFirstName ?? ''),
    customerLastName: String(addr.lastName ?? pkg.customerLastName ?? ''),
    customerId: pkg.customerId ?? pkg.customerID ?? null,
    commercial: Boolean(pkg.commercial),
    microRegion: String(pkg.microRegion ?? '').trim() || undefined,
    shipmentAddress: addr,
    invoiceAddress: invoiceAddr,
    customerEmail: String(addr.email ?? invoiceAddr.email ?? '').trim() || undefined,
    packageLastModifiedDate: pkg.packageLastModifiedDate ?? pkg.lastModifiedDate,
    orderDate: pkg.orderDate,
  };
}

export function resolveCommonLabelQueryId(
  cargoTracking: unknown,
  meta?: Record<string, unknown> | null
): { ok: true; id: string } | { ok: false; error: string } {
  const tryId = (raw: unknown): string | null => {
    let s = tyScalarToString(raw);
    if (!s || isCorruptedNumericIdString(s)) return null;
    s = s.replace(/\s+/g, '');
    if (/^\d+$/.test(s)) return s;
    return null;
  };

  for (const c of [meta?.cargoTrackingNumber, meta?.cargoTracking, cargoTracking]) {
    const id = tryId(c);
    if (id) return { ok: true, id };
  }

  const track = tyScalarToString(cargoTracking);
  if (track && !/^\d+$/.test(track) && !isCorruptedNumericIdString(track)) {
    return {
      ok: false,
      error:
        'Trendyol ortak etiket sayısal cargoTrackingNumber bekliyor. Önce sipariş senkronu yapın veya yerel paket çıktısı kullanın.',
    };
  }
  if (track && isCorruptedNumericIdString(track)) {
    return {
      ok: false,
      error:
        'Kargo takip alanı bozuk (bilimsel gösterim). Siparişi yeniden senkronize edin.',
    };
  }
  return {
    ok: false,
    error:
      'Ortak etiket için Trendyol cargoTrackingNumber gerekir. Sipariş senkronu sonrası tekrar deneyin.',
  };
}
