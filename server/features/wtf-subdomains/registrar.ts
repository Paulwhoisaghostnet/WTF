import type {
  WtfDomainsRegistrationPlan,
  WtfDomainsRegistrarStatus,
} from "@shared/wtf-subdomains";
import {
  buildWtfSubdomainFullName,
  validateWtfSubdomainLabel,
} from "./labels";
import {
  fetchRegistrarStorage,
  getWtfDomainsRegistrarConfig,
} from "./contracts";

const TEZOS_ADDRESS_PATTERN = /^(tz[1-3]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;

export async function getRegistrarStatus(): Promise<WtfDomainsRegistrarStatus> {
  const config = getWtfDomainsRegistrarConfig();
  if (!config.enabled || config.missingEnv.length > 0) {
    return { config, storage: null };
  }

  try {
    const storage = await fetchRegistrarStorage(config);
    return {
      config,
      storage: {
        minCommitAgeSec: numberFromStorage(storage.min_commit_age, 30),
        maxCommitAgeSec: numberFromStorage(storage.max_commit_age, 86_400),
        maxPerWallet: numberFromStorage(storage.max_per_wallet, 1),
        paused: storage.paused === true,
        whitelistEnabled: storage.whitelist_enabled === true,
        nameRegistry:
          typeof storage.name_registry === "string"
            ? storage.name_registry
            : null,
      },
    };
  } catch (err) {
    return {
      config,
      storage: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function prepareRegistrarRegistration(input: {
  label: string;
  targetAddress: string;
}):
  | { ok: true; body: WtfDomainsRegistrationPlan }
  | { ok: false; status: number; error: string; missingEnv?: string[] } {
  const config = getWtfDomainsRegistrarConfig();
  if (!config.enabled) {
    return {
      ok: false,
      status: 503,
      error: "WTF domains registrar is disabled",
    };
  }
  if (config.missingEnv.length > 0 || !config.registrarAddress) {
    return {
      ok: false,
      status: 503,
      error: "WTF domains registrar is not configured",
      missingEnv: config.missingEnv,
    };
  }

  const labelResult = validateWtfSubdomainLabel(
    input.label,
    config.parentDomain
  );
  if (!labelResult.ok) {
    return { ok: false, status: 400, error: labelResult.error };
  }
  const targetAddress = input.targetAddress.trim();
  if (!TEZOS_ADDRESS_PATTERN.test(targetAddress)) {
    return { ok: false, status: 400, error: "Invalid target address" };
  }

  const label = labelResult.label;
  const fullName = buildWtfSubdomainFullName(label, config.parentDomain);
  const labelHex = stringToHex(label);
  return {
    ok: true,
    body: {
      enabled: true,
      network: config.network,
      parentDomain: config.parentDomain,
      registrarAddress: config.registrarAddress,
      label,
      fullName,
      targetAddress,
      labelHex,
      minCommitAgeSec: 30,
      operations: [
        {
          phase: "commit",
          destination: config.registrarAddress,
          entrypoint: "commit",
          value: {
            commitmentHash:
              "client-computed blake2b(pack(label, sender, target, salt))",
          },
        },
        {
          phase: "register",
          destination: config.registrarAddress,
          entrypoint: "register",
          value: {
            label: labelHex,
            targetAddress,
            salt: "client-generated 16-byte hex",
          },
        },
      ],
    },
  };
}

function numberFromStorage(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringToHex(value: string): string {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
