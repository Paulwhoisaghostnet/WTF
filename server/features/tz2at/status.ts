import {
  buildTz2atAtprotoScope,
  hasTz2atWalletLinkScope,
} from "@shared/atproto-permissions";
import { WTFOS_IDENTITY_DOMAIN, WTFOS_PDS_PUBLIC_URL } from "@shared/platform-branding";

type AccountLike = {
  id: number;
  did: string;
  handle: string;
  pdsUrl: string | null;
  oauthScopes: string | null;
};

type LinkLike = {
  id: number;
  chain: "tezos" | "etherlink";
  walletAddress: string;
  source: "tzbsky_import" | "wtf_signature";
  verificationStatus: "imported" | "verified" | "published" | "failed";
  importedUri: string | null;
  importedCid: string | null;
  tz2atRecordUri: string | null;
  tz2atRecordCid: string | null;
  importedAt: Date | string | null;
  verifiedAt: Date | string | null;
  publishedAt: Date | string | null;
};

type WalletLike = {
  id: number;
  walletAddress: string;
  isPrimary?: boolean;
  tezDomain?: string | null;
  network?: string | null;
  chainId?: number | null;
};

type WtfosIdentityLike = {
  id: number;
  canonicalDid: string;
  canonicalHandle: string | null;
  wtfDid: string | null;
  wtfHandle: string | null;
  wtfPdsUrl: string | null;
  status: "offered" | "requested" | "provisioning" | "active" | "failed";
  linkageRecordUri: string | null;
  linkageRecordCid: string | null;
  requestedAt: Date | string | null;
  provisionedAt: Date | string | null;
  lastCheckedAt: Date | string | null;
};

type WtfosPdsOfferingConfig = {
  pdsUrl: string;
  handleDomain: string;
  identityLinkCollection: string;
  gameLexiconPrefix: string;
  suggestedHandle: string | null;
  configured?: boolean;
  provisioningEnabled?: boolean;
  serviceHealth?: {
    ok: boolean | null;
    healthUrl: string | null;
    error?: string | null;
  };
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function buildTz2atStatusPayload(input: {
  account: AccountLike | null;
  links: LinkLike[];
  tezosWallets: WalletLike[];
  etherlinkWallets: WalletLike[];
  relay: { baseUrl: string; ok: boolean | null; network: string | null; error?: string | null };
  wtfosIdentity?: WtfosIdentityLike | null;
  pdsOffering?: WtfosPdsOfferingConfig;
}) {
  const pdsOffering = input.pdsOffering ?? {
    pdsUrl: WTFOS_PDS_PUBLIC_URL,
      handleDomain: WTFOS_IDENTITY_DOMAIN,
      identityLinkCollection: "app.wtfos.identity.link",
      gameLexiconPrefix: "app.wtfos",
      suggestedHandle: null,
      configured: false,
      provisioningEnabled: false,
    };
  return {
    enabled: true,
    relay: input.relay,
    firehose: {
      mode: "read-only-appview-consumer",
      baseUrl: input.relay.baseUrl,
      jsonFirehosePath: "/firehose",
      snapshotEndpoint: "/api/tz2at/firehose/events",
      cursorStorage: "wtfos-appview",
    },
    account: input.account
      ? {
          id: input.account.id,
          did: input.account.did,
          handle: input.account.handle,
          pdsUrl: input.account.pdsUrl,
          oauthScopes: input.account.oauthScopes,
          hasWalletLinkScope: hasTz2atWalletLinkScope(input.account.oauthScopes),
        }
      : null,
    permissions: {
      identityScope: buildTz2atAtprotoScope("identity"),
      walletLinkScope: buildTz2atAtprotoScope("wallet-link"),
    },
    pdsOffering: {
      enabled: true,
      configured: Boolean(pdsOffering.configured),
      provisioningEnabled: Boolean(pdsOffering.provisioningEnabled),
      pdsUrl: input.wtfosIdentity?.wtfPdsUrl ?? pdsOffering.pdsUrl,
      handleDomain: pdsOffering.handleDomain,
      suggestedHandle: input.wtfosIdentity?.wtfHandle ?? pdsOffering.suggestedHandle,
      identityLinkCollection: pdsOffering.identityLinkCollection,
      gameLexiconPrefix: pdsOffering.gameLexiconPrefix,
      serviceHealth: pdsOffering.serviceHealth ?? { ok: null, healthUrl: null },
      canonicalRepoPolicy: {
        role: "portable identity proofs only",
        allowedWriteCollections: ["xyz.tz2at.identity.walletLink"],
        readOnlyImportCollections: ["com.tzbsky.cryptoAddress"],
      },
      wtfRepoPolicy: {
        role: "WTFOS game, system, replay, telemetry, and app state",
        writePrefix: pdsOffering.gameLexiconPrefix,
      },
      identity: input.wtfosIdentity
        ? {
            id: input.wtfosIdentity.id,
            canonicalDid: input.wtfosIdentity.canonicalDid,
            canonicalHandle: input.wtfosIdentity.canonicalHandle,
            wtfDid: input.wtfosIdentity.wtfDid,
            wtfHandle: input.wtfosIdentity.wtfHandle,
            wtfPdsUrl: input.wtfosIdentity.wtfPdsUrl,
            status: input.wtfosIdentity.status,
            linkageRecordUri: input.wtfosIdentity.linkageRecordUri,
            linkageRecordCid: input.wtfosIdentity.linkageRecordCid,
            requestedAt: iso(input.wtfosIdentity.requestedAt),
            provisionedAt: iso(input.wtfosIdentity.provisionedAt),
            lastCheckedAt: iso(input.wtfosIdentity.lastCheckedAt),
          }
        : null,
    },
    links: input.links.map((link) => ({
      id: link.id,
      chain: link.chain,
      walletAddress: link.walletAddress,
      source: link.source,
      verificationStatus: link.verificationStatus,
      importedUri: link.importedUri,
      importedCid: link.importedCid,
      tz2atRecordUri: link.tz2atRecordUri,
      tz2atRecordCid: link.tz2atRecordCid,
      importedAt: iso(link.importedAt),
      verifiedAt: iso(link.verifiedAt),
      publishedAt: iso(link.publishedAt),
    })),
    wallets: {
      tezos: input.tezosWallets.map((wallet) => ({
        id: wallet.id,
        walletAddress: wallet.walletAddress,
        isPrimary: Boolean(wallet.isPrimary),
        tezDomain: wallet.tezDomain ?? null,
      })),
      etherlink: input.etherlinkWallets.map((wallet) => ({
        id: wallet.id,
        walletAddress: wallet.walletAddress,
        isPrimary: Boolean(wallet.isPrimary),
        network: wallet.network ?? null,
        chainId: wallet.chainId ?? null,
      })),
    },
  };
}
