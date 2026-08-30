import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Hourglass, TextInput } from "react95";
import styled from "styled-components";
import { api, fetchWithCsrf } from "../../lib/api";
import { getNetwork } from "../../lib/tezos/loaders";
import { logClientSystemEvent } from "../../lib/system-log";
import { useWallet } from "../../lib/wallet-context";
import {
  HEN_MINTER_CONTRACT,
  mintPreparedHen,
  pinFileToIpfs,
  prepareHenMint,
  type PreparedHenMint,
} from "./hen-mint";
import {
  buildMediaPastaPackage,
  inspectMintContract,
  isKt1Address,
  MINT_MANAGER_SCHEMA,
  parseTags,
  readKnownMintContracts,
  readMintManagerSnapshot,
  stagePastaMediaHandoff,
  writeMintManagerSnapshot,
  type InspectedMintContract,
  type KnownMintContract,
  type MintDestinationKind,
  type MintManagerStage,
  type MintTokenDraft,
  type PastaPublisherId,
  type WalletDossierLike,
} from "./mint-manager";

export interface MintManagerArtifact {
  mediaItemId?: number;
  title: string;
  fileName: string;
  mimeType: string;
  blob?: Blob;
}

type MintReceipt = {
  id?: number;
  mediaItemId: number;
  status: "applied" | "pending";
  network: "mainnet" | "shadownet";
  opHash: string;
  minterWallet?: string;
  contract?: string;
  tokenId?: string;
  amount?: string;
  explorerUrl: string;
  objktUrl?: string;
  artifactUri?: string;
  verifiedAt?: string;
};

const PASTA_LABELS: Record<PastaPublisherId, string> = {
  spaghetti: "Spaghetti",
  gnocchi: "Gnocchi",
  ravioli: "Ravioli",
  rotini: "Rotini",
  penne: "Penne",
  lasagna: "Lasagna",
};

function defaultToken(artifact: MintManagerArtifact): MintTokenDraft {
  return {
    name: artifact.title,
    description: "",
    tags: "wtfos",
    editions: "1",
    royaltyPercent: "10",
  };
}

function shortAddress(address: string) {
  return address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export function MintManagerDialog({ artifact, onClose }: { artifact: MintManagerArtifact; onClose: () => void }) {
  const titleId = useId();
  const mediaKey = artifact.mediaItemId ?? `${artifact.fileName}:${artifact.mimeType}`;
  const restored = useMemo(() => readMintManagerSnapshot(mediaKey), [mediaKey]);
  const wallet = useWallet();
  const [stage, setStage] = useState<MintManagerStage>(restored?.stage ?? "destination");
  const [destinationKind, setDestinationKind] = useState<MintDestinationKind>(restored?.destinationKind ?? "objkt");
  const [network, setNetwork] = useState<"mainnet" | "shadownet">(restored?.network ?? (getNetwork() === "shadownet" ? "shadownet" : "mainnet"));
  const [selectedContract, setSelectedContract] = useState(restored?.selectedContract ?? "");
  const [newPastaPublisher, setNewPastaPublisher] = useState<"spaghetti" | "gnocchi">(restored?.newPastaPublisher ?? "spaghetti");
  const [token, setToken] = useState<MintTokenDraft>(restored?.token ?? defaultToken(artifact));
  const [pinataJwt, setPinataJwt] = useState("");
  const [preparedHen, setPreparedHen] = useState<PreparedHenMint | null>((restored?.preparedHen as PreparedHenMint | undefined) ?? null);
  const [artifactUri, setArtifactUri] = useState(restored?.artifactUri ?? "");
  const [inspectedContract, setInspectedContract] = useState<InspectedMintContract | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(restored?.result ?? null);
  const [receipt, setReceipt] = useState<MintReceipt | null>(null);
  const [completionOpHash, setCompletionOpHash] = useState(restored?.result?.opHash ?? "");
  const [completionContract, setCompletionContract] = useState(restored?.result?.contract ?? restored?.selectedContract ?? "");
  const [completionTokenId, setCompletionTokenId] = useState(restored?.result?.tokenId ?? "");

  const dossierQuery = useQuery({
    queryKey: ["mint-manager", "profile-dossier"],
    queryFn: () => api.get<WalletDossierLike>("/api/profile/dossier?limit=500"),
  });
  const receiptsQuery = useQuery({
    queryKey: ["mint-manager", "receipts", artifact.mediaItemId],
    queryFn: () => api.get<MintReceipt[]>(`/api/mint-manager/receipts/${artifact.mediaItemId}`),
    enabled: Boolean(artifact.mediaItemId),
  });
  const knownContracts = useMemo(
    () => readKnownMintContracts(dossierQuery.data),
    [dossierQuery.data],
  );
  const flowStages = destinationKind === "hen"
    ? (["destination", "metadata", "review", "complete"] as const)
    : (["destination", "metadata", "review", "publisher", "complete"] as const);

  useEffect(() => {
    logClientSystemEvent({
      eventType: "media.mint_manager.opened",
      metadata: { mediaItemId: artifact.mediaItemId ?? null, mimeType: artifact.mimeType },
    });
  }, [artifact.mediaItemId, artifact.mimeType]);

  useEffect(() => () => setPinataJwt(""), []);

  useEffect(() => {
    const durable = receiptsQuery.data?.[0];
    if (!durable) return;
    setReceipt(durable);
    setNetwork(durable.network);
    setCompletionOpHash(durable.opHash);
    setCompletionContract(durable.contract ?? "");
    setCompletionTokenId(durable.tokenId ?? "");
    setResult({
      opHash: durable.opHash,
      contract: durable.contract,
      tokenId: durable.tokenId,
    });
    setStage("complete");
  }, [receiptsQuery.data]);

  useEffect(() => {
    if (destinationKind !== "known_contract" || stage === "destination" || inspectedContract || !selectedContract) return;
    const known = knownContracts.find((contract) => contract.address === selectedContract);
    if (!known) return;
    void inspectMintContract(known).then(setInspectedContract).catch(() => undefined);
  }, [destinationKind, inspectedContract, knownContracts, selectedContract, stage]);

  useEffect(() => {
    writeMintManagerSnapshot(mediaKey, {
      schema: MINT_MANAGER_SCHEMA,
      stage,
      destinationKind,
      network,
      selectedContract,
      newPastaPublisher,
      token,
      artifactUri: artifactUri || undefined,
      preparedHen: preparedHen ?? undefined,
      result: result ?? undefined,
    });
  }, [artifactUri, destinationKind, mediaKey, network, newPastaPublisher, preparedHen, result, selectedContract, stage, token]);

  async function readArtifact(): Promise<Blob> {
    if (artifact.blob) return artifact.blob;
    if (!artifact.mediaItemId) throw new Error("This media item has no readable file.");
    const response = await fetchWithCsrf(`/api/media/${artifact.mediaItemId}/file`, { credentials: "include" });
    if (!response.ok) throw new Error(`Could not read the media file (HTTP ${response.status}).`);
    return response.blob();
  }

  function setTokenField<K extends keyof MintTokenDraft>(key: K, value: MintTokenDraft[K]) {
    setToken((current) => ({ ...current, [key]: value }));
  }

  function startOver() {
    setStage("destination");
    setDestinationKind("objkt");
    setNetwork(getNetwork() === "shadownet" ? "shadownet" : "mainnet");
    setSelectedContract("");
    setNewPastaPublisher("spaghetti");
    setToken(defaultToken(artifact));
    setPinataJwt("");
    setPreparedHen(null);
    setArtifactUri("");
    setInspectedContract(null);
    setResult(null);
    setReceipt(null);
    setCompletionOpHash("");
    setCompletionContract("");
    setCompletionTokenId("");
    setError("");
    setProgress("");
  }

  async function continueFromDestination() {
    setBusy(true);
    setError("");
    try {
      if (destinationKind === "hen" || destinationKind === "objkt") setNetwork("mainnet");
      if (destinationKind === "known_contract") {
        const known = knownContracts.find((contract) => contract.address === selectedContract);
        if (!known) throw new Error("Select a contract associated with your wallet or Pasta workspace.");
        setProgress("Reading the contract interface from Tezos…");
        const inspected = await inspectMintContract(known);
        setInspectedContract(inspected);
        setNetwork(inspected.network);
        if (!inspected.supported) throw new Error(inspected.reason || "This contract is not supported by a media publisher workflow.");
      }
      logClientSystemEvent({
        eventType: "media.mint_manager.destination_selected",
        metadata: { destinationKind, selectedContract: selectedContract || null, network },
      });
      setStage("metadata");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare that mint destination.");
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  function resolvePublisher(): PastaPublisherId {
    if (destinationKind === "objkt") return "spaghetti";
    if (destinationKind === "new_pasta") return newPastaPublisher;
    if (destinationKind === "known_contract") {
      if (inspectedContract?.publisher) return inspectedContract.publisher;
      const toolId = knownContracts.find((contract) => contract.address === selectedContract)?.toolId;
      if (["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"].includes(String(toolId))) {
        return toolId as PastaPublisherId;
      }
    }
    throw new Error("This destination does not have a Pasta publisher.");
  }

  async function prepareWorkflow() {
    setBusy(true);
    setError("");
    try {
      if (!token.name.trim()) throw new Error("Enter a token title.");
      const file = await readArtifact();
      if (destinationKind === "hen") {
        const editions = Number(token.editions);
        const royaltyPercent = Number(token.royaltyPercent);
        const royaltyUnits = Math.round(royaltyPercent * 10);
        if (!Number.isFinite(royaltyPercent) || royaltyUnits / 10 !== royaltyPercent) {
          throw new Error("Royalties may use one decimal place.");
        }
        setProgress("Pinning the artifact and HEN metadata to IPFS…");
        const creator = wallet.address || (await wallet.connect()).address;
        const prepared = await prepareHenMint({
          artifact: file,
          fileName: artifact.fileName,
          mimeType: artifact.mimeType,
          name: token.name,
          description: token.description,
          tags: parseTags(token.tags),
          creator,
          editions,
          royalties: royaltyUnits,
          pinataJwt,
        });
        setPreparedHen(prepared);
      } else {
        setProgress("Pinning the media artifact to IPFS…");
        const cid = await pinFileToIpfs(file, artifact.fileName, pinataJwt);
        setArtifactUri(`ipfs://${cid}`);
      }
      setPinataJwt("");
      setStage("review");
      logClientSystemEvent({
        eventType: "media.mint_manager.media_pinned",
        metadata: { destinationKind, mimeType: artifact.mimeType },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare the mint workflow.");
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  function launchPublisher() {
    try {
      const publisher = resolvePublisher();
      if (!artifactUri) throw new Error("Pin the media before opening the publisher.");
      const pkg = buildMediaPastaPackage({
        publisher,
        name: token.name.trim(),
        description: token.description.trim(),
        artifactUri,
        mimeType: artifact.mimeType,
        tags: parseTags(token.tags),
      });
      const href = stagePastaMediaHandoff({
        publisher,
        package: pkg,
        network,
        contract: destinationKind === "known_contract" ? selectedContract : undefined,
      });
      window.open(href, "_blank", "noopener");
      setStage("publisher");
      setCompletionContract(destinationKind === "known_contract" ? selectedContract : completionContract);
      logClientSystemEvent({
        eventType: "media.mint_manager.publisher_handoff_opened",
        metadata: { publisher, destinationKind, network, contract: selectedContract || null },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the Pasta publisher.");
    }
  }

  async function signHenMint() {
    if (!preparedHen) return;
    setBusy(true);
    setError("");
    setProgress("Waiting for wallet approval and Mainnet confirmation…");
    try {
      const minted = await mintPreparedHen(preparedHen);
      const next = { opHash: minted.opHash, contract: HEN_MINTER_CONTRACT };
      setResult(next);
      setCompletionOpHash(minted.opHash);
      setCompletionContract(HEN_MINTER_CONTRACT);
      setStage("complete");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The HEN mint failed.");
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  async function checkReceipt() {
    setBusy(true);
    setError("");
    setProgress("Checking the exact operation and token transfer in TzKT…");
    try {
      if (!artifact.mediaItemId) throw new Error("Save this artwork to wtfOS Media before verifying its mint receipt.");
      const verified = await api.post<MintReceipt>("/api/mint-manager/receipt", {
        mediaItemId: artifact.mediaItemId,
        opHash: completionOpHash.trim(),
        contract: completionContract.trim() || undefined,
        tokenId: completionTokenId.trim() || undefined,
        network,
        artifactUri: artifactUri || (preparedHen ? `ipfs://${preparedHen.artifactCid}` : undefined),
      });
      setReceipt(verified);
      setResult({
        opHash: verified.opHash,
        contract: verified.contract || completionContract.trim() || undefined,
        tokenId: verified.tokenId || completionTokenId.trim() || undefined,
      });
      if (verified.status === "applied") {
        setStage("complete");
      }
      await receiptsQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify the mint receipt.");
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  const publisher = destinationKind === "hen" ? null : (() => {
    try { return resolvePublisher(); } catch { return null; }
  })();

  return (
    <Overlay onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <Dialog role="dialog" aria-modal="true" aria-labelledby={titleId} data-mint-manager-dialog data-mint-manager-stage={stage}>
        <Header>
          <div><Eyebrow>WTF Media</Eyebrow><h2 id={titleId}>Mint Manager</h2></div>
          <HeaderActions><Button disabled={busy} onClick={startOver}>Start over</Button><Button aria-label="Close Mint Manager" disabled={busy} onClick={onClose}>×</Button></HeaderActions>
        </Header>
        <Stepper aria-label="Mint workflow progress">
          {flowStages.map((item, index) => (
            <Step key={item} $active={item === stage} $done={index < flowStages.indexOf(stage as any)}>
              {index + 1}. {item === "destination" ? "Destination" : item === "metadata" ? "Metadata" : item === "review" ? "Pin & review" : item === "publisher" ? "Sign in publisher" : "Receipt"}
            </Step>
          ))}
        </Stepper>
        <MediaSummary><strong>{artifact.title}</strong><span>{artifact.fileName} · {artifact.mimeType}</span></MediaSummary>
        {receiptsQuery.isLoading && artifact.mediaItemId && <DurableReceiptNotice>Checking this owned media item for saved mint receipts…</DurableReceiptNotice>}
        {receiptsQuery.isError && artifact.mediaItemId && <DurableReceiptWarning>Saved mint receipts could not be loaded. You can retry without signing another wallet operation.</DurableReceiptWarning>}

        {stage === "destination" && (
          <Body>
            <SectionTitle>Where should this artwork live?</SectionTitle>
            <DestinationGrid>
              <DestinationButton type="button" aria-pressed={destinationKind === "objkt"} $selected={destinationKind === "objkt"} onClick={() => setDestinationKind("objkt")}>
                <strong>OBJKT-ready collection</strong><span>Create a creator-owned Pasta standard collection whose TZIP-21 tokens can be indexed and displayed by Objkt.</span>
              </DestinationButton>
              <DestinationButton type="button" aria-pressed={destinationKind === "hen"} $selected={destinationKind === "hen"} onClick={() => setDestinationKind("hen")}>
                <strong>HEN / Teia shared contract</strong><span>Mint directly through the established HEN Mainnet <code>mint_OBJKT</code> entrypoint.</span>
              </DestinationButton>
              <DestinationButton type="button" aria-pressed={destinationKind === "known_contract"} $selected={destinationKind === "known_contract"} onClick={() => setDestinationKind("known_contract")}>
                <strong>My associated contract</strong><span>Use Pasta workspace records and contracts originated by your linked wallet.</span>
              </DestinationButton>
              <DestinationButton type="button" aria-pressed={destinationKind === "new_pasta"} $selected={destinationKind === "new_pasta"} onClick={() => setDestinationKind("new_pasta")}>
                <strong>New Pasta contract</strong><span>Originate a standard collection or open-edition factory, then publish this media into it.</span>
              </DestinationButton>
            </DestinationGrid>
            {destinationKind === "known_contract" && (
              <Field>
                <label htmlFor={`${titleId}-contract`}>Associated contract</label>
                <select id={`${titleId}-contract`} value={selectedContract} onChange={(event) => setSelectedContract(event.target.value)}>
                  <option value="">Select a contract…</option>
                  {knownContracts.map((contract) => <option key={contract.address} value={contract.address}>{contract.label} · {shortAddress(contract.address)} · {contract.network}</option>)}
                </select>
                {dossierQuery.isLoading && <small>Loading wallet originations…</small>}
                {!dossierQuery.isLoading && knownContracts.length === 0 && <small>No associated contracts are recorded yet. Use New Pasta contract or create a project in Colander.</small>}
              </Field>
            )}
            {destinationKind === "new_pasta" && (
              <FieldRow>
                <Field><label htmlFor={`${titleId}-pasta`}>Contract workflow</label><select id={`${titleId}-pasta`} value={newPastaPublisher} onChange={(event) => setNewPastaPublisher(event.target.value as "spaghetti" | "gnocchi")}><option value="spaghetti">Spaghetti · standard / fixed editions</option><option value="gnocchi">Gnocchi · open / limited editions</option></select></Field>
                <Field><label htmlFor={`${titleId}-network`}>Network</label><select id={`${titleId}-network`} value={network} onChange={(event) => setNetwork(event.target.value as "mainnet" | "shadownet")}><option value="shadownet">Shadownet rehearsal</option><option value="mainnet">Tezos Mainnet</option></select></Field>
              </FieldRow>
            )}
            {error && <ErrorText role="alert">{error}</ErrorText>}
            {progress && <Progress><Hourglass size={18} /> {progress}</Progress>}
            <Actions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || (destinationKind === "known_contract" && !selectedContract)} onClick={() => void continueFromDestination()}>Continue to metadata</Button></Actions>
          </Body>
        )}

        {stage === "metadata" && (
          <Body>
            <SectionTitle>Describe the token for wallets and indexers</SectionTitle>
            <Notice>These fields travel with the pinned artifact into the selected mint workflow. The destination app will collect any contract-specific pricing, timing, or supply policy before signing.</Notice>
            <Field><label htmlFor={`${titleId}-name`}>Token title</label><TextInput id={`${titleId}-name`} value={token.name} onChange={(event: any) => setTokenField("name", event.target.value)} disabled={busy} /></Field>
            <Field><label htmlFor={`${titleId}-description`}>Description</label><textarea id={`${titleId}-description`} rows={4} value={token.description} onChange={(event) => setTokenField("description", event.target.value)} disabled={busy} /></Field>
            <Field><label htmlFor={`${titleId}-tags`}>Tags</label><TextInput id={`${titleId}-tags`} value={token.tags} onChange={(event: any) => setTokenField("tags", event.target.value)} disabled={busy} /><small>Comma-separated. Used in TZIP-21 metadata and marketplace discovery.</small></Field>
            {destinationKind === "hen" && <FieldRow><Field><label htmlFor={`${titleId}-editions`}>Editions</label><TextInput id={`${titleId}-editions`} type="number" min="1" step="1" value={token.editions} onChange={(event: any) => setTokenField("editions", event.target.value)} disabled={busy} /></Field><Field><label htmlFor={`${titleId}-royalties`}>Royalties %</label><TextInput id={`${titleId}-royalties`} type="number" min="0" max="25" step="0.1" value={token.royaltyPercent} onChange={(event: any) => setTokenField("royaltyPercent", event.target.value)} disabled={busy} /></Field></FieldRow>}
            <Field><label htmlFor={`${titleId}-jwt`}>Your Pinata JWT</label><TextInput id={`${titleId}-jwt`} type="password" autoComplete="off" spellCheck={false} value={pinataJwt} onChange={(event: any) => setPinataJwt(event.target.value)} disabled={busy} /><small>Session-only. Sent directly to Pinata and cleared immediately after pinning.</small></Field>
            {error && <ErrorText role="alert">{error}</ErrorText>}
            {progress && <Progress><Hourglass size={18} /> {progress}</Progress>}
            <Actions><Button disabled={busy} onClick={() => setStage("destination")}>Back</Button><Button disabled={busy || !pinataJwt.trim() || !token.name.trim()} onClick={() => void prepareWorkflow()}>Pin media & prepare review</Button></Actions>
          </Body>
        )}

        {stage === "review" && destinationKind === "hen" && preparedHen && (
          <Body>
            <SectionTitle>Review the HEN wallet operation</SectionTitle>
            <Warning>No wallet request has been sent yet. “Sign & mint” submits one Mainnet operation.</Warning>
            <Review><dt>Network</dt><dd>Tezos Mainnet</dd><dt>Wallet</dt><dd><code>{preparedHen.creator}</code></dd><dt>Contract</dt><dd><code>{HEN_MINTER_CONTRACT}</code></dd><dt>Entrypoint</dt><dd><code>mint_OBJKT</code></dd><dt>Artifact CID</dt><dd><code>{preparedHen.artifactCid}</code></dd><dt>Metadata CID</dt><dd><code>{preparedHen.metadataCid}</code></dd><dt>Editions</dt><dd>{preparedHen.editions}</dd><dt>Royalties</dt><dd>{(preparedHen.royalties / 10).toFixed(1)}%</dd><dt>Cost</dt><dd>Wallet-estimated network gas and storage fees</dd></Review>
            {error && <ErrorText role="alert">{error}</ErrorText>}{progress && <Progress><Hourglass size={18} /> {progress}</Progress>}
            <Actions><Button disabled={busy} onClick={() => setStage("metadata")}>Back</Button><Button disabled={busy} onClick={() => void signHenMint()}>Sign & mint to HEN</Button></Actions>
          </Body>
        )}

        {stage === "review" && destinationKind !== "hen" && publisher && (
          <Body>
            <SectionTitle>Media is pinned. Continue in {PASTA_LABELS[publisher]}</SectionTitle>
            <Success>The media bytes are durable and the handoff package is ready.</Success>
            <Review><dt>Network</dt><dd>{network === "mainnet" ? "Tezos Mainnet" : "Tezos Shadownet"}</dd><dt>Publisher</dt><dd>{PASTA_LABELS[publisher]}</dd>{destinationKind === "known_contract" && <><dt>Contract</dt><dd><code>{selectedContract}</code></dd></>}<dt>Artifact</dt><dd><code>{artifactUri}</code></dd><dt>Metadata</dt><dd>Title, description, MIME type, and {parseTags(token.tags).length} tag(s) staged</dd><dt>Wallet</dt><dd>Not requested yet</dd></Review>
            <Notice>{PASTA_LABELS[publisher]} will verify or originate the contract, build and pin final TZIP metadata, show its specialized supply/sale form, and ask your wallet to sign only after its own review.</Notice>
            {error && <ErrorText role="alert">{error}</ErrorText>}
            <Actions><Button onClick={() => setStage("metadata")}>Back</Button><Button onClick={launchPublisher}>Open {PASTA_LABELS[publisher]} with this media</Button></Actions>
          </Body>
        )}

        {stage === "publisher" && publisher && (
          <Body>
            <SectionTitle>Complete the user-signed steps in {PASTA_LABELS[publisher]}</SectionTitle>
            <Checklist><li data-done="true">Media pinned to IPFS</li><li data-done="true">Metadata package transferred to {PASTA_LABELS[publisher]}</li><li>Verify or originate the destination contract</li><li>Complete edition, pricing, and sale policy</li><li>Review the wallet account, network, calls, and fees</li><li>Sign the publish/mint operation and copy its operation hash</li></Checklist>
            <Button onClick={launchPublisher}>Reopen {PASTA_LABELS[publisher]} with a fresh handoff</Button>
            <ReceiptFields><Field><label htmlFor={`${titleId}-receipt-op`}>Mint operation hash</label><TextInput id={`${titleId}-receipt-op`} value={completionOpHash} onChange={(event: any) => setCompletionOpHash(event.target.value)} placeholder="o…" /></Field><Field><label htmlFor={`${titleId}-receipt-contract`}>Minted contract</label><TextInput id={`${titleId}-receipt-contract`} value={completionContract} onChange={(event: any) => setCompletionContract(event.target.value)} placeholder="KT1…" /></Field><Field><label htmlFor={`${titleId}-receipt-token`}>Token ID (if shown)</label><TextInput id={`${titleId}-receipt-token`} value={completionTokenId} onChange={(event: any) => setCompletionTokenId(event.target.value)} placeholder="0" /></Field></ReceiptFields>
            <small>Mint Manager verifies the exact linked-wallet operation and indexed token transfer. It does not trust a pasted hash by itself.</small>
            {receipt?.status === "pending" && <Warning>The operation is valid but its token transfer is not indexed yet. Wait for TzKT, then check again; do not sign a duplicate mint.</Warning>}
            {error && <ErrorText role="alert">{error}</ErrorText>}{progress && <Progress><Hourglass size={18} /> {progress}</Progress>}
            <Actions><Button disabled={busy} onClick={onClose}>Keep workflow & close</Button><Button disabled={busy || !completionOpHash.trim() || !isKt1Address(completionContract)} onClick={() => void checkReceipt()}>Verify minted token</Button></Actions>
          </Body>
        )}

        {stage === "complete" && (
          <Body>
            <SectionTitle>{receipt?.status === "applied" ? "Token verified, indexed, and saved" : receipt?.status === "pending" ? "Mint saved; token indexing is catching up" : "Mint confirmed on Tezos"}</SectionTitle>
            {receipt?.id
              ? <Success>This receipt is stored with your owned media and will return on another signed-in session or device.</Success>
              : <Notice>The wallet operation is confirmed locally. Verify it below to save an account-backed receipt with this owned media.</Notice>}
            {receipt?.status === "pending" && <Warning>TzKT has the linked-wallet operation but not its mint transfer yet. Check again later; do not sign a duplicate mint.</Warning>}
            <Review><dt>Network</dt><dd>{network === "shadownet" ? "Tezos Shadownet" : "Tezos Mainnet"}</dd><dt>Operation</dt><dd><code>{receipt?.opHash || result?.opHash}</code></dd><dt>Contract</dt><dd><code>{receipt?.contract || result?.contract || HEN_MINTER_CONTRACT}</code></dd>{(receipt?.tokenId || result?.tokenId) && <><dt>Token ID</dt><dd>{receipt?.tokenId || result?.tokenId}</dd></>}<dt>Indexer</dt><dd>{receipt?.status === "applied" ? "TzKT token transfer verified" : "Operation confirmed; token transfer pending"}</dd>{receipt?.minterWallet && <><dt>Signing wallet</dt><dd><code>{receipt.minterWallet}</code></dd></>}</Review>
            <LinkRow><a href={receipt?.explorerUrl || `${network === "shadownet" ? "https://shadownet.tzkt.io" : "https://tzkt.io"}/${result?.opHash}`} target="_blank" rel="noopener noreferrer">View operation on TzKT</a>{receipt?.objktUrl && <a href={receipt.objktUrl} target="_blank" rel="noopener noreferrer">View token on Objkt</a>}</LinkRow>
            {(!receipt || receipt.status === "pending") && <Button disabled={busy} onClick={() => void checkReceipt()}>{receipt?.status === "pending" ? "Check TzKT again" : "Verify & save receipt"}</Button>}
            {error && <ErrorText role="alert">{error}</ErrorText>}{progress && <Progress><Hourglass size={18} /> {progress}</Progress>}
            <Actions><Button onClick={onClose}>Done</Button></Actions>
          </Body>
        )}
      </Dialog>
    </Overlay>
  );
}

const Overlay = styled.div`position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.74);`;
const Dialog = styled.div`width:min(840px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--wtf-app-surface,#c0c0c0);color:var(--wtf-app-text,#111);border:2px outset #eee;box-shadow:6px 6px 0 #000;`;
const Header = styled.div`display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;background:#000080;color:#fff;h2{font-size:20px;margin:0;}`;
const HeaderActions = styled.div`display:flex;align-items:center;gap:6px;`;
const Eyebrow = styled.div`font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#bfc8ff;`;
const Stepper = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));border-bottom:1px solid #777;background:#aaa;@media(max-width:640px){grid-template-columns:1fr;}`;
const Step = styled.div<{ $active: boolean; $done: boolean }>`padding:7px 8px;font-size:11px;border-right:1px solid #777;background:${({$active,$done})=>$active?"#fff":"#d5d5d5"};font-weight:${({$active})=>$active?700:400};color:${({$done})=>$done?"#175b28":"inherit"};`;
const MediaSummary = styled.div`display:flex;justify-content:space-between;gap:12px;padding:10px 14px;background:#efefef;border-bottom:1px solid #888;span{font-size:12px;color:#444;overflow-wrap:anywhere;}@media(max-width:560px){flex-direction:column;}`;
const DurableReceiptNotice = styled.div`padding:8px 14px;border-bottom:1px solid #777;background:#eef0ff;font-size:12px;`;
const DurableReceiptWarning = styled(DurableReceiptNotice)`background:#fff4cc;color:#633f00;`;
const Body = styled.div`display:grid;gap:13px;padding:16px;a{color:#0000aa;}code{overflow-wrap:anywhere;}`;
const SectionTitle = styled.h3`margin:0;font-size:17px;`;
const DestinationGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:10px;@media(max-width:640px){grid-template-columns:1fr;}`;
const DestinationButton = styled.button<{ $selected: boolean }>`display:grid;gap:5px;min-height:96px;padding:12px;text-align:left;font:inherit;border:${({$selected})=>$selected?"3px solid #000080":"2px outset #eee"};background:${({$selected})=>$selected?"#eef0ff":"#eee"};cursor:pointer;strong{font-size:14px;}span{font-size:12px;line-height:1.4;color:#333;}`;
const Field = styled.div`display:grid;gap:5px;label{font-weight:700;}textarea,select{box-sizing:border-box;width:100%;padding:8px;font:inherit;}textarea{resize:vertical;}small{color:var(--wtf-app-muted-text,#444);}`;
const FieldRow = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:12px;@media(max-width:560px){grid-template-columns:1fr;}`;
const ReceiptFields = styled.div`display:grid;grid-template-columns:1.5fr 1.2fr .5fr;gap:10px;@media(max-width:720px){grid-template-columns:1fr;}`;
const Notice = styled.div`padding:10px;border:1px solid #555;background:#fff;line-height:1.4;`;
const Warning = styled(Notice)`border-color:#8a5b00;background:#fff4cc;`;
const Success = styled(Notice)`border-color:#176b2b;background:#e8ffe8;`;
const Progress = styled.div`display:flex;align-items:center;gap:8px;`;
const ErrorText = styled.div`padding:8px;border:1px solid #8b0000;background:#ffecec;color:#710000;`;
const Actions = styled.div`display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;`;
const Review = styled.dl`display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 12px;margin:0;padding:12px;background:#f5f5f5;border:1px solid #777;dt{font-weight:700;}dd{margin:0;min-width:0;overflow-wrap:anywhere;}@media(max-width:520px){grid-template-columns:1fr;dd{margin-bottom:6px;}}`;
const Checklist = styled.ol`display:grid;gap:8px;margin:0;padding:12px 12px 12px 34px;background:#fff;border:1px solid #777;li[data-done="true"]{color:#176b2b;text-decoration:line-through;}`;
const LinkRow = styled.div`display:flex;gap:14px;flex-wrap:wrap;`;
