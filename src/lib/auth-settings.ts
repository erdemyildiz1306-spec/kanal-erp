import { resolveSingletonSettingDocument } from './erp-settings';

export type AuthPolicy = {
  allowSignup: boolean;
  requireApproval: boolean;
};

const DEFAULTS: AuthPolicy = {
  allowSignup: true,
  requireApproval: true,
};

export async function getAuthPolicy(): Promise<AuthPolicy> {
  try {
    const doc = await resolveSingletonSettingDocument();
    return {
      allowSignup: doc.get('authAllowSignup') !== false,
      requireApproval: doc.get('authRequireApproval') !== false,
    };
  } catch {
    return DEFAULTS;
  }
}
