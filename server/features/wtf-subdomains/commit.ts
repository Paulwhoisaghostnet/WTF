import { randomBytes } from "node:crypto";
import type { WtfDomainsCommitPlan } from "@shared/wtf-subdomains";
import { validateWtfSubdomainLabel, buildWtfSubdomainFullName } from "./labels";
import { getWtfDomainsRegistrarConfig } from "./contracts";

const TEZOS_ADDRESS_PATTERN = /^(tz[1-3]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;

export function prepareCommitPlan(input: {
  label: string;
  targetAddress: string;
  senderAddress?: string;
}):
  | { ok: true; body: WtfDomainsCommitPlan }
  | { ok: false; status: number; error: string; missingEnv?: string[] } {
  const config = getWtfDomainsRegistrarConfig();
  if (!config.enabled) {
    return { ok: false, status: 503, error: "WTF domains registrar is disabled" };
  }
  if (config.missingEnv.length > 0 || !config.registrarAddress) {
    return {
      ok: false,
      status: 503,
      error: "WTF domains registrar is not configured",
      missingEnv: config.missingEnv,
    };
  }

  const labelResult = validateWtfSubdomainLabel(input.label, config.parentDomain);
  if (!labelResult.ok) {
    return { ok: false, status: 400, error: labelResult.error };
  }

  const targetAddress = input.targetAddress.trim();
  if (!TEZOS_ADDRESS_PATTERN.test(targetAddress)) {
    return { ok: false, status: 400, error: "Invalid target address" };
  }

  const salt = randomBytes(16).toString("hex");
  const label = labelResult.label;
  const fullName = buildWtfSubdomainFullName(label, config.parentDomain);

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
      salt,
      labelHex: stringToHex(label),
      hashFormula:
        "blake2b(pack(label_bytes, sender_address, target_address, salt_bytes))",
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
            label: stringToHex(label),
            targetAddress,
            salt,
          },
        },
      ],
    },
  };
}

function stringToHex(value: string): string {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
