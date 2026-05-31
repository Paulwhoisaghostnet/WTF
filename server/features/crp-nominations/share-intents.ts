import { buildBskyIntentUrl } from "../../features/atproto/identity";
import type { CrpNomination } from "@shared/atproto";
import { nomineeDisplayLabel } from "./records";

const TWITTER_LIMIT = 280;
const BSKY_LIMIT = 300;

export type CrpSharePlatform = "x" | "bsky";

export type CrpShareIntentInput = {
  nomination: CrpNomination;
  bskyPostUrl?: string | null;
  platform: CrpSharePlatform;
};

export type CrpShareIntent = {
  platform: CrpSharePlatform;
  text: string;
  url: string;
  bskyPostUrl?: string;
  bskyPostUri?: string;
};

function truncateText(text: string, limit: number): string {
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  return `${chars.slice(0, Math.max(0, limit - 1)).join("")}…`;
}

function buildShareTemplate(nomination: CrpNomination): string {
  const nominee = nomination.nominee;
  const label = nomineeDisplayLabel(nominee);
  const xMention = nominee.xHandle ? `@${nominee.xHandle.replace(/^@/, "")}` : label;
  const lines = [
    `I nominate ${xMention} for the Tezos CRP ${nomination.categoryLabel}.`,
    nominee.tezosDomain ? `${label} · ${nominee.tezosDomain}` : null,
  ];
  const summary = nomination.justification?.summary?.trim();
  if (summary) lines.push(summary);
  lines.push("#TezosCRP");
  return lines.filter(Boolean).join("\n\n");
}

export function buildTwitterIntentUrl(text: string): string {
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", truncateText(text, TWITTER_LIMIT));
  return url.toString();
}

/**
 * Bluesky intent links only support the `text` query param (no embed param).
 * The canonical shareable record is an `app.bsky.feed.post` in the CRP repo;
 * we include its bsky.app URL so Bluesky can render the post card/oEmbed.
 */
export function buildCrpShareIntent(input: CrpShareIntentInput): CrpShareIntent {
  const template = buildShareTemplate(input.nomination);
  const bskyPostUrl = input.bskyPostUrl ?? input.nomination.shareRefs?.bskyPostUrl ?? null;
  const bskyPostUri = input.nomination.shareRefs?.bskyPostUri ?? null;

  if (input.platform === "x") {
    const text = truncateText(template, TWITTER_LIMIT);
    return {
      platform: "x",
      text,
      url: buildTwitterIntentUrl(text),
      bskyPostUrl: bskyPostUrl ?? undefined,
      bskyPostUri: bskyPostUri ?? undefined,
    };
  }

  const text = truncateText(
    bskyPostUrl ? `${template}\n\n${bskyPostUrl}` : template,
    BSKY_LIMIT
  );
  return {
    platform: "bsky",
    text,
    url: buildBskyIntentUrl(text),
    bskyPostUrl: bskyPostUrl ?? undefined,
    bskyPostUri: bskyPostUri ?? undefined,
  };
}

export function buildCrpShareIntents(
  nomination: CrpNomination,
  bskyPostUrl?: string | null
): Record<CrpSharePlatform, CrpShareIntent> {
  return {
    x: buildCrpShareIntent({ nomination, bskyPostUrl, platform: "x" }),
    bsky: buildCrpShareIntent({ nomination, bskyPostUrl, platform: "bsky" }),
  };
}
