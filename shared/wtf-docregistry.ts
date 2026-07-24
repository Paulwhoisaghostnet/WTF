import { DESKTOP_APPS, type DesktopAppKey } from "./types";

export const WTF_DOC_REGISTRY_VERSION = "1" as const;
export const WTF_DOC_REGISTRY_GRACE_HOURS = 24;

export type WtfDocLinkSet = {
  masterRegister: string;
  domainGuide: string;
  registry: string;
  commandPalette: string;
  mcpRegistry: string;
  eventRegistry: string;
  installPolicy: string;
  operatingProcedures: string;
};

export type WtfDomainDocRegistry = {
  label: string;
  guide: string;
  registry: string;
  commandPalette: string;
  mcpRegistry: string;
  eventRegistry: string;
  installPolicy: string;
  operatingProcedures: string;
  installKeyPolicy: string;
};

export const WTF_DOC_MASTER_REGISTER = "docs/domains/master-register.md";

export const WTF_DOMAIN_DOC_REGISTRY = {
  wtfOs: {
    label: "WTF OS",
    guide: "docs/domains/wtf-os.md",
    registry: "docs/domains/wtf-os-registry.md",
    commandPalette: "docs/domains/wtf-os-registry.md",
    mcpRegistry: "docs/domains/wtf-os-registry.md",
    eventRegistry: "docs/domains/wtf-os-registry.md",
    installPolicy: "docs/domains/wtf-os-registry.md",
    operatingProcedures: "docs/domains/wtf-os-registry.md",
    installKeyPolicy: "docs/domains/wtf-os-registry.md",
  },
  identityAndSocial: {
    label: "Identity And Social",
    guide: "docs/domains/identity-and-social.md",
    registry: "docs/domains/identity-and-social-registry.md",
    commandPalette: "docs/domains/identity-and-social-registry.md",
    mcpRegistry: "docs/domains/identity-and-social-registry.md",
    eventRegistry: "docs/domains/identity-and-social-registry.md",
    installPolicy: "docs/domains/identity-and-social-registry.md",
    operatingProcedures: "docs/domains/identity-and-social-registry.md",
    installKeyPolicy: "docs/domains/identity-and-social-registry.md",
  },
  arcadeConsoleGameStudio: {
    label: "Arcade, Console, And Game Studio",
    guide: "docs/domains/arcade-console-game-studio.md",
    registry: "docs/domains/arcade-console-game-studio-registry.md",
    commandPalette: "docs/domains/arcade-console-game-studio-registry.md",
    mcpRegistry: "docs/domains/arcade-console-game-studio-registry.md",
    eventRegistry: "docs/domains/arcade-console-game-studio-registry.md",
    installPolicy: "docs/domains/arcade-console-game-studio-registry.md",
    operatingProcedures: "docs/domains/arcade-console-game-studio-registry.md",
    installKeyPolicy: "docs/domains/arcade-console-game-studio-registry.md",
  },
  commerceAndWallets: {
    label: "Commerce And Wallets",
    guide: "docs/domains/commerce-and-wallets.md",
    registry: "docs/domains/commerce-and-wallets-registry.md",
    commandPalette: "docs/domains/commerce-and-wallets-registry.md",
    mcpRegistry: "docs/domains/commerce-and-wallets-registry.md",
    eventRegistry: "docs/domains/commerce-and-wallets-registry.md",
    installPolicy: "docs/domains/commerce-and-wallets-registry.md",
    operatingProcedures: "docs/domains/commerce-and-wallets-registry.md",
    installKeyPolicy: "docs/domains/commerce-and-wallets-registry.md",
  },
  mediaTvStudio: {
    label: "Media, TV, And Studio",
    guide: "docs/domains/media-tv-studio.md",
    registry: "docs/domains/media-tv-studio-registry.md",
    commandPalette: "docs/domains/media-tv-studio-registry.md",
    mcpRegistry: "docs/domains/media-tv-studio-registry.md",
    eventRegistry: "docs/domains/media-tv-studio-registry.md",
    installPolicy: "docs/domains/media-tv-studio-registry.md",
    operatingProcedures: "docs/domains/media-tv-studio-registry.md",
    installKeyPolicy: "docs/domains/media-tv-studio-registry.md",
  },
  pastaProtocol: {
    label: "Pasta Protocol",
    guide: "docs/domains/pasta-protocol.md",
    registry: "docs/domains/pasta-protocol-registry.md",
    commandPalette: "docs/domains/pasta-protocol-registry.md",
    mcpRegistry: "docs/domains/pasta-protocol-registry.md",
    eventRegistry: "docs/domains/pasta-protocol-registry.md",
    installPolicy: "docs/domains/pasta-protocol-registry.md",
    operatingProcedures: "docs/domains/pasta-protocol-registry.md",
    installKeyPolicy: "docs/domains/pasta-protocol-registry.md",
  },
  tezosPlatform: {
    label: "Tezos Platform",
    guide: "docs/domains/tezos-platform.md",
    registry: "docs/domains/tezos-platform-registry.md",
    commandPalette: "docs/domains/tezos-platform-registry.md",
    mcpRegistry: "docs/domains/tezos-platform-registry.md",
    eventRegistry: "docs/domains/tezos-platform-registry.md",
    installPolicy: "docs/domains/tezos-platform-registry.md",
    operatingProcedures: "docs/domains/tezos-platform-registry.md",
    installKeyPolicy: "docs/domains/tezos-platform-registry.md",
  },
  operations: {
    label: "Operations",
    guide: "docs/domains/operations.md",
    registry: "docs/domains/operations-registry.md",
    commandPalette: "docs/domains/operations-registry.md",
    mcpRegistry: "docs/domains/operations-registry.md",
    eventRegistry: "docs/domains/operations-registry.md",
    installPolicy: "docs/domains/operations-registry.md",
    operatingProcedures: "docs/domains/operations-registry.md",
    installKeyPolicy: "docs/domains/operations-registry.md",
  },
} as const satisfies Record<string, WtfDomainDocRegistry>;

const DESKTOP_APP_DOMAIN_KEYS: Partial<Record<DesktopAppKey, keyof typeof WTF_DOMAIN_DOC_REGISTRY>> = {
  wtfiam: "commerceAndWallets",
  hoard: "tezosPlatform",
  wim: "identityAndSocial",
  w: "identityAndSocial",
  tv: "mediaTvStudio",
  dicksword: "identityAndSocial",
  "i-hate-telegram": "identityAndSocial",
  "dear-diary": "identityAndSocial",
  arcade: "arcadeConsoleGameStudio",
  casino: "commerceAndWallets",
  "dues-manager": "commerceAndWallets",
  console: "arcadeConsoleGameStudio",
  "game-studio": "arcadeConsoleGameStudio",
  dedrooms: "wtfOs",
  studio: "mediaTvStudio",
  gallery: "mediaTvStudio",
  "pasta-protocol": "pastaProtocol",
  skywire: "identityAndSocial",
  tz2at: "identityAndSocial",
  "crp-nominations": "identityAndSocial",
  "wtf-subdomains": "tezosPlatform",
  "rat-race": "commerceAndWallets",
  "map-lab": "wtfOs",
  agent: "wtfOs",
  applications: "arcadeConsoleGameStudio",
  mail: "identityAndSocial",
  "objkt-operator": "operations",
  payroll: "operations",
};

export function getDesktopAppDocRegistry(appKey: DesktopAppKey): WtfDomainDocRegistry {
  const domainKey = DESKTOP_APP_DOMAIN_KEYS[appKey] ?? "wtfOs";
  return WTF_DOMAIN_DOC_REGISTRY[domainKey];
}

export function getDesktopAppDocLinks(appKey: DesktopAppKey): WtfDocLinkSet {
  const registry = getDesktopAppDocRegistry(appKey);
  return {
    masterRegister: WTF_DOC_MASTER_REGISTER,
    domainGuide: registry.guide,
    registry: registry.registry,
    commandPalette: registry.commandPalette,
    mcpRegistry: registry.mcpRegistry,
    eventRegistry: registry.eventRegistry,
    installPolicy: registry.installPolicy,
    operatingProcedures: registry.operatingProcedures,
  };
}

export function getDesktopAppInstallPolicy(appKey: DesktopAppKey): string {
  return getDesktopAppDocRegistry(appKey).installKeyPolicy;
}

export function getDocRegistryByLabel(label: string): WtfDomainDocRegistry {
  const registry = Object.values(WTF_DOMAIN_DOC_REGISTRY).find(
    (entry) => entry.label === label
  );
  return registry ?? WTF_DOMAIN_DOC_REGISTRY.wtfOs;
}

export function getDocLinksForLabel(label: string): WtfDocLinkSet {
  const registry = getDocRegistryByLabel(label);
  return {
    masterRegister: WTF_DOC_MASTER_REGISTER,
    domainGuide: registry.guide,
    registry: registry.registry,
    commandPalette: registry.commandPalette,
    mcpRegistry: registry.mcpRegistry,
    eventRegistry: registry.eventRegistry,
    installPolicy: registry.installPolicy,
    operatingProcedures: registry.operatingProcedures,
  };
}

export function listDocRegistryApps(): DesktopAppKey[] {
  return [...DESKTOP_APPS];
}
