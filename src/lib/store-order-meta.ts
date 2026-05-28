/** Web mağaza siparişinden fatura alıcı meta alanlarını çıkarır */

function pickString(source: unknown, ...keys: string[]): string {
  if (!source || typeof source !== 'object') return '';
  const obj = source as Record<string, unknown>;
  for (const key of keys) {
    const v = obj[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

export function buildStoreMetaFromPayload(data: Record<string, unknown>) {
  const billing =
    data.billing ?? data.invoice ?? data.invoiceInfo ?? data.customer ?? data.buyer;
  const billingObj =
    billing && typeof billing === 'object' ? (billing as Record<string, unknown>) : null;

  const meta: Record<string, string> = {};
  const email =
    pickString(data, 'customerEmail', 'email', 'invoiceEmail') ||
    pickString(billingObj, 'email', 'customerEmail');
  const phone =
    pickString(data, 'customerPhone', 'phone') || pickString(billingObj, 'phone', 'customerPhone');
  const taxId =
    pickString(data, 'taxId', 'invoiceTaxNumber', 'customerTaxId', 'vkn', 'tckn', 'identityNumber') ||
    pickString(billingObj, 'taxId', 'vkn', 'tckn', 'identityNumber');
  const taxOffice =
    pickString(data, 'taxOffice', 'invoiceTaxOffice') ||
    pickString(billingObj, 'taxOffice', 'invoiceTaxOffice');
  const companyName =
    pickString(data, 'companyName', 'company', 'invoiceTitle') ||
    pickString(billingObj, 'companyName', 'company', 'title');
  const city =
    pickString(data, 'city', 'invoiceCity') || pickString(billingObj, 'city', 'invoiceCity');
  const district =
    pickString(data, 'district', 'invoiceDistrict') ||
    pickString(billingObj, 'district', 'invoiceDistrict');
  const address =
    pickString(data, 'address', 'invoiceAddress', 'billingAddress') ||
    pickString(billingObj, 'address', 'invoiceAddress', 'billingAddress');
  const customerName =
    pickString(data, 'customerName', 'invoiceName') ||
    pickString(billingObj, 'name', 'customerName', 'fullName');

  if (email) meta.email = email;
  if (phone) meta.phone = phone;
  if (taxId) meta.taxId = taxId.replace(/\D/g, '');
  if (taxOffice) meta.taxOffice = taxOffice;
  if (companyName) meta.companyName = companyName;
  if (city) meta.city = city;
  if (district) meta.district = district;
  if (address) meta.address = address;
  if (customerName) meta.customerName = customerName;

  return Object.keys(meta).length > 0 ? meta : null;
}
