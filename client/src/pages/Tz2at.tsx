import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { Button, GroupBox, Hourglass, TextField } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { api, fetchWithCsrf } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";

type Tz2atChain = "tezos" | "etherlink";

interface Tz2atStatus {
  enabled: boolean;
  relay: { baseUrl: string; ok: boolean | null; network: string | null; error?: string | null };
  firehose: {
    mode: string;
    baseUrl: string;
    jsonFirehosePath: string;
    snapshotEndpoint: string;
    cursorStorage: string;
  };
  account: null | {
    id: number;
    did: string;
    handle: string;
    pdsUrl: string | null;
    oauthScopes: string | null;
    hasWalletLinkScope: boolean;
  };
  permissions: { identityScope: string; walletLinkScope: string };
  pdsOffering: {
    enabled: boolean;
    configured: boolean;
    provisioningEnabled: boolean;
    pdsUrl: string;
    handleDomain: string;
    suggestedHandle: string | null;
    identityLinkCollection: string;
    gameLexiconPrefix: string;
    serviceHealth: { ok: boolean | null; healthUrl: string | null; error?: string | null };
    canonicalRepoPolicy: { role: string; allowedWriteCollections: string[]; readOnlyImportCollections: string[] };
    wtfRepoPolicy: { role: string; writePrefix: string };
    identity: null | {
      id: number;
      canonicalDid: string;
      canonicalHandle: string | null;
      wtfDid: string | null;
      wtfHandle: string | null;
      wtfPdsUrl: string | null;
      status: "offered" | "requested" | "provisioning" | "active" | "failed";
      linkageRecordUri: string | null;
      requestedAt: string | null;
      provisionedAt: string | null;
    };
  };
  links: Array<{
    id: number;
    chain: Tz2atChain;
    walletAddress: string;
    source: "tzbsky_import" | "wtf_signature";
    verificationStatus: "imported" | "verified" | "published" | "failed";
    importedUri: string | null;
    tz2atRecordUri: string | null;
    publishedAt: string | null;
  }>;
  wallets: {
    tezos: Array<{ id: number; walletAddress: string; isPrimary: boolean; tezDomain: string | null }>;
    etherlink: Array<{ id: number; walletAddress: string; isPrimary: boolean; network: string | null; chainId: number | null }>;
  };
}

interface ActivityResponse {
  mode?: string;
  cursor?: string | null;
  items: Array<Record<string, unknown>>;
}

const Shell = styled.div`
  min-height: 100%;
  padding: 12px;
  background: #c0c0c0;
  display: grid;
  gap: 10px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 330px);
  gap: 10px;

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Step = styled.div<{ $active?: boolean }>`
  border: 1px solid ${(p) => (p.$active ? "#000080" : "#808080")};
  background: ${(p) => (p.$active ? "#fffff0" : "#f4f4f4")};
  padding: 8px;
  display: grid;
  gap: 6px;
`;

const Label = styled.div`
  font-weight: 700;
`;

const Help = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.35;
`;

const Mono = styled.code`
  font-family: "MS Sans Serif", monospace;
  font-size: 11px;
  overflow-wrap: anywhere;
`;

const List = styled.div`
  display: grid;
  gap: 6px;
`;

const Item = styled.div`
  border: 1px solid #808080;
  background: #ffffff;
  padding: 7px;
  display: grid;
  gap: 5px;
`;

function openOauth(handle: string, step: "identity" | "wallet-link") {
  const params = new URLSearchParams({
    app: "tz2at",
    step,
    returnTo: "/tz2at",
    popup: "1",
    handle: handle.trim(),
  });
  window.open(`/api/atproto/oauth/start?${params.toString()}`, "tz2at_atproto", "width=520,height=720");
}

function walletKey(chain: Tz2atChain, walletAddress: string) {
  return `${chain}:${walletAddress.toLowerCase()}`;
}

export function Tz2at() {
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState("");
  const [selectedWallet, setSelectedWallet] = useState<{ chain: Tz2atChain; walletAddress: string } | null>(null);
  const statusQuery = useQuery({
    queryKey: ["tz2at", "status"],
    queryFn: () => api.get<Tz2atStatus>("/api/tz2at/status"),
  });
  const status = statusQuery.data;
  const effectiveHandle = handle || status?.account?.handle || "";

  useEffect(() => {
    logClientSystemEvent({
      eventType: "tz2at.identity.viewed",
      message: "tz2at identity proof app opened",
    });
  }, []);

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key?.startsWith("tz2at:atproto-")) {
        void queryClient.invalidateQueries({ queryKey: ["tz2at"] });
      }
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [queryClient]);

  useEffect(() => {
    if (!selectedWallet && status?.links[0]) {
      setSelectedWallet({ chain: status.links[0].chain, walletAddress: status.links[0].walletAddress });
    }
  }, [selectedWallet, status?.links]);

  const localWallets = useMemo(() => {
    const tezos = status?.wallets.tezos.map((wallet) => ({
      chain: "tezos" as const,
      walletAddress: wallet.walletAddress,
      label: wallet.tezDomain || wallet.walletAddress,
      primary: wallet.isPrimary,
    })) ?? [];
    const etherlink = status?.wallets.etherlink.map((wallet) => ({
      chain: "etherlink" as const,
      walletAddress: wallet.walletAddress,
      label: wallet.walletAddress,
      primary: wallet.isPrimary,
    })) ?? [];
    return [...tezos, ...etherlink];
  }, [status]);

  const publishedKeys = useMemo(
    () => new Set(status?.links.filter((link) => link.verificationStatus === "published").map((link) => walletKey(link.chain, link.walletAddress)) ?? []),
    [status]
  );

  const importMutation = useMutation({
    mutationFn: () => api.post("/api/tz2at/import/tzbsky", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tz2at"] }),
  });

  const publishMutation = useMutation({
    mutationFn: (wallet: { chain: Tz2atChain; walletAddress: string }) =>
      api.post("/api/tz2at/publish/wallet-link", wallet),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tz2at"] }),
  });

  const pdsRequestMutation = useMutation({
    mutationFn: () => api.post("/api/tz2at/pds-offering/request", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tz2at"] }),
  });

  function previewWallet(wallet: { chain: Tz2atChain; walletAddress: string }) {
    setSelectedWallet(wallet);
    void logClientSystemEvent({
      eventType: "tz2at.firehose.previewed",
      message: "tz2at firehose wallet preview selected",
      metadata: wallet,
    });
  }

  const activityQuery = useQuery({
    queryKey: ["tz2at", "firehose", selectedWallet?.chain, selectedWallet?.walletAddress],
    enabled: Boolean(selectedWallet),
    queryFn: async () => {
      if (!selectedWallet) return { items: [] };
      const params = new URLSearchParams({
        chain: selectedWallet.chain,
        walletAddress: selectedWallet.walletAddress,
        limit: "8",
      });
      const response = await fetchWithCsrf(`/api/tz2at/firehose/events?${params.toString()}`);
      if (!response.ok) return { items: [] };
      return response.json() as Promise<ActivityResponse>;
    },
  });

  return (
    <AppWindow title="tz2at">
      <Shell>
        {statusQuery.isLoading ? (
          <Hourglass size={32} />
        ) : (
          <Grid>
            <Stack>
              <GroupBox label="Identity Proof">
                <Stack>
                  <Step $active={!status?.account}>
                    <Label>1. Connect DID</Label>
                    <Help>tz2at first asks only for the base AT Protocol identity scope so WTF can know which DID is yours.</Help>
                    {status?.account ? (
                      <Mono>{status.account.did}</Mono>
                    ) : (
                      <Row>
                        <TextField value={effectiveHandle} onChange={(event) => setHandle(event.currentTarget.value)} placeholder="handle.bsky.social" />
                        <Button onClick={() => openOauth(effectiveHandle, "identity")} disabled={!effectiveHandle.trim()}>
                          Connect DID
                        </Button>
                      </Row>
                    )}
                  </Step>

                  <Step $active={Boolean(status?.account) && (status?.links.length ?? 0) === 0}>
                    <Label>2. Import tzbsky</Label>
                    <Help>Import reads your public `com.tzbsky.cryptoAddress/self` record from your PDS. It does not request repo write access.</Help>
                    <Button onClick={() => importMutation.mutate()} disabled={!status?.account || importMutation.isPending}>
                      {importMutation.isPending ? "Importing..." : "Import public tzbsky proof"}
                    </Button>
                    {importMutation.error ? <Help>{importMutation.error.message}</Help> : null}
                  </Step>

                  <Step $active={Boolean(status?.account) && localWallets.length > 0}>
                    <Label>3. Verify local wallet</Label>
                    <Help>tz2at uses wallets already linked through WTF signature routes. Add missing Tezos or Etherlink wallets in Profile, then refresh this app.</Help>
                    <List>
                      {localWallets.length === 0 ? (
                        <Item>No verified WTF wallets found yet.</Item>
                      ) : (
                        localWallets.map((wallet) => (
                          <Item key={walletKey(wallet.chain, wallet.walletAddress)}>
                            <Row>
                              <strong>{wallet.chain}</strong>
                              {wallet.primary ? <span>primary</span> : null}
                            </Row>
                            <Mono>{wallet.label}</Mono>
                            <Row>
                              <Button onClick={() => previewWallet(wallet)}>Preview firehose</Button>
                              <Button
                                onClick={() => publishMutation.mutate(wallet)}
                                disabled={!status?.account?.hasWalletLinkScope || publishedKeys.has(walletKey(wallet.chain, wallet.walletAddress)) || publishMutation.isPending}
                              >
                                {publishedKeys.has(walletKey(wallet.chain, wallet.walletAddress)) ? "Published" : "Publish tz2at proof"}
                              </Button>
                            </Row>
                          </Item>
                        ))
                      )}
                    </List>
                  </Step>

                  <Step $active={Boolean(status?.account && !status.account.hasWalletLinkScope)}>
                    <Label>4. Approve wallet-link write</Label>
                    <Help>Publishing asks for exactly `repo:xyz.tz2at.identity.walletLink`, only when you choose to write a new tz2at proof.</Help>
                    <Button onClick={() => openOauth(effectiveHandle, "wallet-link")} disabled={!status?.account}>
                      Approve tz2at wallet-link scope
                    </Button>
                    {publishMutation.error ? <Help>{publishMutation.error.message}</Help> : null}
                  </Step>
                </Stack>
              </GroupBox>
            </Stack>

            <Stack>
              <GroupBox label="Linked Proofs">
                <List>
                  {status?.links.length ? (
                    status.links.map((link) => (
                      <Item key={link.id}>
                        <Row>
                          <strong>{link.chain}</strong>
                          <span>{link.source === "tzbsky_import" ? "tzbsky" : "tz2at"}</span>
                          <span>{link.verificationStatus}</span>
                        </Row>
                        <Mono>{link.walletAddress}</Mono>
                        {link.tz2atRecordUri ? <Mono>{link.tz2atRecordUri}</Mono> : null}
                        <Button onClick={() => previewWallet({ chain: link.chain, walletAddress: link.walletAddress })}>
                          Preview firehose
                        </Button>
                      </Item>
                    ))
                  ) : (
                    <Item>No imported or published wallet proofs yet.</Item>
                  )}
                </List>
              </GroupBox>

              <GroupBox label="WTFOS PDS Spine">
                <Stack>
                  <Help>
                    WTFOS needs its own PDS for game state, achievements, replay, telemetry, and outward AT Protocol activity. Your canonical DID stays separate.
                  </Help>
                  <Item>
                    <Row>
                      <strong>{status?.pdsOffering.configured ? "Configured" : "Not configured"}</strong>
                      <span>{status?.pdsOffering.serviceHealth.ok === true ? "healthy" : status?.pdsOffering.serviceHealth.ok === false ? "unhealthy" : "unknown"}</span>
                    </Row>
                    <Mono>{status?.pdsOffering.pdsUrl ?? "https://pds.wtfgameshow.app"}</Mono>
                    {status?.pdsOffering.serviceHealth.healthUrl ? <Mono>{status.pdsOffering.serviceHealth.healthUrl}</Mono> : null}
                    {status?.pdsOffering.serviceHealth.error ? <Help>{status.pdsOffering.serviceHealth.error}</Help> : null}
                  </Item>
                  <Item>
                    <Row>
                      <strong>Canonical repo</strong>
                      <span>proofs only</span>
                    </Row>
                    <Mono>{status?.account?.did ?? "Connect DID first"}</Mono>
                    <Help>{status?.pdsOffering.canonicalRepoPolicy.allowedWriteCollections.join(", ")}</Help>
                  </Item>
                  <Item>
                    <Row>
                      <strong>WTFOS repo</strong>
                      <span>{status?.pdsOffering.identity?.status ?? "not requested"}</span>
                    </Row>
                    <Mono>{status?.pdsOffering.identity?.wtfDid ?? status?.pdsOffering.suggestedHandle ?? "pending WTFOS handle"}</Mono>
                    <Help>{status?.pdsOffering.wtfRepoPolicy.writePrefix ?? "app.wtfos"}.*</Help>
                    <Button
                      onClick={() => pdsRequestMutation.mutate()}
                      disabled={!status?.account || !status?.pdsOffering.configured || pdsRequestMutation.isPending}
                    >
                      {pdsRequestMutation.isPending ? "Requesting..." : "Request WTFOS repo"}
                    </Button>
                    {pdsRequestMutation.error ? <Help>{pdsRequestMutation.error.message}</Help> : null}
                  </Item>
                </Stack>
              </GroupBox>

              <GroupBox label="tz2at Activity">
                <Stack>
                  <Help>
                    Firehose: {status?.relay.ok === true ? "online" : status?.relay.ok === false ? "offline" : "unknown"} {status?.relay.network ? `(${status.relay.network})` : ""}
                  </Help>
                  <Mono>{status ? `${status.firehose.baseUrl}${status.firehose.jsonFirehosePath}` : "tz2at firehose"}</Mono>
                  <Mono>{selectedWallet ? selectedWallet.walletAddress : "Select a wallet"}</Mono>
                  <List>
                    {activityQuery.isFetching ? (
                      <Hourglass size={24} />
                    ) : activityQuery.data?.items.length ? (
                      activityQuery.data.items.map((item, index) => (
                        <Item key={index}>
                          <Mono>{JSON.stringify(item).slice(0, 280)}</Mono>
                        </Item>
                      ))
                    ) : (
                      <Item>No tz2at activity returned yet.</Item>
                    )}
                  </List>
                </Stack>
              </GroupBox>
            </Stack>
          </Grid>
        )}
      </Shell>
    </AppWindow>
  );
}
