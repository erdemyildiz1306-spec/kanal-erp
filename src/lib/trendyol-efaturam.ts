import axios from 'axios';

const EFATURAM_STAGE = 'https://stage-apigateway.trendyolefaturam.com';
const EFATURAM_PROD = 'https://apigateway.trendyolefaturam.com';

export type EfaturamSettings = {
  useStage: boolean;
  partnerId: number;
  partnerUsername: string;
  partnerPassword: string;
  customerEmail: string;
  customerPassword: string;
  companyId: number;
  userId: number;
  invoicePrefix: string;
  xsltCode: string;
  invoiceLinkTemplate: string;
  defaultVatRate: number;
};

export function getEfaturamGateway(useStage: boolean): string {
  return useStage ? EFATURAM_STAGE : EFATURAM_PROD;
}

function formatEfaturamError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | undefined;
    const detail =
      (typeof data?.detail === 'string' && data.detail) ||
      (typeof data?.message === 'string' && data.message) ||
      (typeof data?.title === 'string' && data.title) ||
      error.message;
    const status = error.response?.status;
    return status ? `[${status}] ${detail}` : detail;
  }
  return error instanceof Error ? error.message : 'E-Faturam hatası';
}

export async function efaturamPartnerSignIn(
  gateway: string,
  username: string,
  password: string
): Promise<{ accessToken: string }> {
  const response = await axios.post(
    `${gateway}/signIn`,
    { username, password },
    { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 60_000 }
  );
  const token = String((response.data as { accessToken?: string })?.accessToken ?? '').trim();
  if (!token) throw new Error('E-Faturam partner oturumu alınamadı (accessToken boş).');
  return { accessToken: token };
}

export async function efaturamCustomerSignIn(
  gateway: string,
  partnerToken: string,
  email: string,
  password: string,
  taxId: string
): Promise<{
  accessToken: string;
  userId: number;
  companyId: number;
  partnerCustomerId: number;
}> {
  const response = await axios.post(
    `${gateway}/customerSignIn`,
    { email, password, taxId },
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${partnerToken}`,
      },
      timeout: 60_000,
    }
  );
  const data = response.data as {
    accessToken?: string;
    userId?: number;
    companyId?: number;
    partnerCustomerId?: number;
  };
  const accessToken = String(data.accessToken ?? '').trim();
  if (!accessToken) throw new Error('E-Faturam müşteri oturumu alınamadı.');
  return {
    accessToken,
    userId: Number(data.userId) || 0,
    companyId: Number(data.companyId) || 0,
    partnerCustomerId: Number(data.partnerCustomerId) || 0,
  };
}

export async function efaturamGetApplicationStatus(
  gateway: string,
  partnerId: number,
  taxId: string,
  partnerToken?: string
) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (partnerToken) headers.Authorization = `Bearer ${partnerToken}`;
  const response = await axios.get(
    `${gateway}/api/invoice/partners/${partnerId}/application-status/by-tax-id/${encodeURIComponent(taxId)}`,
    { headers, timeout: 60_000 }
  );
  return response.data;
}

export type EfaturamLineInput = {
  name: string;
  quantity: number;
  unitPriceGross: number;
  vatRate: number;
};

export type EfaturamCreateArchiveInput = {
  gateway: string;
  customerToken: string;
  companyId: number;
  userId: number;
  prefix: string;
  xsltCode: string;
  localReferenceId: string;
  recipient: {
    taxId: string;
    name: string;
    surname?: string;
    title?: string;
    city: string;
    district?: string;
    address?: string;
    email?: string;
    phone?: string;
    taxOffice?: string;
  };
  lines: EfaturamLineInput[];
  orderNumber?: string;
  orderDate?: string;
};

/** E-Arşiv fatura oluştur — https://developers.trendyolefaturam.com */
export async function efaturamCreateEArchive(input: EfaturamCreateArchiveInput) {
  let taxExcluded = 0;
  let taxAmount = 0;
  let taxInclusive = 0;

  const productLines = input.lines.map((line, idx) => {
    const qty = Math.max(1, line.quantity);
    const grossUnit = Math.max(0, line.unitPriceGross);
    const lineGross = grossUnit * qty;
    const vatRate = Math.max(0, line.vatRate);
    const lineNet = vatRate > 0 ? lineGross / (1 + vatRate / 100) : lineGross;
    const lineVat = lineGross - lineNet;
    taxExcluded += lineNet;
    taxAmount += lineVat;
    taxInclusive += lineGross;
    return {
      lineNumber: idx + 1,
      productName: line.name.slice(0, 255),
      quantity: qty,
      unitPrice: Math.round(lineNet * 100) / 100,
      vatRate,
      lineTotal: Math.round(lineGross * 100) / 100,
    };
  });

  const payload: Record<string, unknown> = {
    autoInvoiceId: true,
    source: 'PARTNER',
    companyId: input.companyId,
    userId: input.userId,
    prefix: input.prefix.slice(0, 3).toUpperCase(),
    currency: 'TRY',
    scenario: 'EARSIVFATURA',
    invoiceTypeCode: 'SATIS',
    localReferenceId: input.localReferenceId.slice(0, 127),
    taxExcludedPrice: Math.round(taxExcluded * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    taxInclusiveAmount: Math.round(taxInclusive * 100) / 100,
    price: Math.round(taxInclusive * 100) / 100,
    payableAmount: Math.round(taxInclusive * 100) / 100,
    productLines,
    recipientInfo: {
      taxId: input.recipient.taxId,
      countryCode: 'TR',
      city: input.recipient.city || 'İstanbul',
      district: input.recipient.district || undefined,
      address: input.recipient.address || undefined,
      email: input.recipient.email || undefined,
      phone: input.recipient.phone || undefined,
      name: input.recipient.name,
      surname: input.recipient.surname || undefined,
      taxOffice: input.recipient.taxOffice || undefined,
    },
    orderInfos: input.orderNumber
      ? [{ orderId: input.orderNumber, orderDate: input.orderDate || new Date().toISOString().slice(0, 10) }]
      : undefined,
  };
  if (input.xsltCode.trim()) payload.xsltCode = input.xsltCode.trim();

  try {
    const response = await axios.post(
      `${input.gateway}/api/invoice/documents/earchive`,
      payload,
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.customerToken}`,
        },
        timeout: 120_000,
      }
    );
    return response.data as Record<string, unknown>;
  } catch (error) {
    throw new Error(formatEfaturamError(error));
  }
}

export async function efaturamGetEArchiveStatus(
  gateway: string,
  customerToken: string,
  invoiceUuid: string
) {
  try {
    const response = await axios.get(
      `${gateway}/api/invoice/documents/earchive/status/${encodeURIComponent(invoiceUuid)}`,
      {
        headers: { Accept: 'application/json', Authorization: `Bearer ${customerToken}` },
        timeout: 60_000,
      }
    );
    return response.data as Record<string, unknown>;
  } catch (error) {
    throw new Error(formatEfaturamError(error));
  }
}

export function resolveEfaturamPublicLink(
  template: string,
  data: { invoiceUuid?: string; invoiceId?: string; invoiceNumber?: string }
): string {
  const tpl = String(template ?? '').trim();
  if (!tpl) return '';
  return tpl
    .replace(/\{uuid\}/gi, String(data.invoiceUuid ?? ''))
    .replace(/\{invoiceId\}/gi, String(data.invoiceId ?? ''))
    .replace(/\{invoiceNumber\}/gi, String(data.invoiceNumber ?? ''));
}

export async function getEfaturamCustomerSession(settings: EfaturamSettings, companyTaxId: string) {
  const gateway = getEfaturamGateway(settings.useStage);
  const partner = await efaturamPartnerSignIn(
    gateway,
    settings.partnerUsername,
    settings.partnerPassword
  );
  const customer = await efaturamCustomerSignIn(
    gateway,
    partner.accessToken,
    settings.customerEmail,
    settings.customerPassword,
    companyTaxId
  );
  return { gateway, partnerToken: partner.accessToken, ...customer };
}

export { formatEfaturamError };
