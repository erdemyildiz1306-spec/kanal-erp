export class StoreInvoiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'StoreInvoiceError';
    this.status = status;
  }
}

export function mapStoreInvoiceHttpError(error: unknown): { status: number; message: string } {
  if (error instanceof StoreInvoiceError) {
    return { status: error.status, message: error.message };
  }
  const message = error instanceof Error ? error.message : 'Sunucu hatası';
  if (/bulunamadı/i.test(message)) {
    return { status: 404, message };
  }
  if (
    /zorunlu|geçersiz|eksik|tanımlı değil|HTTPS|VKN|TCKN|format|boyutu|dosyası/i.test(message)
  ) {
    return { status: 400, message };
  }
  return { status: 502, message };
}
