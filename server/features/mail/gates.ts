/**
 * Mail provisioning gates — pure, DB-free eligibility rules.
 *
 * Users must prove real wtfOS identity (handle + DID) and a linked Tezos wallet
 * before receiving a compartment @wtfos.me address. Bots must present a valid
 * app key and an admin-flagged email-integrated manifest.
 */

import { normalizeMailLocalPart, validateMailLocalPart } from "./address";

export type UserMailGateCode =
  | "ok"
  | "missing_tezos_wallet"
  | "missing_identity"
  | "wtfos_identity_incomplete"
  | "guest_not_registered";

export interface UserMailGateInput {
  /** Linked Tezos wallets on the wtfOS account. */
  tezosWalletCount: number;
  /** Connected Bluesky / external AT account (handle + DID). */
  atprotoAccount: { did: string; handle: string } | null;
  /** Provisioned wtfOS-hosted identity (handle + DID on wtfos.me). */
  wtfosIdentity: { wtfDid: string | null; wtfHandle: string | null; status: string | null } | null;
  /** Fallback username when no handle is available yet. */
  username: string;
}

export type UserMailGateResult =
  | {
      ok: true;
      did: string;
      handle: string;
      identitySource: "wtfos" | "atproto";
      localPart: string;
    }
  | {
      ok: false;
      code: Exclude<UserMailGateCode, "ok">;
      message: string;
      requiredSteps: string[];
    };

const GUEST_STEPS = [
  "Link a Tezos wallet in wtfOS (Settings → Wallets).",
  "Connect a Bluesky / AT Protocol account OR provision a wtfOS handle + DID (Identity / tz2at).",
  "Return here to claim your compartment @wtfos.me address.",
];

function handleLocalPart(handle: string): string | null {
  let bare = handle.trim().toLowerCase();
  if (bare.includes("@")) {
    bare = bare.split("@")[0]!;
  } else if (bare.endsWith(".wtfos.me")) {
    bare = bare.slice(0, -".wtfos.me".length);
  }
  const validated = validateMailLocalPart(normalizeMailLocalPart(bare));
  return validated.ok ? validated.localPart : null;
}

/** Evaluate whether a human user may claim a compartment mailbox. */
export function evaluateUserMailGate(input: UserMailGateInput): UserMailGateResult {
  if (input.tezosWalletCount < 1) {
    return {
      ok: false,
      code: "missing_tezos_wallet",
      message:
        "Link your Tezos wallet before claiming a wtfOS email address. This keeps compartment mail tied to a real identity.",
      requiredSteps: GUEST_STEPS,
    };
  }

  const wtfActive =
    input.wtfosIdentity &&
    input.wtfosIdentity.status === "active" &&
    Boolean(input.wtfosIdentity.wtfDid?.trim()) &&
    Boolean(input.wtfosIdentity.wtfHandle?.trim());

  if (wtfActive) {
    const localPart = handleLocalPart(input.wtfosIdentity!.wtfHandle!);
    if (!localPart) {
      return {
        ok: false,
        code: "wtfos_identity_incomplete",
        message: "Your wtfOS handle cannot be converted into a valid mailbox name. Contact support.",
        requiredSteps: ["Choose a wtfOS handle using letters, numbers, and hyphens only."],
      };
    }
    return {
      ok: true,
      did: input.wtfosIdentity!.wtfDid!,
      handle: input.wtfosIdentity!.wtfHandle!,
      identitySource: "wtfos",
      localPart,
    };
  }

  const at = input.atprotoAccount;
  if (at?.did?.trim() && at.handle?.trim()) {
    const localPart = handleLocalPart(at.handle);
    if (!localPart) {
      return {
        ok: false,
        code: "missing_identity",
        message: "Your connected AT handle cannot be used as a mailbox name.",
        requiredSteps: GUEST_STEPS,
      };
    }
    return {
      ok: true,
      did: at.did,
      handle: at.handle,
      identitySource: "atproto",
      localPart,
    };
  }

  if (input.wtfosIdentity && input.wtfosIdentity.status && input.wtfosIdentity.status !== "active") {
    return {
      ok: false,
      code: "guest_not_registered",
      message:
        "Finish provisioning your wtfOS handle and DID before claiming email. Guest accounts cannot receive compartment addresses.",
      requiredSteps: GUEST_STEPS,
    };
  }

  return {
    ok: false,
    code: "missing_identity",
    message:
      "Connect a Bluesky / AT Protocol account or finish wtfOS handle + DID provisioning before claiming email.",
    requiredSteps: GUEST_STEPS,
  };
}

export type BotMailGateCode =
  | "ok"
  | "registry_disabled"
  | "unknown_key"
  | "key_invalid"
  | "app_not_registered"
  | "app_not_enabled"
  | "email_not_integrated"
  | "app_not_operational";

export interface BotMailGateInput {
  appRegistryEnabled: boolean;
  verifyReason: "ok" | "unknown_key" | "revoked" | "disabled" | "integrity_changed" | "tables_missing";
  appId: string | null;
  registration: {
    enabled: boolean;
    lifecycleState: string;
    manifest: Record<string, unknown> | null;
  } | null;
}

export type BotMailGateResult =
  | { ok: true; appId: string }
  | {
      ok: false;
      code: Exclude<BotMailGateCode, "ok">;
      message: string;
    };

/** Whether an app manifest is flagged for email integration by admin. */
export function isEmailIntegratedManifest(manifest: Record<string, unknown> | null | undefined): boolean {
  const integrations = manifest?.integrations;
  if (!integrations || typeof integrations !== "object") return false;
  const email = (integrations as Record<string, unknown>).email;
  if (!email || typeof email !== "object") return false;
  const enabled = (email as Record<string, unknown>).enabled;
  return enabled === true || enabled === "true" || enabled === 1;
}

/** Evaluate whether an internal wtfOS bot (app key) may request a mailbox. */
export function evaluateBotMailGate(input: BotMailGateInput): BotMailGateResult {
  if (!input.appRegistryEnabled) {
    return {
      ok: false,
      code: "registry_disabled",
      message: "App registry is disabled; bot mail provisioning is unavailable.",
    };
  }
  if (input.verifyReason === "unknown_key" || input.verifyReason === "tables_missing") {
    return { ok: false, code: "unknown_key", message: "Invalid or unknown app key." };
  }
  if (input.verifyReason !== "ok" || !input.appId) {
    return { ok: false, code: "key_invalid", message: `App key is not valid (${input.verifyReason}).` };
  }
  const reg = input.registration;
  if (!reg) {
    return { ok: false, code: "app_not_registered", message: "App is not registered on wtfOS." };
  }
  if (!reg.enabled) {
    return { ok: false, code: "app_not_enabled", message: "App is disabled by admin." };
  }
  if (!isEmailIntegratedManifest(reg.manifest)) {
    return {
      ok: false,
      code: "email_not_integrated",
      message:
        "This app is not flagged as email-integrated. An admin must enable mail integration on the app manifest.",
    };
  }
  const operational = ["alpha", "published"].includes(reg.lifecycleState);
  if (!operational) {
    return {
      ok: false,
      code: "app_not_operational",
      message: "App must be in alpha or published lifecycle before bots can receive mail.",
    };
  }
  return { ok: true, appId: input.appId };
}
