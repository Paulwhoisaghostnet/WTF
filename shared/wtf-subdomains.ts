export type WtfSubdomainGrantStatus =
  | "reserved"
  | "pending"
  | "provisioned"
  | "revoked";

export type WtfSubdomainGrantDto = {
  id: number;
  userId: number;
  username: string | null;
  displayName: string | null;
  label: string;
  fullName: string;
  parentDomain: string;
  status: WtfSubdomainGrantStatus;
  walletAddress: string | null;
  sourceType: string;
  sourceId: number | null;
  grantedBy: number | null;
  notes: string | null;
  opHash: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  provisionedAt: Date | string | null;
  revokedAt: Date | string | null;
};

export type WtfDomainsNetwork = "mainnet" | "ghostnet" | "shadownet";

export type WtfDomainsRegistrarConfig = {
  enabled: boolean;
  network: WtfDomainsNetwork;
  parentDomain: string;
  registrarAddress: string | null;
  rpcUrl: string;
  tzktApi: string;
  domainsGraphql: string;
  tedAppUrl: string;
  tedCheckAddress: string;
  tedSetChildRecord: string;
  tedUpdateRecord: string;
  missingEnv: string[];
};

export type WtfDomainsRegistrarStatus = {
  config: WtfDomainsRegistrarConfig;
  storage: {
    minCommitAgeSec: number;
    maxCommitAgeSec: number;
    maxPerWallet: number;
    paused: boolean;
    whitelistEnabled: boolean;
    nameRegistry: string | null;
  } | null;
  error?: string;
};

export type WtfDomainsRegistrationPlan = {
  enabled: true;
  network: WtfDomainsNetwork;
  parentDomain: string;
  registrarAddress: string;
  label: string;
  fullName: string;
  targetAddress: string;
  labelHex: string;
  operations: Array<{
    phase: "commit" | "register";
    destination: string;
    entrypoint: string;
    value: unknown;
  }>;
  minCommitAgeSec: number;
};

export type WtfDomainsCommitPlan = WtfDomainsRegistrationPlan & {
  salt: string;
  hashFormula: string;
};

export type WtfDomainsWalletStatus = {
  address: string;
  reverseDomain: string | null;
  wtfDomains: string[];
  hackDomains: string[];
  registrar: {
    enabled: boolean;
    parentDomain: string;
    registrarAddress: string | null;
    pendingCommitHash: string | null;
    registrationCount: number;
    minCommitAgeSec: number;
    paused: boolean;
    canRegister: boolean;
  };
};

export type HackTezConfig = {
  registrationUrl: string;
  attribution: {
    creatorUsername: string;
    creatorProfilePath: string;
    productName: string;
    orgName: string;
  };
};

export type WtfDomainChatConfig = {
  enabled: boolean;
  parentDomains: string[];
  signingPrefix: string;
  apiBaseUrl: string | null;
};
