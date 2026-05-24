export const COMMUNICATION_SOURCE_KINDS = [
  "mail",
  "dm",
  "board",
  "w",
  "telegram",
  "dicksword",
  "bluesky",
  "mastodon",
  "objkt",
  "tezos_domains",
  "hackchat",
  "system",
] as const;

export type CommunicationSourceKind =
  (typeof COMMUNICATION_SOURCE_KINDS)[number];

export const COMMUNICATION_ITEM_KINDS = [
  "email",
  "dm",
  "board_post",
  "external_post",
  "notification",
  "system",
] as const;

export type CommunicationItemKind = (typeof COMMUNICATION_ITEM_KINDS)[number];

export type CommunicationCard = {
  id: number;
  sourceKey: string;
  sourceLabel: string;
  sourceKind: CommunicationSourceKind;
  itemKind: CommunicationItemKind;
  title: string;
  summary: string | null;
  body: string | null;
  authorLabel: string | null;
  routePath: string | null;
  originUrl: string | null;
  occurredAt: string | Date;
  read: boolean;
  metadata: Record<string, unknown>;
};

export type CommunicationRouteTarget = {
  itemId: number;
  mode: "wtf_route" | "approved_external" | "blocked" | "missing";
  label: string;
  routePath: string | null;
  externalUrl: string | null;
  reason?: string;
};
