import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import Invoice from '@/models/Invoice';
import { resolveSettingDocument } from '@/lib/erp-settings';
import { normalizeTenantId } from '@/lib/tenant';
import { mergeTenant } from '@/lib/tenant-query';
import { getTrendyolSettings, updateTrendyolPackageStatus } from '@/lib/trendyol';
import {
  buildTrendyolInvoiceNumber,
  sendTrendyolInvoiceLink,
  uploadTrendyolInvoiceFile,
  unixInvoiceDateTime,
  isValidTrendyolInvoiceNumber,
} from '@/lib/trendyol-invoice';
import {
  type EfaturamSettings,
  getEfaturamCustomerSession,
  efaturamCreateEArchive,
  resolveEfaturamPublicLink,
} from '@/lib/trendyol-efaturam';
import { calculateInvoiceTotals } from '@/lib/invoice-math';
import { createErpInvoiceWithRetry } from '@/lib/erp-invoice-number';
import { assertHttpsInvoiceLink } from '@/lib/outbound-url';
import { StoreInvoiceError } from '@/lib/store-invoice-errors';

export type OrderDoc = {
  _id: unknown;
  tenantId?: string;
  orderNumber: string;
  platform: string;
  status: string;
  packageId?: string;
  platformOrderId?: string;
  customerName?: string;
  customerAddress?: string;
  totalAmount?: number;
  items?: Array<{
    productName?: string;
    quantity?: number;
    unitPrice?: number;
    lineId?: string;
  }>;
  trendyolMeta?: Record<string, unknown>;
  storeMeta?: Record<string, unknown>;
  trendyolInvoice?: Record<string, unknown>;
  storeInvoice?: Record<string, unknown>;
};

export async function loadEfaturamSettingsFromDb(
  tenantId?: string
): Promise<EfaturamSettings | null> {
  const doc = await resolveSettingDocument(tenantId);
  const enabled = Boolean(doc.get('efaturamEnabled'));
  if (!enabled) return null;
  const partnerUsername = String(doc.get('efaturamPartnerUsername') ?? '').trim();
  const partnerPassword = String(doc.get('efaturamPartnerPassword') ?? '').trim();
  const customerEmail = String(doc.get('efaturamCustomerEmail') ?? '').trim();
  const customerPassword = String(doc.get('efaturamCustomerPassword') ?? '').trim();
  if (!partnerUsername || !partnerPassword || !customerEmail || !customerPassword) {
    return null;
  }
  return {
    useStage: Boolean(doc.get('efaturamUseStage')),
    partnerId: Number(doc.get('efaturamPartnerId')) || 0,
    partnerUsername,
    partnerPassword,
    customerEmail,
    customerPassword,
    companyId: Number(doc.get('efaturamCompanyId')) || 0,
    userId: Number(doc.get('efaturamUserId')) || 0,
    invoicePrefix: String(doc.get('efaturamInvoicePrefix') ?? 'ERP').trim() || 'ERP',
    xsltCode: String(doc.get('efaturamXsltCode') ?? '').trim(),
    invoiceLinkTemplate: String(doc.get('efaturamInvoiceLinkTemplate') ?? '').trim(),
    defaultVatRate: Number(doc.get('efaturamDefaultVatRate')) || 20,
  };
}

function assertValidRecipientTaxId(taxId: string) {
  const normalized = String(taxId ?? '').replace(/\D/g, '');
  if (normalized.length !== 10 && normalized.length !== 11) {
    throw new StoreInvoiceError(
      'Siparişte geçerli VKN/TCKN yok. Trendyol sipariş senkronunda fatura alanlarının dolu olduğundan emin olun.',
      400
    );
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSequenceFromInvoiceNumber(value: string, prefix: string, year: number): number {
  const re = new RegExp(`^${escapeRegex(prefix)}${year}(\\d{9})$`);
  const match = re.exec(String(value ?? '').trim());
  if (!match) return 0;
  return Number(match[1]) || 0;
}

async function markTrendyolInvoiceFailed(orderId: unknown, message: string) {
  await Order.findByIdAndUpdate(orderId, {
    $set: {
      'trendyolInvoice.status': 'failed',
      'trendyolInvoice.lastError': String(message).slice(0, 500),
    },
  });
}

function parseCustomerName(full: string): { name: string; surname: string } {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: 'Müşteri', surname: '' };
  if (parts.length === 1) return { name: parts[0]!, surname: '' };
  return { name: parts[0]!, surname: parts.slice(1).join(' ') };
}

function extractRecipientFromOrder(order: OrderDoc) {
  if (order.platform === 'web') {
    const meta = (order.storeMeta ?? {}) as Record<string, string>;
    const { name, surname } = parseCustomerName(order.customerName || meta.customerName || '');
    const taxId = String(meta.taxId ?? meta.invoiceTaxNumber ?? meta.customerTaxId ?? '')
      .replace(/\D/g, '');
    const cityDistrict = String(order.customerAddress ?? meta.address ?? '').split('/');
    return {
      taxId,
      name,
      surname,
      title: String(meta.companyName ?? meta.company ?? '').trim() || undefined,
      city: String(meta.city ?? cityDistrict[1]?.trim() ?? 'İstanbul').trim() || 'İstanbul',
      district: String(meta.district ?? cityDistrict[0]?.trim() ?? '').trim() || undefined,
      address: String(meta.address ?? order.customerAddress ?? '').trim() || undefined,
      email: String(meta.email ?? meta.customerEmail ?? '').trim() || undefined,
      phone: String(meta.phone ?? meta.customerPhone ?? '').replace(/\D/g, '') || undefined,
      taxOffice: String(meta.taxOffice ?? '').trim() || undefined,
    };
  }

  const meta = order.trendyolMeta ?? {};
  const invoiceAddr = (meta.invoiceAddress ?? {}) as Record<string, string>;
  const shipAddr = (meta.shipmentAddress ?? {}) as Record<string, string>;
  const addr = Object.keys(invoiceAddr).length ? invoiceAddr : shipAddr;
  const { name, surname } = parseCustomerName(
    `${addr.firstName ?? ''} ${addr.lastName ?? ''}`.trim() || order.customerName || ''
  );
  const taxId = String(
    invoiceAddr.taxNumber ??
      invoiceAddr.invoiceTaxNumber ??
      meta.customerTaxId ??
      ''
  ).replace(/\D/g, '');
  return {
    taxId,
    name,
    surname,
    title: String(invoiceAddr.company ?? '').trim() || undefined,
    city: String(addr.city ?? 'İstanbul').trim() || 'İstanbul',
    district: String(addr.district ?? '').trim() || undefined,
    address: order.customerAddress || String(addr.address1 ?? '').trim() || undefined,
    email: String(addr.email ?? meta.customerEmail ?? '').trim() || undefined,
    phone: String(addr.phone ?? '').replace(/\D/g, '') || undefined,
    taxOffice: String(invoiceAddr.taxOffice ?? invoiceAddr.invoiceTaxOffice ?? '').trim() || undefined,
  };
}

async function nextInvoiceSequence(prefix: string): Promise<number> {
  const year = new Date().getFullYear();
  const re = new RegExp(`^${escapeRegex(prefix)}${year}`);
  const latest = await Order.findOne({
    $or: [
      { 'trendyolInvoice.invoiceNumber': { $regex: re } },
      { 'storeInvoice.invoiceNumber': { $regex: re } },
    ],
  })
    .sort({ updatedAt: -1 })
    .select('trendyolInvoice.invoiceNumber storeInvoice.invoiceNumber')
    .lean();

  let maxSeq = 0;
  if (latest) {
    maxSeq = Math.max(
      parseSequenceFromInvoiceNumber(latest.trendyolInvoice?.invoiceNumber ?? '', prefix, year),
      parseSequenceFromInvoiceNumber(latest.storeInvoice?.invoiceNumber ?? '', prefix, year)
    );
  }
  return maxSeq + 1;
}

export async function issueTrendyolInvoiceForOrder(input: {
  orderId: string;
  mode: 'efaturam' | 'link' | 'file';
  invoiceLink?: string;
  invoiceNumber?: string;
  fileBuffer?: Buffer;
  fileName?: string;
  mimeType?: string;
  markInvoiced?: boolean;
}) {
  await connectToDatabase();
  const order = (await Order.findById(input.orderId).lean()) as OrderDoc | null;
  if (!order || order.platform !== 'trendyol') {
    throw new StoreInvoiceError('Trendyol siparişi bulunamadı.', 404);
  }
  const packageId = String(order.packageId ?? '').trim();
  if (!/^\d+$/.test(packageId)) {
    throw new StoreInvoiceError(
      'Geçerli Trendyol paket numarası yok. Önce sipariş senkronu yapın.',
      400
    );
  }

  const tenantId = normalizeTenantId(order.tenantId);
  const settingsDoc = await resolveSettingDocument(tenantId);
  const companyTaxId = String(settingsDoc.get('companyTaxId') ?? '').trim();
  const vatRate = Number(settingsDoc.get('financeVatRate') ?? 0.2);
  const vatPct = vatRate <= 1 ? vatRate * 100 : vatRate;
  const tySettings = await getTrendyolSettings(tenantId);
  const efaturam = await loadEfaturamSettingsFromDb(tenantId);
  const prefix = efaturam?.invoicePrefix || 'ERP';
  let invoiceNumber = String(input.invoiceNumber ?? order.trendyolInvoice?.invoiceNumber ?? '').trim();
  if (!invoiceNumber) {
    invoiceNumber = buildTrendyolInvoiceNumber(prefix, await nextInvoiceSequence(prefix));
  }
  if (!isValidTrendyolInvoiceNumber(invoiceNumber)) {
    throw new StoreInvoiceError(
      `Geçersiz fatura numarası: ${invoiceNumber}. Format: 3 alfanumerik + yıl + 9 rakam.`,
      400
    );
  }

  const invoiceDateTime = unixInvoiceDateTime();
  let invoiceLink = String(input.invoiceLink ?? '').trim();
  let invoiceUuid = String(order.trendyolInvoice?.invoiceUuid ?? '').trim();
  const sentVia: 'efaturam' | 'link' | 'file' = input.mode;
  let erpInvoiceId: unknown = null;

  try {
    if (input.mode === 'efaturam') {
      if (!efaturam) {
        throw new StoreInvoiceError('E-Faturam ayarları eksik. Ayarlar → E-Faturam sekmesini doldurun.', 400);
      }
      if (!companyTaxId) {
        throw new StoreInvoiceError('Firma vergi numarası (VKN) ayarlarda tanımlı değil.', 400);
      }

      const recipient = extractRecipientFromOrder(order);
      assertValidRecipientTaxId(recipient.taxId);

      const session = await getEfaturamCustomerSession(efaturam, companyTaxId);
      const companyId = efaturam.companyId || session.companyId;
      const userId = efaturam.userId || session.userId;
      if (!companyId || !userId) {
        throw new StoreInvoiceError(
          'E-Faturam companyId/userId bulunamadı. Bağlantıyı test edin.',
          400
        );
      }

      const lines = (order.items ?? []).map((item) => ({
        name: String(item.productName ?? 'Ürün'),
        quantity: Number(item.quantity) || 1,
        unitPriceGross: Number(item.unitPrice) || 0,
        vatRate: efaturam.defaultVatRate || vatPct,
      }));
      if (lines.length === 0) {
        lines.push({
          name: `Trendyol sipariş ${order.orderNumber}`,
          quantity: 1,
          unitPriceGross: Number(order.totalAmount) || 0,
          vatRate: efaturam.defaultVatRate || vatPct,
        });
      }

      const created = await efaturamCreateEArchive({
        gateway: session.gateway,
        customerToken: session.accessToken,
        companyId,
        userId,
        prefix: efaturam.invoicePrefix,
        xsltCode: efaturam.xsltCode,
        localReferenceId: order.orderNumber,
        recipient: { ...recipient, taxId: recipient.taxId },
        lines,
        orderNumber: order.orderNumber,
      });

      invoiceUuid = String(created.invoiceUuid ?? created.invoiceId ?? '').trim();
      const createdNumber = String(created.invoiceId ?? created.invoiceNumber ?? invoiceNumber).trim();
      if (createdNumber && isValidTrendyolInvoiceNumber(createdNumber)) {
        invoiceNumber = createdNumber;
      }
      invoiceLink =
        resolveEfaturamPublicLink(efaturam.invoiceLinkTemplate, {
          invoiceUuid,
          invoiceId: String(created.invoiceId ?? ''),
          invoiceNumber,
        }) || invoiceLink;

      if (!invoiceLink) {
        throw new StoreInvoiceError(
          'E-Arşiv oluşturuldu ancak public link yok. Fatura link şablonu tanımlayın.',
          400
        );
      }
    }

    if (invoiceLink) {
      invoiceLink = assertHttpsInvoiceLink(invoiceLink);
    }

    const invoiceLines = (order.items ?? []).map((item) => ({
      description: String(item.productName ?? 'Ürün'),
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      vatRate: vatPct,
    }));
    const totals = calculateInvoiceTotals(invoiceLines);
    const erpInvoice = await createErpInvoiceWithRetry({
      orderRef: order.orderNumber,
      status: 'Kesildi',
      customerName: order.customerName ?? '',
      customerTaxId: extractRecipientFromOrder(order).taxId,
      customerAddress: order.customerAddress ?? '',
      lines: totals.lines,
      netTotal: totals.netTotal,
      vatTotal: totals.vatTotal,
      grandTotal: totals.grandTotal,
      externalDocumentId: invoiceUuid || invoiceNumber,
      platform: 'trendyol',
      trendyolPackageId: packageId,
      trendyolInvoiceNumber: invoiceNumber,
      trendyolInvoiceLink: invoiceLink,
    });
    erpInvoiceId = erpInvoice._id;

    if (input.mode === 'file') {
      if (!input.fileBuffer?.length) {
        throw new StoreInvoiceError('Fatura dosyası gerekli.', 400);
      }
      await uploadTrendyolInvoiceFile({
        sellerId: tySettings.sellerId,
        apiKey: tySettings.apiKey,
        apiSecret: tySettings.apiSecret,
        shipmentPackageId: packageId,
        fileBuffer: input.fileBuffer,
        fileName: input.fileName || 'fatura.pdf',
        mimeType: input.mimeType || 'application/pdf',
        invoiceDateTime,
        invoiceNumber,
      });
    } else {
      if (!invoiceLink) throw new StoreInvoiceError('Fatura linki gerekli.', 400);
      await sendTrendyolInvoiceLink({
        sellerId: tySettings.sellerId,
        apiKey: tySettings.apiKey,
        apiSecret: tySettings.apiSecret,
        payload: {
          invoiceLink,
          shipmentPackageId: Number(packageId),
          invoiceDateTime,
          invoiceNumber,
        },
      });
    }

    const markInvoiced =
      input.markInvoiced ?? Boolean(settingsDoc.get('efaturamAutoMarkInvoiced') ?? true);

    if (markInvoiced) {
      const lines = (order.items ?? [])
        .map((item) => ({
          lineId: Number(item.lineId),
          quantity: Number(item.quantity) || 1,
        }))
        .filter((l) => Number.isFinite(l.lineId) && l.lineId > 0);
      if (lines.length > 0) {
        await updateTrendyolPackageStatus({
          sellerId: tySettings.sellerId,
          apiKey: tySettings.apiKey,
          apiSecret: tySettings.apiSecret,
          packageId,
          status: 'Invoiced',
          lines,
          invoiceNumber,
        });
      }
    }

    await Order.findByIdAndUpdate(order._id, {
      $set: {
        trendyolInvoice: {
          status: 'sent',
          invoiceNumber,
          invoiceLink: invoiceLink || undefined,
          invoiceUuid: invoiceUuid || undefined,
          invoiceDateTime,
          sentAt: new Date(),
          sentVia,
          erpInvoiceId: erpInvoice._id,
          lastError: '',
        },
      },
    });

    return {
      orderNumber: order.orderNumber,
      packageId,
      invoiceNumber,
      invoiceLink,
      invoiceUuid,
      sentVia,
      erpInvoiceId: String(erpInvoice._id),
      markedInvoiced: markInvoiced,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fatura gönderilemedi.';
    if (erpInvoiceId) {
      await Invoice.findByIdAndUpdate(erpInvoiceId, { $set: { status: 'İptal' } }).catch(
        () => undefined
      );
    }
    await markTrendyolInvoiceFailed(order._id, message);
    throw error;
  }
}

export async function listPendingTrendyolInvoices(limit = 100, tenantId?: string) {
  await connectToDatabase();
  const safeLimit = Math.min(Math.max(1, limit), 200);
  const orders = await Order.find({
    ...mergeTenant(tenantId, {}),
    platform: 'trendyol',
    status: { $in: ['Hazırlanıyor', 'Kargolandı', 'Beklemede', 'Yeni'] },
    packageId: { $regex: /^\d+$/ },
    $or: [
      { 'trendyolInvoice.status': { $exists: false } },
      { 'trendyolInvoice.status': { $in: ['', 'pending', 'failed'] } },
    ],
  })
    .select(
      'orderNumber status customerName totalAmount packageId createdAt trendyolInvoice items'
    )
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();

  return orders.map((o) => ({
    _id: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    customerName: o.customerName,
    totalAmount: o.totalAmount,
    packageId: o.packageId,
    createdAt: o.createdAt,
    trendyolInvoice: o.trendyolInvoice ?? null,
    itemCount: Array.isArray(o.items) ? o.items.length : 0,
  }));
}
