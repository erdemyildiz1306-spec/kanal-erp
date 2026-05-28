import connectToDatabase from '@/lib/mongodb';
import Order from '@/models/Order';
import Invoice from '@/models/Invoice';
import { resolveSingletonSettingDocument } from '@/lib/erp-settings';
import { readStorePushSettings } from '@/lib/store-endpoint';
import { pushInvoiceToStore } from '@/lib/store-invoice';
import {
  buildTrendyolInvoiceNumber,
  unixInvoiceDateTime,
} from '@/lib/trendyol-invoice';
import {
  getEfaturamCustomerSession,
  efaturamCreateEArchive,
  resolveEfaturamPublicLink,
} from '@/lib/trendyol-efaturam';
import { calculateInvoiceTotals } from '@/lib/invoice-math';
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
    taxId: taxId.length >= 10 ? taxId : '11111111111',
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

async function nextStoreInvoiceSequence(prefix: string): Promise<number> {
  const year = new Date().getFullYear();
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${year}`);
  const count = await Order.countDocuments({
    $or: [
      { 'storeInvoice.invoiceNumber': { $regex: re } },
      { 'trendyolInvoice.invoiceNumber': { $regex: re } },
    ],
  });
  return count + 1;
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
    throw new Error('Mağaza (web) siparişi bulunamadı.');
  }

  const settingsDoc = await resolveSingletonSettingDocument();
  const storeSettings = readStorePushSettings(settingsDoc);
  const token = String(settingsDoc.get('webApiToken') ?? '').trim();
  const companyTaxId = String(settingsDoc.get('companyTaxId') ?? '').trim();
  const vatRate = Number(settingsDoc.get('financeVatRate') ?? 0.2);
  const vatPct = vatRate <= 1 ? vatRate * 100 : vatRate;
  const efaturam = await loadEfaturamSettingsFromDb();
  const prefix = efaturam?.invoicePrefix || 'WEB';

  let invoiceNumber = String(
    input.invoiceNumber ?? order.storeInvoice?.invoiceNumber ?? ''
  ).trim();
  if (!invoiceNumber) {
    invoiceNumber = buildTrendyolInvoiceNumber(prefix, await nextStoreInvoiceSequence(prefix));
  }

  const invoiceDateTime = unixInvoiceDateTime();
  let invoiceLink = String(input.invoiceLink ?? '').trim();
  let invoiceUuid = String(order.storeInvoice?.invoiceUuid ?? '').trim();
  const sentVia: 'efaturam' | 'link' | 'file' = input.mode;

  if (input.mode === 'efaturam') {
    if (!efaturam) {
      throw new Error('E-Faturam ayarları eksik. Ayarlar → E-Faturam sekmesini doldurun.');
    }
    if (!companyTaxId) {
      throw new Error('Firma VKN/TCKN (Genel & Firma) zorunlu.');
    }

    const session = await getEfaturamCustomerSession(efaturam, companyTaxId);
    const companyId = efaturam.companyId || session.companyId;
    const userId = efaturam.userId || session.userId;
    if (!companyId || !userId) {
      throw new Error('E-Faturam companyId/userId bulunamadı. Bağlantıyı test edin.');
    }

    const recipient = extractWebRecipient(order);
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
      recipient,
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
      throw new Error(
        'E-Arşiv oluşturuldu ancak link yok. E-Faturam ayarlarında fatura link şablonu tanımlayın veya manuel link gönderin.'
      );
    }
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
    if (!input.fileBuffer?.length) throw new Error('Fatura dosyası gerekli.');
    pushPayload.invoiceFileBase64 = input.fileBuffer.toString('base64');
    pushPayload.invoiceFileName = input.fileName || 'fatura.pdf';
    pushPayload.invoiceFileMime = input.mimeType || 'application/pdf';
  } else if (!invoiceLink) {
    throw new Error('Fatura linki gerekli.');
  }

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
    },
  };
  if (markInvoiced && order.status !== 'İptal Edildi' && order.status !== 'İade Edildi') {
    orderUpdate.status = 'Kargolandı';
  }

  const invoiceLines = (order.items ?? []).map((item) => ({
    description: String(item.productName ?? 'Ürün'),
    quantity: Number(item.quantity) || 1,
    unitPrice: Number(item.unitPrice) || 0,
    vatRate: vatPct,
  }));
  const totals = calculateInvoiceTotals(invoiceLines);
  const count = await Invoice.countDocuments();
  const erpInvoiceNumber = `FTR-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  const recipient = extractWebRecipient(order);
  const erpInvoice = await Invoice.create({
    invoiceNumber: erpInvoiceNumber,
    orderRef: order.orderNumber,
    status: 'Kesildi',
    customerName: order.customerName ?? '',
    customerTaxId: recipient.taxId,
    customerAddress: order.customerAddress ?? '',
    lines: totals.lines,
    netTotal: totals.netTotal,
    vatTotal: totals.vatTotal,
    grandTotal: totals.grandTotal,
    externalDocumentId: invoiceUuid || invoiceNumber,
    platform: 'web',
    trendyolInvoiceNumber: invoiceNumber,
    trendyolInvoiceLink: invoiceLink,
  });

  (orderUpdate.storeInvoice as Record<string, unknown>).erpInvoiceId = erpInvoice._id;
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
}

export async function listPendingStoreInvoices(limit = 100) {
  await connectToDatabase();
  const orders = await Order.find({
    platform: 'web',
    status: { $in: ['Yeni', 'Hazırlanıyor', 'Kargolandı', 'Beklemede'] },
    $or: [
      { 'storeInvoice.status': { $exists: false } },
      { 'storeInvoice.status': { $in: ['', 'pending', 'failed'] } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
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
    throw new Error('Mağaza siparişi bulunamadı.');
  }
  const settingsDoc = await resolveSingletonSettingDocument();
  const storeSettings = readStorePushSettings(settingsDoc);
  const token = String(settingsDoc.get('webApiToken') ?? '').trim();
  const invoiceLink = String(input.invoiceLink ?? '').trim();
  if (!invoiceLink) throw new Error('Fatura linki zorunlu.');

  await pushInvoiceToStore(storeSettings, token, {
    source: 'kanal-erp',
    orderNumber: order.orderNumber,
    platformOrderId: String(order.platformOrderId ?? '').trim() || undefined,
    invoiceNumber: String(input.invoiceNumber ?? '').trim() || undefined,
    invoiceLink,
    invoiceDateTime: unixInvoiceDateTime(),
  });

  await Order.findByIdAndUpdate(order._id, {
    $set: {
      storeInvoice: {
        status: 'sent',
        invoiceNumber: input.invoiceNumber ?? '',
        invoiceLink,
        sentAt: new Date(),
        sentVia: 'link',
        lastError: '',
      },
    },
  });

  return { success: true, orderNumber: order.orderNumber };
}
