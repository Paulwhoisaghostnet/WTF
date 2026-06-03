import {
  grantedSkywireCapabilities,
  type SkywirePermissionCapability,
} from "@shared/atproto-permissions";

export type WtfLiveAtprotoAccount = null | {
  oauthCapabilities?: readonly SkywirePermissionCapability[];
  oauthScopes?: string | null;
  session?: { reconnectRequired?: boolean };
};

export function accountCapabilities(account: WtfLiveAtprotoAccount): Set<SkywirePermissionCapability> {
  if (!account) return new Set();
  if (account.oauthCapabilities?.length) return new Set(account.oauthCapabilities);
  return grantedSkywireCapabilities(account.oauthScopes);
}

export function accountHasCapability(
  account: WtfLiveAtprotoAccount,
  capability: SkywirePermissionCapability,
): boolean {
  return accountCapabilities(account).has(capability);
}

export function canUseAtprotoSession(account: WtfLiveAtprotoAccount): boolean {
  return Boolean(account && !account.session?.reconnectRequired);
}
