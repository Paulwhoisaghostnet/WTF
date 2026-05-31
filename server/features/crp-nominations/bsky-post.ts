import type { CrpNomination } from "@shared/atproto";
import { CRP_BSKY_POST_COLLECTION } from "./crp-repo";
import { nomineeDisplayLabel } from "./records";

export const CRP_BSKY_POST_COLLECTION_ID = CRP_BSKY_POST_COLLECTION;

export function bskyPostRkey(nominationRkey: string): string {
  return nominationRkey.startsWith("crp-") ? nominationRkey.replace(/^crp-/, "post-") : `post-${nominationRkey}`;
}

export function buildCrpBskySharePost(input: {
  nomination: Omit<CrpNomination, "$type">;
  nominationUri: string;
  createdAt?: string;
}): Record<string, unknown> {
  const nominee = input.nomination.nominee;
  const label = nomineeDisplayLabel(nominee);
  const xMention = nominee.xHandle ? `@${nominee.xHandle.replace(/^@/, "")}` : label;
  const lines = [
    `I nominate ${xMention} for the Tezos CRP ${input.nomination.categoryLabel}.`,
    nominee.tezosDomain ? `${label} · ${nominee.tezosDomain}` : null,
    nominee.tezosAddress ? `Wallet: ${nominee.tezosAddress}` : null,
  ];
  const summary = input.nomination.justification?.summary?.trim();
  if (summary) lines.push(summary);
  const links = input.nomination.justification?.links?.filter(Boolean) ?? [];
  if (links.length > 0) lines.push(links.slice(0, 3).join("\n"));
  lines.push("#TezosCRP");
  lines.push(input.nominationUri);

  return {
    $type: CRP_BSKY_POST_COLLECTION,
    text: lines.filter(Boolean).join("\n\n").slice(0, 3000),
    createdAt: input.createdAt ?? input.nomination.createdAt,
    langs: ["en"],
  };
}
