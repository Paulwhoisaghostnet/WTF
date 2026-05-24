import type { WtfDomainsWalletStatus } from "@shared/wtf-subdomains";
import { resolveTezosDomainsIdentity } from "../../lib/tezos-domains";
import { fetchRegistrarStorage, getWtfDomainsRegistrarConfig } from "./contracts";

export async function getWalletRegistrarStatus(
  address: string
): Promise<WtfDomainsWalletStatus> {
  const config = getWtfDomainsRegistrarConfig();
  const normalized = address.trim();
  const identity = await resolveTezosDomainsIdentity(normalized, { limit: 50 });

  const wtfDomains = identity.ownedDomains.filter((d) =>
    d.endsWith(`.${config.parentDomain}`)
  );
  const hackDomains = identity.ownedDomains.filter((d) => d.endsWith(".hack.tez"));

  let pendingCommitHash: string | null = null;
  let registrationCount = 0;
  let minCommitAgeSec = 30;
  let paused = false;

  if (config.enabled && config.registrarAddress) {
    try {
      const storage = await fetchRegistrarStorage(config);
      pendingCommitHash = readPendingCommitment(storage, normalized);
      registrationCount = readRegistrationCount(storage, normalized);
      minCommitAgeSec = numberFromStorage(storage.min_commit_age, 30);
      paused = storage.paused === true;
    } catch {
      // Registrar storage unavailable — still return domain identity.
    }
  }

  return {
    address: normalized,
    reverseDomain: identity.reverseDomain,
    wtfDomains,
    hackDomains,
    registrar: {
      enabled: config.enabled,
      parentDomain: config.parentDomain,
      registrarAddress: config.registrarAddress,
      pendingCommitHash,
      registrationCount,
      minCommitAgeSec,
      paused,
      canRegister: registrationCount < 1 && !paused,
    },
  };
}

function readPendingCommitment(
  storage: Record<string, unknown>,
  address: string
): string | null {
  const pending = storage.pending_commitments;
  if (!pending || typeof pending !== "object") return null;
  const map = pending as Record<string, unknown>;
  const value = map[address];
  return typeof value === "string" ? value : null;
}

function readRegistrationCount(
  storage: Record<string, unknown>,
  address: string
): number {
  const registrations = storage.registrations;
  if (!registrations || typeof registrations !== "object") return 0;
  const map = registrations as Record<string, unknown>;
  const value = map[address];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberFromStorage(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
