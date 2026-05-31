import { randomUUID } from "crypto";
import type { CrpNomination } from "@shared/atproto";
import { findCrpCategory } from "@shared/crp-categories";
import { shortTezosAddress } from "@shared/tezos-identity";

export const CRP_NOMINATION_COLLECTION = "app.wtfos.liveops.crpNomination" as const;

export type CrpNomineeSelection = {
  tezosAddress: string;
  tezosDomain?: string | null;
  displayName?: string | null;
  xHandle?: string | null;
  bskyHandle?: string | null;
  identitySources?: string[];
};

export type CrpNominationInput = {
  nominatorUserId: number;
  nominatorDid?: string;
  nominatorHandle?: string | null;
  nominee: CrpNomineeSelection;
  categoryId: string;
  justification?: { summary?: string | null; links?: string[] | null };
  campaignMonth?: string;
  nominationId?: string;
  createdAt?: string;
  anonymous?: boolean;
  shareRefs?: {
    nominationUri?: string;
    bskyPostUri?: string;
    bskyPostUrl?: string;
  };
};

export function currentCampaignMonth(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function nominationRkey(input: {
  nominatorUserId: number;
  categoryId: string;
  tezosAddress: string;
  campaignMonth: string;
}): string {
  const wallet = input.tezosAddress.trim().toLowerCase();
  return [
    "crp",
    input.nominatorUserId,
    input.categoryId,
    input.campaignMonth,
    wallet.slice(0, 12),
    wallet.slice(-8),
  ].join("-");
}

/** Opaque rkey for anonymous nominations — no nominator id embedded. */
export function anonymousNominationRkey(nominationId: string): string {
  return `crp-anon-${nominationId}`;
}

export function buildCrpNominationRecord(input: CrpNominationInput): Omit<CrpNomination, "$type"> {
  const category = findCrpCategory(input.categoryId);
  if (!category) {
    throw new Error("invalid_crp_category");
  }
  const campaignMonth = input.campaignMonth ?? currentCampaignMonth();
  const nomineeSources = Array.from(new Set(input.nominee.identitySources ?? [])).slice(0, 32);
  const justification =
    input.justification?.summary?.trim() || (input.justification?.links?.length ?? 0) > 0
      ? {
          summary: input.justification?.summary?.trim() || undefined,
          links: (input.justification?.links ?? [])
            .map((link) => String(link || "").trim())
            .filter(Boolean)
            .slice(0, 12),
        }
      : undefined;

  const base = {
    schemaVersion: 1 as const,
    nominationId: input.nominationId ?? randomUUID(),
    nominee: {
      tezosAddress: input.nominee.tezosAddress.trim(),
      tezosDomain: input.nominee.tezosDomain?.trim() || undefined,
      displayName: input.nominee.displayName?.trim() || undefined,
      xHandle: normalizeXHandle(input.nominee.xHandle) || undefined,
      bskyHandle: normalizeBskyHandle(input.nominee.bskyHandle) || undefined,
      identitySources: nomineeSources.length > 0 ? nomineeSources : undefined,
    },
    categoryId: category.id,
    categoryLabel: category.label,
    justification,
    campaignMonth,
    shareRefs: input.shareRefs,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  if (input.anonymous) {
    return {
      ...base,
      anonymous: true,
    };
  }

  return {
    ...base,
    nominatorUserId: input.nominatorUserId,
    nominatorDid: input.nominatorDid?.trim() || `wtfos:user:${input.nominatorUserId}`,
    nominatorHandle: input.nominatorHandle?.trim() || undefined,
  };
}

export function nomineeDisplayLabel(nominee: CrpNomination["nominee"]): string {
  return (
    nominee.displayName?.trim() ||
    nominee.tezosDomain?.trim() ||
    (nominee.xHandle ? `@${normalizeXHandle(nominee.xHandle)}` : null) ||
    (nominee.bskyHandle ? `@${normalizeBskyHandle(nominee.bskyHandle)}` : null) ||
    shortTezosAddress(nominee.tezosAddress)
  );
}

export function normalizeXHandle(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .split("/")[0]
    .toLowerCase();
}

export function normalizeBskyHandle(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

export function normalizeNomineeQuery(value: string): string {
  return String(value || "").trim();
}

export function detectNomineeQueryKind(
  value: string
): "wallet" | "x" | "bsky" | "tezos_domain" | "unknown" {
  const query = normalizeNomineeQuery(value);
  if (!query) return "unknown";
  if (/^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(query)) return "wallet";
  if (/^[a-z0-9][a-z0-9-_.]{0,250}\.tez$/i.test(query)) return "tezos_domain";
  if (query.startsWith("@")) {
    if (/\.bsky\.(social|app)$/i.test(query.slice(1))) return "bsky";
    return "x";
  }
  if (/\.bsky\.(social|app)$/i.test(query)) return "bsky";
  if (/^[a-z0-9_]{1,15}$/i.test(query)) return "x";
  return "unknown";
}
