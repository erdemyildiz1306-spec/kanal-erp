export type LineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};

export function calculateInvoiceTotals(lines: LineInput[]) {
  let netTotal = 0;
  let vatTotal = 0;

  const computed = lines.map((line) => {
    const q = Math.max(0, Number(line.quantity) || 0);
    const unit = Number(line.unitPrice) || 0;
    const rate = Number.isFinite(Number(line.vatRate)) ? Number(line.vatRate) : 20;
    const lineNet = q * unit;
    const lineVat = (lineNet * rate) / 100;
    const lineGross = lineNet + lineVat;
    netTotal += lineNet;
    vatTotal += lineVat;
    return {
      description: line.description,
      quantity: q,
      unitPrice: unit,
      vatRate: rate,
      lineNet,
      lineVat,
      lineGross,
    };
  });

  return {
    lines: computed,
    netTotal,
    vatTotal,
    grandTotal: netTotal + vatTotal,
  };
}
