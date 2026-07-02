import type { CommunicationSourceKind } from "@shared/comms";

export type CommsSourceDefinition = {
  key: string;
  label: string;
  sourceKind: CommunicationSourceKind;
  adapterKey: string;
  readOnly: boolean;
  routeBase: string | null;
  enabled: boolean;
  metadata?: Record<string, unknown>;
};

export const COMMS_SOURCE_DEFINITIONS: CommsSourceDefinition[] = [
  {
    key: "mail",
    label: "Inbox Mail",
    sourceKind: "mail",
    adapterKey: "resend",
    readOnly: false,
    routeBase: "/mail",
    enabled: true,
  },
  {
    key: "dm",
    label: "WTF DMs",
    sourceKind: "dm",
    adapterKey: "wtf-dm",
    readOnly: false,
    routeBase: "/messages",
    enabled: true,
  },
  {
    key: "board",
    label: "Message Board",
    sourceKind: "board",
    adapterKey: "wtf-board",
    readOnly: false,
    routeBase: "/messageboard",
    enabled: true,
  },
  {
    key: "system",
    label: "wtfOS System",
    sourceKind: "system",
    adapterKey: "wtfos-system",
    readOnly: false,
    routeBase: "/notifications",
    enabled: true,
  },
  {
    key: "w",
    label: "W",
    sourceKind: "w",
    adapterKey: "w-x",
    readOnly: false,
    routeBase: "/w",
    enabled: true,
    metadata: { budgetScoped: true },
  },
  {
    key: "telegram",
    label: "I Hate Telegram",
    sourceKind: "telegram",
    adapterKey: "telegram-digest",
    readOnly: true,
    routeBase: "/i-hate-telegram",
    enabled: true,
  },
  {
    key: "dicksword",
    label: "Dicksword",
    sourceKind: "dicksword",
    adapterKey: "discord-dicksword",
    readOnly: true,
    routeBase: "/dicksword",
    enabled: true,
  },
  {
    key: "bluesky",
    label: "Bluesky",
    sourceKind: "bluesky",
    adapterKey: "bluesky-readonly",
    readOnly: true,
    routeBase: "/digest",
    enabled: true,
  },
  {
    key: "mastodon",
    label: "Mastodon / Tusk",
    sourceKind: "mastodon",
    adapterKey: "mastodon-readonly",
    readOnly: true,
    routeBase: "/digest",
    enabled: true,
  },
  {
    key: "objkt",
    label: "objkt",
    sourceKind: "objkt",
    adapterKey: "objkt-readonly",
    readOnly: true,
    routeBase: "/digest",
    enabled: true,
  },
  {
    key: "tezos_domains",
    label: "Tezos Domains",
    sourceKind: "tezos_domains",
    adapterKey: "tezos-domains-readonly",
    readOnly: true,
    routeBase: "/wtf-subdomains",
    enabled: true,
  },
  {
    key: "hackchat",
    label: "Hackchat",
    sourceKind: "hackchat",
    adapterKey: "hackchat-readonly",
    readOnly: true,
    routeBase: "/digest",
    enabled: true,
  },
];

export function sourceDefinitionByKey(key: string): CommsSourceDefinition | null {
  const normalized = String(key || "").trim().toLowerCase();
  return COMMS_SOURCE_DEFINITIONS.find((source) => source.key === normalized) ?? null;
}

export function listCommsSourceDefinitions(): CommsSourceDefinition[] {
  return COMMS_SOURCE_DEFINITIONS.map((source) => ({ ...source }));
}
