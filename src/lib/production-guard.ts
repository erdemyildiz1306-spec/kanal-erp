/** Üretim ortamında güvenlik kontrolleri — fail-closed davranış. */
export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}
