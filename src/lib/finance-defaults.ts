import { resolveSettingDocument } from '@/lib/erp-settings';
import {
  DEFAULT_CARGO_TARIFF,
  normalizeCargoTariff,
  type CargoTariffTier,
} from '@/lib/cargo-estimate';

export type FinanceDefaults = {
  defaultCommissionPct: number;
  stopajRatePct: number;
  serviceFeePerOrder: number;
  defaultDesi: number;
  defaultCargoFee: number;
  vatRate: number;
  cargoTariff: CargoTariffTier[];
};

export const FALLBACK_FINANCE_DEFAULTS: FinanceDefaults = {
  defaultCommissionPct: 20,
  stopajRatePct: 1,
  serviceFeePerOrder: 0,
  defaultDesi: 1,
  defaultCargoFee: 0,
  vatRate: 0.2,
  cargoTariff: DEFAULT_CARGO_TARIFF,
};

export async function getFinanceDefaults(tenantId?: string): Promise<FinanceDefaults> {
  const doc = await resolveSettingDocument(tenantId);
  const commission = Number(doc.get('financeDefaultCommissionPct'));
  const stopaj = Number(doc.get('financeStopajRatePct'));
  const service = Number(doc.get('financeServiceFeePerOrder'));
  const desi = Number(doc.get('financeDefaultDesi'));
  const cargo = Number(doc.get('financeDefaultCargoFee'));
  const vat = Number(doc.get('financeVatRate'));

  return {
    defaultCommissionPct:
      Number.isFinite(commission) && commission >= 0 ? commission : FALLBACK_FINANCE_DEFAULTS.defaultCommissionPct,
    stopajRatePct:
      Number.isFinite(stopaj) && stopaj >= 0 ? stopaj : FALLBACK_FINANCE_DEFAULTS.stopajRatePct,
    serviceFeePerOrder:
      Number.isFinite(service) && service >= 0 ? service : FALLBACK_FINANCE_DEFAULTS.serviceFeePerOrder,
    defaultDesi:
      Number.isFinite(desi) && desi > 0 ? desi : FALLBACK_FINANCE_DEFAULTS.defaultDesi,
    defaultCargoFee:
      Number.isFinite(cargo) && cargo >= 0 ? cargo : FALLBACK_FINANCE_DEFAULTS.defaultCargoFee,
    vatRate:
      Number.isFinite(vat) && vat > 0 && vat < 1 ? vat : FALLBACK_FINANCE_DEFAULTS.vatRate,
    cargoTariff: normalizeCargoTariff(doc.get('cargoDesiTariff')),
  };
}
