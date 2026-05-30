import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import Invoice from '@/models/Invoice';
import { resolveSettingDocument } from '@/lib/erp-settings';
import { readStorePushSettings } from '@/lib/store-endpoint';
import { normalizeTenantId } from '@/lib/tenant';
import { mergeTenant } from '@/lib/tenant-query';
import { pushInvoiceToStore } from '@/lib/store-invoice';
import {
  buildTrendyolInvoiceNumber,
  unixInvoiceDateTime,
  isValidTrendyolInvoiceNumber,
} from '@/lib/trendyol-invoice';
import {
  getEfaturamCustomerSession,
  efaturamCreateEArchive,
  resolveEfaturamPublicLink,
} from '@/lib/trendyol-efaturam';
import { calculateInvoiceTotals } from '@/lib/invoice-math';
import { createErpInvoiceWithRetry } from '@/lib/erp-invoice-number';
import { assertHttpsInvoiceLink } from '@/lib/outbound-url';
import { StoreInvoiceError } from '@/lib/store-invoice-errors';
import {
  loadEfaturamSettingsFromDb,
  type OrderDoc,
} from '@/lib/trendyol-invoice-flow';

function parseCustomerName(full: string): { name: string; surname: string } {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: 'Müşteri', surname: '' };
  if (parts.length === 1) return { name: parts[0]!, surname: '' };
  return { name: parts[0]!, surname: parts.slice(1).join(' ') };
}

function extractWebRecipient(order: OrderDoc) {
  const meta = (order.storeMeta ?? {}) as Record<string, string>;
  const { name, surname } = parseCustomerName(order.customerName || meta.customerName || '');
  const taxId = String(meta.taxId ?? meta.invoiceTaxNumber ?? meta.customerTaxId ?? '').replace(
    /\D/g,
    ''
  );
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

function assertValidRecipientTaxId(taxId: string) {
  if (taxId.length !== 10 && taxId.length !== 11) {
    throw new StoreInvoiceError(
      'Mağaza siparişinde geçerli VKN/TCKN yok. Webhook veya sipariş senkronunda fatura alanlarını (taxId, email) gönderin.',
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

async function nextStoreInvoiceSequence(prefix: string): Promise<number> {
  const year = new Date().getFullYear();
  const re = new RegExp(`^${escapeRegex(prefix)}${year}`);
  const latest = await Order.findOne({
    $or: [
      { 'storeInvoice.invoiceNumber': { $regex: re } },
      { 'trendyolInvoice.invoiceNumber': { $regex: re } },
    ],
  })
    .sort({ updatedAt: -1 })
    .select('storeInvoice.invoiceNumber trendyolInvoice.invoiceNumber')
    .lean();

  let maxSeq = 0;
  if (latest) {
    maxSeq = Math.max(
      parseSequenceFromInvoiceNumber(latest.storeInvoice?.invoiceNumber ?? '', prefix, year),
      parseSequenceFromInvoiceNumber(latest.trendyolInvoice?.invoiceNumber ?? '', prefix, year)
    );
  }
  return maxSeq + 1;
}

async function createErpInvoiceRecord(input: {
  order: OrderDoc;
  invoiceUuid: string;
  invoiceNumber: string;
  invoiceLink: string;
  vatPct: number;
}) {
  const invoiceLines = (input.order.items ?? []).map((item) => ({
    description: String(item.productName ?? 'Ürün'),
    quantity: Number(item.quantity) || 1,
    unitPrice: Number(item.unitPrice) || 0,
    vatRate: input.vatPct,
  }));
  const totals = calculateInvoiceTotals(invoiceLines);
  const recipient = extractWebRecipient(input.order);

  return createErpInvoiceWithRetry({
    orderRef: input.order.orderNumber,
    status: 'Kesildi',
    customerName: input.order.customerName ?? '',
    customerTaxId: recipient.taxId,
    customerAddress: input.order.customerAddress ?? '',
    lines: totals.lines,
    netTotal: totals.netTotal,
    vatTotal: totals.vatTotal,
    grandTotal: totals.grandTotal,
    externalDocumentId: input.invoiceUuid || input.invoiceNumber,
    platform: 'web',
    trendyolInvoiceNumber: input.invoiceNumber,
    trendyolInvoiceLink: input.invoiceLink,
  });
}

async function markStoreInvoiceFailed(orderId: unknown, message: string) {
  await Order.findByIdAndUpdate(orderId, {
    $set: {
      'storeInvoice.status': 'failed',
      'storeInvoice.lastError': String(message).slice(0, 500),
    },
  });
}

export async function issueStoreInvoiceForOrder(input: {
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
  if (!order || order.platform !== 'web') {
    throw new StoreInvoiceError('Mağaza (web) siparişi bulunamadı.', 404);
  }

  const tenantId = normalizeTenantId(order.tenantId);
  const settingsDoc = await resolveSettingDocument(tenantId);
  const storeSettings = readStorePushSettings(settingsDoc);
  const token = String(settingsDoc.get('webApiToken') ?? '').trim();
  const companyTaxId = String(settingsDoc.get('companyTaxId') ?? '').trim();
  const vatRate = Number(settingsDoc.get('financeVatRate') ?? 0.2);
  const vatPct = vatRate <= 1 ? vatRate * 100 : vatRate;
  const efaturam = await loadEfaturamSettingsFromDb(tenantId);
  const prefix = efaturam?.invoicePrefix || 'WEB';

  let invoiceNumber = String(
    input.invoiceNumber ?? order.storeInvoice?.invoiceNumber ?? ''
  ).trim();
  if (invoiceNumber && !isValidTrendyolInvoiceNumber(invoiceNumber)) {
    throw new StoreInvoiceError('Geçersiz fatura numarası formatı.', 400);
  }
  if (!invoiceNumber) {
    invoiceNumber = buildTrendyolInvoiceNumber(prefix, await nextStoreInvoiceSequence(prefix));
  }

  const invoiceDateTime = unixInvoiceDateTime();
  let invoiceLink = String(input.invoiceLink ?? '').trim();
  let invoiceUuid = String(order.storeInvoice?.invoiceUuid ?? '').trim();
  const sentVia: 'efaturam' | 'link' | 'file' = input.mode;
  let erpInvoiceId: unknown = null;

  try {
    if (input.mode === 'efaturam') {
      if (!efaturam) {
        throw new StoreInvoiceError(
          'E-Faturam ayarları eksik. Ayarlar → E-Faturam sekmesini doldurun.',
          400
        );
      }
      if (!companyTaxId) {
        throw new StoreInvoiceError('Firma VKN/TCKN (Genel & Firma) zorunlu.', 400);
      }

      const recipient = extractWebRecipient(order);
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
          name: `Mağaza sipariş ${order.orderNumber}`,
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
      if (createdNumber) invoiceNumber = createdNumber;

      invoiceLink =
        resolveEfaturamPublicLink(efaturam.invoiceLinkTemplate, {
          invoiceUuid,
          invoiceId: String(created.invoiceId ?? ''),
          invoiceNumber,
        }) || invoiceLink;

      if (!invoiceLink) {
        throw new StoreInvoiceError(
          'E-Arşiv oluşturuldu ancak link yok. E-Faturam ayarlarında fatura link şablonu tanımlayın veya manuel link gönderin.',
          400
        );
      }
    }

    if (invoiceLink) {
      invoiceLink = assertHttpsInvoiceLink(invoiceLink);
    }

    const pushPayload: Parameters<typeof pushInvoiceToStore>[2] = {
      source: 'kanal-erp',
      orderNumber: order.orderNumber,
      platformOrderId: String(order.platformOrderId ?? '').trim() || undefined,
      invoiceNumber,
      invoiceDateTime,
      invoiceLink: invoiceLink || undefined,
      invoiceUuid: invoiceUuid || undefined,
    };

    if (input.mode === 'file') {
      if (!input.fileBuffer?.length) {
        throw new StoreInvoiceError('Fatura dosyası gerekli.', 400);
      }
      pushPayload.invoiceFileBase64 = input.fileBuffer.toString('base64');
      pushPayload.invoiceFileName = input.fileName || 'fatura.pdf';
      pushPayload.invoiceFileMime = input.mimeType || 'application/pdf';
    } else if (!invoiceLink) {
      throw new StoreInvoiceError('Fatura linki gerekli.', 400);
    }

    const erpInvoice = await createErpInvoiceRecord({
      order,
      invoiceUuid,
      invoiceNumber,
      invoiceLink,
      vatPct,
    });
    erpInvoiceId = erpInvoice._id;

    await pushInvoiceToStore(storeSettings, token, pushPayload);

    const markInvoiced =
      input.markInvoiced ?? Boolean(settingsDoc.get('storeAutoMarkInvoiced') ?? true);

    const orderUpdate: Record<string, unknown> = {
      storeInvoice: {
        status: 'sent',
        invoiceNumber,
        invoiceLink: invoiceLink || undefined,
        invoiceUuid: invoiceUuid || undefined,
        invoiceDateTime,
        sentAt: new Date(),
        sentVia,
        lastError: '',
        erpInvoiceId: erpInvoice._id,
      },
    };
    if (markInvoiced && order.status !== 'İptal Edildi' && order.status !== 'İade Edildi') {
      orderUpdate.status = 'Kargolandı';
    }

    await Order.findByIdAndUpdate(order._id, { $set: orderUpdate });

    return {
      orderNumber: order.orderNumber,
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
    await markStoreInvoiceFailed(order._id, message);
    throw error;
  }
}

export async function listPendingStoreInvoices(limit = 100, tenantId?: string) {
  await connectToDatabase();
  const safeLimit = Math.min(Math.max(1, limit), 200);
  const orders = await Order.find({
    ...mergeTenant(tenantId, {}),
    platform: 'web',
    status: { $in: ['Yeni', 'Hazırlanıyor', 'Kargolandı', 'Beklemede'] },
    $or: [
      { 'storeInvoice.status': { $exists: false } },
      { 'storeInvoice.status': { $in: ['', 'pending', 'failed'] } },
    ],
  })
    .select(
      'orderNumber status customerName totalAmount platformOrderId createdAt storeInvoice items'
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
    platformOrderId: o.platformOrderId,
    createdAt: o.createdAt,
    storeInvoice: o.storeInvoice ?? null,
    itemCount: Array.isArray(o.items) ? o.items.length : 0,
  }));
}

export async function notifyStoreInvoiceOnly(input: {
  orderId: string;
  invoiceLink: string;
  invoiceNumber?: string;
}) {
  await connectToDatabase();
  const order = await Order.findById(input.orderId).lean();
  if (!order || order.platform !== 'web') {
    throw new StoreInvoiceError('Mağaza siparişi bulunamadı.', 404);
  }

  const tenantId = normalizeTenantId(order.tenantId);
  const settingsDoc = await resolveSettingDocument(tenantId);
  const storeSettings = readStorePushSettings(settingsDoc);
  const token = String(settingsDoc.get('webApiToken') ?? '').trim();
  const invoiceLink = assertHttpsInvoiceLink(String(input.invoiceLink ?? '').trim());
  const invoiceNumber = String(input.invoiceNumber ?? '').trim();
  if (invoiceNumber && !isValidTrendyolInvoiceNumber(invoiceNumber)) {
    throw new StoreInvoiceError('Geçersiz fatura numarası formatı.', 400);
  }

  try {
    await pushInvoiceToStore(storeSettings, token, {
      source: 'kanal-erp',
      orderNumber: order.orderNumber,
      platformOrderId: String(order.platformOrderId ?? '').trim() || undefined,
      invoiceNumber: invoiceNumber || undefined,
      invoiceLink,
      invoiceDateTime: unixInvoiceDateTime(),
    });

    await Order.findByIdAndUpdate(order._id, {
      $set: {
        'storeInvoice.status': 'sent',
        'storeInvoice.invoiceNumber': invoiceNumber,
        'storeInvoice.invoiceLink': invoiceLink,
        'storeInvoice.sentAt': new Date(),
        'storeInvoice.sentVia': 'link',
        'storeInvoice.lastError': '',
      },
    });

    return { success: true, orderNumber: order.orderNumber };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fatura linki gönderilemedi.';
    await markStoreInvoiceFailed(order._id, message);
    throw error;
  }
}
