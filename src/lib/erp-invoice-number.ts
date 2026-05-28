import Invoice from '@/models/Invoice';

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

export async function createErpInvoiceWithRetry(
  data: Record<string, unknown>,
  maxAttempts = 5
) {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const count = await Invoice.countDocuments();
    const invoiceNumber = `FTR-${year}-${String(count + 1 + attempt).padStart(5, '0')}`;
    try {
      return await Invoice.create({ ...data, invoiceNumber });
    } catch (error) {
      if (isDuplicateKeyError(error) && attempt < maxAttempts - 1) continue;
      throw error;
    }
  }

  throw new Error('ERP fatura numarası üretilemedi.');
}
