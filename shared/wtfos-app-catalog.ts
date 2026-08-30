import {
  COBWEBSAINTS_FULL_USER_ROLE,
  DESKTOP_APPS,
  DESKTOP_APP_LABELS,
  canOpenAppsForRole,
  formatRoleLabel,
  formatWtf,
  normalizeUserRoles,
  type DesktopAppKey,
  type UserRole,
  type UserRoleInput,
} from "./types";
import {
  SKYWIRE_STAFF_ALPHA_ROLES,
  userEligibleForSkywireRollout,
  userEligibleForWtfLive,
  type SkywireRolloutConfig,
} from "./skywire-rollout";

export const WTFOS_APP_STORE_CATEGORY = "apps" as const;
export const WTFOS_APP_MARKET_SKU_PREFIX = "wtfos-app-" as const;

export type WtfOsAppPlacement = "default-desktop" | "stuffs-menu" | "app-store";
export type WtfOsAppNecessity = "core" | "standard" | "optional" | "specialist" | "role-gated";

export interface WtfOsAppCatalogEntry {
  key: DesktopAppKey;
  label: string;
  route: string;
  summary: string;
  placement: WtfOsAppPlacement;
  necessity: WtfOsAppNecessity;
  necessityRank: 1 | 2 | 3 | 4 | 5;
  priceWtfUnits: string;
  priceExp: number;
  monogram: string;
  accent: string;
  requiredRoles?: readonly UserRole[];
  requiredInventorySkus?: readonly string[];
  prerequisite?: string;
}

export interface WtfOsAppEligibility {
  canPurchase: boolean;
  reason: string | null;
}

const CREATOR_OPERATOR_ROLES = [
  "admin",
  "host",
  "cohost",
  "trusted_creator",
  COBWEBSAINTS_FULL_USER_ROLE,
] as const satisfies readonly UserRole[];

const PINNING_ROLES = [
  "admin",
  "host",
  "cohost",
  "trusted_creator",
  COBWEBSAINTS_FULL_USER_ROLE,
  "wtf_pin_collector",
] as const satisfies readonly UserRole[];

const APP_ENTRIES = [
  {
    key: "wtfiam",
    route: "/wtfiam",
    summary: "The controlled unlock surface for apps, items, upgrades, and WTF spending.",
    placement: "default-desktop",
    necessity: "core",
    necessityRank: 1,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "IAM",
    accent: "#18a8a2",
  },
  {
    key: "wim",
    route: "/wim",
    summary: "Direct messaging and buddy-list communication.",
    placement: "default-desktop",
    necessity: "core",
    necessityRank: 1,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "WIM",
    accent: "#2f6fdd",
  },
  {
    key: "w",
    route: "/w",
    summary: "The lightweight public WTF social feed.",
    placement: "default-desktop",
    necessity: "core",
    necessityRank: 1,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "W",
    accent: "#d85f3d",
  },
  {
    key: "mail",
    route: "/mail",
    summary: "Inbox, system notices, and durable comms.",
    placement: "default-desktop",
    necessity: "core",
    necessityRank: 1,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "IN",
    accent: "#0f766e",
  },
  {
    key: "admin-inbox",
    route: "/admin-inbox",
    summary: "A private, direct line between every user and the wtfOS administrators.",
    placement: "default-desktop",
    necessity: "core",
    necessityRank: 1,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "ADM",
    accent: "#166534",
  },
  {
    key: "gallery",
    route: "/my-gallery",
    summary: "Personal media and owned artwork gallery.",
    placement: "default-desktop",
    necessity: "core",
    necessityRank: 1,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "GAL",
    accent: "#7a5226",
  },
  {
    key: "tv",
    route: "/tv",
    summary: "Watch WTF TV channels and signal-room media.",
    placement: "app-store",
    necessity: "optional",
    necessityRank: 3,
    priceWtfUnits: "500000000",
    priceExp: 0,
    monogram: "TV",
    accent: "#2f6fdd",
  },
  {
    key: "dicksword",
    route: "/dicksword",
    summary: "Community chat with the sharper old-internet edge.",
    placement: "app-store",
    necessity: "optional",
    necessityRank: 3,
    priceWtfUnits: "500000000",
    priceExp: 0,
    monogram: "D",
    accent: "#7289da",
  },
  {
    key: "i-hate-telegram",
    route: "/i-hate-telegram",
    summary: "Telegram replacement experiments and social bridge tools.",
    placement: "app-store",
    necessity: "optional",
    necessityRank: 3,
    priceWtfUnits: "500000000",
    priceExp: 0,
    monogram: "TG",
    accent: "#77c9f7",
  },
  {
    key: "dear-diary",
    route: "/dear-diary",
    summary: "Private journaling and low-stakes personal notes.",
    placement: "app-store",
    necessity: "optional",
    necessityRank: 3,
    priceWtfUnits: "300000000",
    priceExp: 0,
    monogram: "DD",
    accent: "#8b5cf6",
  },
  {
    key: "arcade",
    route: "/arcade",
    summary: "Community arcade games, play tickets, and score loops.",
    placement: "default-desktop",
    necessity: "core",
    necessityRank: 1,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "PLY",
    accent: "#a12f4b",
  },
  {
    key: "console",
    route: "/console",
    summary: "Installed games and console-style play sessions.",
    placement: "app-store",
    necessity: "optional",
    necessityRank: 3,
    priceWtfUnits: "1000000000",
    priceExp: 0,
    monogram: "CMD",
    accent: "#7b8fff",
  },
  {
    key: "studio",
    route: "/studio",
    summary: "Project workspace for files, drafts, versions, and collaborators.",
    placement: "default-desktop",
    necessity: "core",
    necessityRank: 1,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "ART",
    accent: "#e0aa2f",
  },
  {
    key: "game-studio",
    route: "/game-studio",
    summary: "Game creation, testing, and publishing workspace.",
    placement: "default-desktop",
    necessity: "core",
    necessityRank: 1,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "SDK",
    accent: "#14b8a6",
  },
  {
    key: "dedrooms",
    route: "/dedrooms",
    summary: "Persistent room tools for gameshow and community spaces.",
    placement: "app-store",
    necessity: "specialist",
    necessityRank: 4,
    priceWtfUnits: "1500000000",
    priceExp: 0,
    monogram: "DR",
    accent: "#22c55e",
  },
  {
    key: "dues-manager",
    route: "/dues",
    summary: "Club dues tracking and membership payment support.",
    placement: "app-store",
    necessity: "specialist",
    necessityRank: 4,
    priceWtfUnits: "2000000000",
    priceExp: 0,
    monogram: "DUE",
    accent: "#7bbbd1",
  },
  {
    key: "tz2at",
    route: "/tz2at",
    summary: "Bridge Tezos wallet identity into AT Protocol flows.",
    placement: "app-store",
    necessity: "specialist",
    necessityRank: 4,
    priceWtfUnits: "2000000000",
    priceExp: 0,
    monogram: "TZ",
    accent: "#2563eb",
  },
  {
    key: "crp-nominations",
    route: "/crp-nominate",
    summary: "Nominate and inspect community reward program entries.",
    placement: "app-store",
    necessity: "specialist",
    necessityRank: 4,
    priceWtfUnits: "1500000000",
    priceExp: 0,
    monogram: "CRP",
    accent: "#ef4444",
  },
  {
    key: "wtf-subdomains",
    route: "/wtf-subdomains",
    summary: "Claim wtfOS handles and WTF Tezos subdomains.",
    placement: "app-store",
    necessity: "specialist",
    necessityRank: 4,
    priceWtfUnits: "2000000000",
    priceExp: 0,
    monogram: "DNS",
    accent: "#16a34a",
  },
  {
    key: "rat-race",
    route: "/rat-race",
    summary: "Rat Race competition surface and chain-adjacent game loops.",
    placement: "app-store",
    necessity: "optional",
    necessityRank: 3,
    priceWtfUnits: "1000000000",
    priceExp: 0,
    monogram: "RR",
    accent: "#92400e",
  },
  {
    key: "map-lab",
    route: "/map-lab",
    summary: "Map and route-lab utilities for WTF worldbuilding.",
    placement: "app-store",
    necessity: "specialist",
    necessityRank: 4,
    priceWtfUnits: "1500000000",
    priceExp: 0,
    monogram: "MAP",
    accent: "#0891b2",
  },
  {
    key: "agent",
    route: "/agent",
    summary: "Agent workspace for assisted tasks and local tool runs.",
    placement: "app-store",
    necessity: "specialist",
    necessityRank: 4,
    priceWtfUnits: "2500000000",
    priceExp: 0,
    monogram: "AI",
    accent: "#6366f1",
  },
  {
    key: "applications",
    route: "/applications",
    summary: "Remote application launcher and hosted app sessions.",
    placement: "app-store",
    necessity: "specialist",
    necessityRank: 4,
    priceWtfUnits: "2500000000",
    priceExp: 0,
    monogram: "APP",
    accent: "#0ea5e9",
  },
  {
    key: "casino",
    route: "/casino",
    summary: "Membership-gated practice games and a community casino sandbox.",
    placement: "app-store",
    necessity: "role-gated",
    necessityRank: 5,
    priceWtfUnits: "2500000000",
    priceExp: 0,
    monogram: "BET",
    accent: "#d5a237",
    requiredInventorySkus: ["casino-app-pass"],
    prerequisite: "Requires a Casino app pass or active Casino membership card.",
  },
  {
    key: "ipfs-pinning",
    route: "/ipfs-pinning",
    summary: "Hosted IPFS pinning, artifact preservation, and portable manifests.",
    placement: "app-store",
    necessity: "role-gated",
    necessityRank: 5,
    priceWtfUnits: "2500000000",
    priceExp: 0,
    monogram: "PIN",
    accent: "#1f7a5b",
    requiredRoles: PINNING_ROLES,
    requiredInventorySkus: ["wtf-pin-collector-pass"],
    prerequisite: "Requires Trusted Creator, WTF Pin Collector, or the WTF Pin Collector Pass.",
  },
  {
    key: "skywire",
    route: "/skywire",
    summary: "Bluesky client and AT Protocol social surface during staged rollout.",
    placement: "app-store",
    necessity: "role-gated",
    necessityRank: 5,
    priceWtfUnits: "2500000000",
    priceExp: 0,
    monogram: "AT",
    accent: "#38bdf8",
    requiredRoles: SKYWIRE_STAFF_ALPHA_ROLES,
    prerequisite: "Requires Skywire staff-alpha access or an all-users rollout.",
  },
  {
    key: "wtf-live",
    route: "/live",
    summary: "Live rooms with voice, video, screen sharing, stages, and tips.",
    placement: "app-store",
    necessity: "role-gated",
    necessityRank: 5,
    priceWtfUnits: "2500000000",
    priceExp: 0,
    monogram: "LIVE",
    accent: "#c8324f",
    requiredRoles: SKYWIRE_STAFF_ALPHA_ROLES,
    prerequisite: "Requires WTF LIVE rollout access.",
  },
  {
    key: "ch-ease",
    route: "/tools/ch-ease",
    summary: "CH-EASE packaging and creator/operator cheese tools.",
    placement: "app-store",
    necessity: "role-gated",
    necessityRank: 5,
    priceWtfUnits: "2500000000",
    priceExp: 0,
    monogram: "CHZ",
    accent: "#f59e0b",
    requiredRoles: CREATOR_OPERATOR_ROLES,
    prerequisite: "Requires Trusted Creator or a gameshow operator role.",
  },
  {
    key: "pasta-protocol",
    route: "/tools/colander",
    summary: "Pasta Protocol creation tools, collection prep, and mint helpers.",
    placement: "app-store",
    necessity: "specialist",
    necessityRank: 4,
    priceWtfUnits: "2000000000",
    priceExp: 0,
    monogram: "PST",
    accent: "#f97316",
  },
  {
    key: "objkt-operator",
    route: "/objkt-operator",
    summary: "Private Objkt acquisition workspace for approved creator reviews, score breakdowns, and resale-aware purchase queues.",
    placement: "stuffs-menu",
    necessity: "role-gated",
    necessityRank: 5,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "OBJ",
    accent: "#b8862f",
    requiredRoles: ["admin"],
    prerequisite: "Requires the admin role and the configured Objkt Operator owner allowlist.",
  },
  {
    key: "payroll",
    route: "/payroll",
    summary: "Strict-admin funding wallet for reviewed WTF and XTZ transfers to wtfOS wallets and contracts.",
    placement: "stuffs-menu",
    necessity: "role-gated",
    necessityRank: 5,
    priceWtfUnits: "0",
    priceExp: 0,
    monogram: "PAY",
    accent: "#0b6b45",
    requiredRoles: ["admin"],
    prerequisite: "Requires the admin role and an explicit, Payroll-scoped Tezos mainnet wallet connection.",
  },
] as const satisfies readonly Omit<WtfOsAppCatalogEntry, "label">[];

export const WTFOS_APP_CATALOG = Object.freeze(
  Object.fromEntries(
    APP_ENTRIES.map((entry) => [
      entry.key,
      {
        ...entry,
        label: DESKTOP_APP_LABELS[entry.key],
      },
    ])
  )
) as Readonly<Record<DesktopAppKey, WtfOsAppCatalogEntry>>;

export const WTFOS_APP_CATALOG_ENTRIES = Object.freeze(
  [...DESKTOP_APPS]
    .map((key) => WTFOS_APP_CATALOG[key])
    .sort(compareWtfOsAppEntries)
);

export function compareWtfOsAppEntries(
  a: WtfOsAppCatalogEntry,
  b: WtfOsAppCatalogEntry
): number {
  return (
    a.necessityRank - b.necessityRank ||
    placementRank(a.placement) - placementRank(b.placement) ||
    a.label.localeCompare(b.label)
  );
}

export function isDefaultDesktopAppKey(appKey: DesktopAppKey): boolean {
  return WTFOS_APP_CATALOG[appKey]?.placement === "default-desktop";
}

export function isStuffsMenuAppKey(appKey: DesktopAppKey): boolean {
  const placement = WTFOS_APP_CATALOG[appKey]?.placement;
  return placement === "default-desktop" || placement === "stuffs-menu";
}

export function isAppStoreAppKey(appKey: DesktopAppKey): boolean {
  return WTFOS_APP_CATALOG[appKey]?.placement === "app-store";
}

export function wtfosAppMarketSku(appKey: DesktopAppKey): string {
  return `${WTFOS_APP_MARKET_SKU_PREFIX}${appKey}`;
}

export function desktopAppKeyFromWtfosMarketSku(sku: string): DesktopAppKey | null {
  if (!sku.startsWith(WTFOS_APP_MARKET_SKU_PREFIX)) return null;
  const candidate = sku.slice(WTFOS_APP_MARKET_SKU_PREFIX.length);
  return (DESKTOP_APPS as readonly string[]).includes(candidate)
    ? (candidate as DesktopAppKey)
    : null;
}

export function isWtfOsAppMarketSku(sku: string): boolean {
  return desktopAppKeyFromWtfosMarketSku(sku) !== null;
}

export function formatWtfOsAppPrice(rawUnits: string): string {
  return formatWtf(rawUnits);
}

export function evaluateWtfOsAppPurchaseEligibility(
  entry: WtfOsAppCatalogEntry,
  role: UserRoleInput,
  ownedSkus: ReadonlySet<string> | readonly string[] = [],
  options: { rolloutConfig?: SkywireRolloutConfig } = {}
): WtfOsAppEligibility {
  const owned = ownedSkus instanceof Set ? ownedSkus : new Set(ownedSkus);
  const appSku = wtfosAppMarketSku(entry.key);
  if (entry.placement !== "app-store") {
    return {
      canPurchase: false,
      reason: "This core app is already available on the default desktop or Start menu.",
    };
  }
  if (owned.has(appSku)) {
    return {
      canPurchase: false,
      reason: "Already unlocked. Use the Start menu to open it or pin it to your desktop.",
    };
  }
  if (!canOpenAppsForRole(role)) {
    return {
      canPurchase: false,
      reason: "This account cannot unlock apps while it is in time out.",
    };
  }

  const roles = normalizeUserRoles(role);
  const hasRoleGate = Boolean(entry.requiredRoles?.length);
  const hasInventoryGate = Boolean(entry.requiredInventorySkus?.length);
  const hasRequiredRole =
    hasRoleGate && entry.requiredRoles!.some((candidate) => roles.includes(candidate));
  const hasRequiredInventory =
    hasInventoryGate && entry.requiredInventorySkus!.some((sku) => owned.has(sku));

  if (entry.key === "skywire") {
    const eligible = options.rolloutConfig
      ? userEligibleForSkywireRollout(roles, options.rolloutConfig)
      : hasRequiredRole;
    if (!eligible) {
      return {
        canPurchase: false,
        reason: entry.prerequisite ?? roleGateReason(entry.requiredRoles),
      };
    }
  }

  if (entry.key === "wtf-live") {
    const eligible = options.rolloutConfig
      ? userEligibleForWtfLive(roles, options.rolloutConfig)
      : hasRequiredRole;
    if (!eligible) {
      return {
        canPurchase: false,
        reason: entry.prerequisite ?? roleGateReason(entry.requiredRoles),
      };
    }
  }

  if ((hasRoleGate || hasInventoryGate) && !hasRequiredRole && !hasRequiredInventory) {
    return {
      canPurchase: false,
      reason:
        entry.prerequisite ??
        (hasRoleGate
          ? roleGateReason(entry.requiredRoles)
          : "Requires another app pass before this can be unlocked."),
    };
  }
  if (BigInt(entry.priceWtfUnits) <= 0n) {
    return {
      canPurchase: false,
      reason: "This app does not require a market unlock.",
    };
  }
  return { canPurchase: true, reason: null };
}

export function roleGateReason(roles: readonly UserRole[] | undefined): string {
  if (!roles?.length) return "Requires an eligible role.";
  return `Requires ${formatRoleList(roles)}.`;
}

export function formatRoleList(roles: readonly UserRole[]): string {
  const labels = roles.map(formatRoleLabel);
  if (labels.length <= 1) return labels[0] ?? "an eligible role";
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

function placementRank(placement: WtfOsAppPlacement): number {
  if (placement === "default-desktop") return 0;
  if (placement === "stuffs-menu") return 1;
  return 2;
}
