import { useEffect, useMemo, useState } from "react";
import { Checkbox, Hourglass } from "react95";
import styled from "styled-components";
import {
  Check,
  ExternalLink,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiNotice, UiPanel } from "../components/wtfos-ui";
import { api } from "../lib/api";
import { useWallet } from "../lib/wallet-context";
import {
  evaluateObjktCandidatePolicy,
  type ObjktCreatorReviewStatus,
  type ObjktOperatorSettings,
  type ObjktOperatorState,
  type ObjktQueueItem,
  type ObjktQueueStatus,
} from "@shared/objkt-operator";

const Shell = styled.div`
  display: grid;
  gap: 12px;
  min-width: 0;
  color: var(--wtf-app-text, #111);
`;

const SummaryBar = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 1px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-border, #808080);

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const SummaryCell = styled.div`
  display: grid;
  gap: 3px;
  min-height: 58px;
  padding: 9px;
  background: var(--wtf-app-surface-raised, #fff);

  strong { font-size: 17px; }
  span { color: var(--wtf-app-muted-text, #444); font-size: 12px; }
`;

const ControlGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
  gap: 8px;

  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  min-width: 0;
  font-size: 12px;
  font-weight: 700;
`;

const NumberInput = styled.input`
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 4px 7px;
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-control-bg, #fff);
  border: 1px solid var(--wtf-app-control-border, #808080);
  border-radius: var(--wtf-control-radius, 0);
  font: inherit;
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

const Address = styled.code`
  overflow-wrap: anywhere;
  font-size: 12px;
`;

const CreatorList = styled.div`
  display: grid;
  gap: 0;
  border: 1px solid var(--wtf-app-border, #808080);
`;

const CreatorRow = styled.article`
  display: grid;
  grid-template-columns: minmax(220px, 1.3fr) 90px 100px minmax(185px, auto);
  gap: 8px;
  align-items: center;
  padding: 9px;
  background: var(--wtf-app-surface-raised, #fff);
  border-bottom: 1px solid var(--wtf-app-border-subtle, #c0c0c0);

  &:last-child { border-bottom: 0; }

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr) auto;
  }
`;

const CreatorIdentity = styled.div`
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
`;

const Avatar = styled.img`
  width: 38px;
  height: 38px;
  object-fit: cover;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #101010;
`;

const IdentityText = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;

  strong, span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  span { color: var(--wtf-app-muted-text, #444); font-size: 12px; }
`;

const Score = styled.strong<{ $score: number }>`
  color: ${(props) => props.$score >= 70 ? "#176b38" : props.$score >= 50 ? "#8a4b00" : "#a12622"};
  font-size: 18px;
`;

const CreatorMeta = styled.div`
  color: var(--wtf-app-muted-text, #444);
  font-size: 12px;
  line-height: 1.35;

  @media (max-width: 760px) { display: none; }
`;

const ReviewActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 5px;
  flex-wrap: wrap;
`;

const Breakdown = styled.details`
  grid-column: 1 / -1;
  padding-top: 4px;

  summary {
    width: fit-content;
    cursor: pointer;
    color: var(--wtf-app-link, #000080);
    font-size: 12px;
    font-weight: 700;
  }
`;

const BreakdownGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(86px, 1fr));
  gap: 1px;
  margin-top: 7px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-border, #808080);
  overflow: auto;
`;

const BreakdownCell = styled.div`
  display: grid;
  gap: 3px;
  min-width: 86px;
  padding: 7px;
  background: var(--wtf-app-surface, #f4f4f4);
  font-size: 11px;

  strong { font-size: 14px; }
  span { color: var(--wtf-app-muted-text, #444); white-space: nowrap; }
`;

const CandidateList = styled.div`
  display: grid;
  gap: 1px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-border, #808080);
`;

const CandidateRow = styled.article`
  display: grid;
  grid-template-columns: 72px minmax(190px, 1.4fr) repeat(3, minmax(80px, 0.6fr)) minmax(130px, auto);
  gap: 9px;
  align-items: center;
  min-height: 92px;
  padding: 9px;
  background: var(--wtf-app-surface-raised, #fff);

  @media (max-width: 850px) {
    grid-template-columns: 64px minmax(0, 1fr) auto;
  }
`;

const CandidateMedia = styled.img`
  width: 72px;
  height: 72px;
  object-fit: cover;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #111;

  @media (max-width: 850px) { width: 64px; height: 64px; }
`;

const CandidateText = styled.div`
  display: grid;
  gap: 3px;
  min-width: 0;

  strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  span { color: var(--wtf-app-muted-text, #444); font-size: 12px; line-height: 1.35; }
`;

const CandidateMetric = styled.div`
  display: grid;
  gap: 2px;
  font-size: 12px;

  strong { font-size: 15px; }
  span { color: var(--wtf-app-muted-text, #444); }

  @media (max-width: 850px) { display: none; }
`;

const QueueList = styled.div`
  display: grid;
  gap: 8px;
`;

const QueueRow = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
`;

const OperationInput = styled(NumberInput).attrs({ type: "text" })`
  min-width: min(100%, 340px);
`;

const EventList = styled.div`
  display: grid;
  gap: 5px;
  max-height: 190px;
  overflow: auto;
`;

const EventRow = styled.div`
  display: grid;
  grid-template-columns: 68px 58px minmax(0, 1fr);
  gap: 7px;
  align-items: start;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--wtf-app-border-subtle, #d0d0d0);
  font-size: 12px;
`;

const Empty = styled.div`
  padding: 18px 8px;
  color: var(--wtf-app-muted-text, #444);
  text-align: center;
`;

const SCORE_LABELS = {
  sales: "Sales",
  buyers: "Buyers",
  volume: "Volume",
  recency: "Recency",
  verification: "Verified",
  inventoryDepth: "Inventory",
  floorFit: "Floor fit",
} as const;

function mediaUrl(uri?: string | null) {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) return `https://ipfs.fileship.xyz/${uri.slice(7)}`;
  return /^https:\/\//.test(uri) ? uri : "";
}

function shortAddress(address?: string | null) {
  if (!address) return "Not set";
  return `${address.slice(0, 8)}...${address.slice(-5)}`;
}

function formatXtz(value: number | null | undefined) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function stateResponse(result: { state: ObjktOperatorState }) {
  return result.state;
}

export function ObjktOperator() {
  const wallet = useWallet();
  const [state, setState] = useState<ObjktOperatorState | null>(null);
  const [settings, setSettings] = useState<ObjktOperatorSettings | null>(null);
  const [busy, setBusy] = useState<string | null>("load");
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "danger"; text: string } | null>(null);
  const [operationHashes, setOperationHashes] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    api.get<{ state: ObjktOperatorState }>("/api/objkt-operator/state")
      .then((result) => {
        if (!active) return;
        setState(result.state);
        setSettings(result.state.settings);
      })
      .catch((error) => active && setNotice({ tone: "danger", text: error.message }))
      .finally(() => active && setBusy(null));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (state) setSettings(state.settings);
  }, [state?.version]);

  const approvedCreators = useMemo(
    () => state?.creators.filter((creator) => creator.reviewStatus === "approved") || [],
    [state?.creators],
  );
  const pendingCreators = useMemo(
    () => state?.creators.filter((creator) => creator.reviewStatus === "pending") || [],
    [state?.creators],
  );
  const queuedSpend = useMemo(
    () => (state?.queue || [])
      .filter((item) => !["failed", "skipped"].includes(item.status))
      .reduce((sum, item) => sum + item.lowestAskXtz, 0),
    [state?.queue],
  );

  async function runAction(label: string, action: () => Promise<{ state: ObjktOperatorState }>, success: string) {
    setBusy(label);
    setNotice(null);
    try {
      const next = stateResponse(await action());
      setState(next);
      setNotice({ tone: "success", text: success });
      return next;
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Operator action failed" });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function reviewCreator(address: string, reviewStatus: ObjktCreatorReviewStatus) {
    await runAction(
      `creator:${address}`,
      () => api.patch(`/api/objkt-operator/creators/${encodeURIComponent(address)}`, { reviewStatus }),
      `Creator ${reviewStatus}.`,
    );
  }

  async function updateQueue(item: ObjktQueueItem, status: ObjktQueueStatus, operationHash?: string) {
    return runAction(
      `queue:${item.id}`,
      () => api.patch("/api/objkt-operator/queue", { id: item.id, status, operationHash }),
      `${item.name} moved to ${status}.`,
    );
  }

  async function openKukai() {
    const opened = window.open("https://wallet.kukai.app/", "kukai-signing-tab", "width=440,height=760");
    opened?.focus();
    await runAction(
      "kukai",
      () => api.patch("/api/objkt-operator/session", { kukaiStatus: "opened" }),
      "Kukai signer tab recorded.",
    );
  }

  async function openObjkt() {
    const address = state?.walletAddress || wallet.address;
    const url = address ? `https://objkt.com/profile/${address}` : "https://objkt.com/";
    window.open(url, "objkt-account-tab")?.focus();
    await runAction(
      "objkt",
      () => api.patch("/api/objkt-operator/session", { objktAccountStatus: "opened", objktWalletAddress: address || null }),
      "Objkt account tab recorded.",
    );
  }

  async function openCheckout(item: ObjktQueueItem) {
    window.open(item.objktUrl, "objkt-checkout-tab")?.focus();
    await updateQueue(item, "checkout");
  }

  if (busy === "load" && !state) {
    return <AppWindow title="Objkt Operator"><Empty><Hourglass size={28} /> Loading persisted operator state...</Empty></AppWindow>;
  }

  if (!state || !settings) {
    return (
      <AppWindow title="Objkt Operator">
        <UiNotice tone="danger">{notice?.text || "Objkt Operator state is unavailable."}</UiNotice>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Objkt Operator">
      <Shell data-testid="objkt-operator-surface">
        {notice ? <UiNotice tone={notice.tone}>{notice.text}</UiNotice> : null}

        <SummaryBar data-testid="objkt-operator-summary">
          <SummaryCell><strong>{approvedCreators.length}</strong><span>approved creators</span></SummaryCell>
          <SummaryCell><strong>{pendingCreators.length}</strong><span>awaiting review</span></SummaryCell>
          <SummaryCell><strong>{state.scan?.candidates.length || 0}</strong><span>market candidates</span></SummaryCell>
          <SummaryCell><strong>{formatXtz(queuedSpend)} XTZ</strong><span>active queue / {formatXtz(settings.spendCapXtz)} cap</span></SummaryCell>
        </SummaryBar>

        <UiPanel
          title="Wallet and signing"
          actions={<span data-testid="objkt-operator-persistence">Postgres v{state.version}</span>}
          compact
        >
          <Toolbar>
            <UiButton onClick={openKukai} disabled={Boolean(busy)}><Wallet size={15} /> Open Kukai</UiButton>
            <UiButton onClick={openObjkt} disabled={Boolean(busy)}><ExternalLink size={15} /> Open Objkt</UiButton>
            <UiButton
              onClick={async () => {
                try {
                  const result = await wallet.connect();
                  await runAction(
                    "wallet",
                    () => api.patch("/api/objkt-operator/wallet", { walletAddress: result.address }),
                    "Kukai wallet saved to wtfOS.",
                  );
                } catch (error) {
                  setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Wallet connection failed" });
                }
              }}
              disabled={wallet.isConnecting || Boolean(busy)}
            >
              <ShieldCheck size={15} /> {wallet.address ? "Reconnect wallet" : "Connect wallet"}
            </UiButton>
            {wallet.address && wallet.address !== state.walletAddress ? (
              <UiButton
                uiVariant="primary"
                onClick={() => runAction(
                  "wallet",
                  () => api.patch("/api/objkt-operator/wallet", { walletAddress: wallet.address }),
                  "Connected wallet saved to wtfOS.",
                )}
                disabled={Boolean(busy)}
              ><Save size={15} /> Save connected wallet</UiButton>
            ) : null}
          </Toolbar>
          <Toolbar style={{ marginTop: 8 }}>
            <Address data-testid="objkt-operator-wallet-address">{state.walletAddress || "No persisted wallet address"}</Address>
            <span>{wallet.providerName || "No browser wallet"}</span>
            <span>Kukai: {state.session.kukaiStatus}</span>
            <span>Objkt: {state.session.objktAccountStatus}</span>
            {state.session.kukaiStatus === "opened" ? (
              <UiButton compact onClick={() => runAction("kukai-ready", () => api.patch("/api/objkt-operator/session", { kukaiStatus: "ready" }), "Kukai marked ready.")} disabled={Boolean(busy)}>
                <Check size={14} /> Ready
              </UiButton>
            ) : null}
            {state.session.objktAccountStatus === "opened" ? (
              <UiButton compact onClick={() => runAction("objkt-ready", () => api.patch("/api/objkt-operator/session", { objktAccountStatus: "ready", objktWalletAddress: state.walletAddress }), "Objkt marked ready.")} disabled={Boolean(busy) || !state.walletAddress}>
                <Check size={14} /> Ready
              </UiButton>
            ) : null}
          </Toolbar>
        </UiPanel>

        <UiPanel
          title="Buy policy"
          actions={(
            <UiButton
              uiVariant="primary"
              onClick={() => runAction("settings", () => api.patch("/api/objkt-operator/settings", settings), "Buy policy saved.")}
              disabled={Boolean(busy)}
            ><Save size={15} /> Save</UiButton>
          )}
          compact
        >
          <ControlGrid>
            <Field>Spend cap (XTZ)<NumberInput type="number" min="0.1" step="0.1" value={settings.spendCapXtz} onChange={(event) => setSettings({ ...settings, spendCapXtz: Number(event.target.value) })} /></Field>
            <Field>Max item (XTZ)<NumberInput type="number" min="0.1" step="0.1" value={settings.maxItemPriceXtz} onChange={(event) => setSettings({ ...settings, maxItemPriceXtz: Number(event.target.value) })} /></Field>
            <Field>Candidate score floor<NumberInput type="number" min="0" max="100" value={settings.minCandidateScore} onChange={(event) => setSettings({ ...settings, minCandidateScore: Number(event.target.value) })} /></Field>
            <Field>Confidence floor<NumberInput type="number" min="0" max="100" value={settings.minResaleConfidence} onChange={(event) => setSettings({ ...settings, minResaleConfidence: Number(event.target.value) })} /></Field>
            <Field>Sales in 180d<NumberInput type="number" min="0" max="100" value={settings.minRecentSales180d} onChange={(event) => setSettings({ ...settings, minRecentSales180d: Number(event.target.value) })} /></Field>
            <Field>Tokens per creator<NumberInput type="number" min="3" max="50" value={settings.perCreatorLimit} onChange={(event) => setSettings({ ...settings, perCreatorLimit: Number(event.target.value) })} /></Field>
            <Field>Wallet reserve (XTZ)<NumberInput type="number" min="0" step="0.05" value={settings.walletReserveXtz} onChange={(event) => setSettings({ ...settings, walletReserveXtz: Number(event.target.value) })} /></Field>
            <Field>
              Sale reference
              <Checkbox
                checked={settings.requireSaleReference}
                label="Required"
                onChange={(event) => setSettings({ ...settings, requireSaleReference: event.currentTarget.checked })}
              />
            </Field>
          </ControlGrid>
        </UiPanel>

        <UiPanel
          title="Creator approvals"
          actions={(
            <UiButton
              uiVariant="primary"
              onClick={() => runAction("discover", () => api.post("/api/objkt-operator/discover"), "Creator review list refreshed.")}
              disabled={Boolean(busy)}
            >{busy === "discover" ? <Hourglass size={15} /> : <Search size={15} />} Discover 25</UiButton>
          )}
          compact
        >
          {state.creators.length ? (
            <CreatorList data-testid="objkt-creator-list">
              {state.creators.map((creator) => (
                <CreatorRow key={creator.address} data-testid="objkt-creator-row">
                  <CreatorIdentity>
                    {mediaUrl(creator.logo) ? <Avatar src={mediaUrl(creator.logo)} alt="" /> : <Avatar as="div" />}
                    <IdentityText>
                      <strong>{creator.alias || shortAddress(creator.address)}</strong>
                      <span title={creator.address}>{creator.address}</span>
                    </IdentityText>
                  </CreatorIdentity>
                  <Score $score={creator.score}>{creator.score}/100</Score>
                  <CreatorMeta>{creator.salesCount} sales<br />{creator.uniqueBuyers} buyers<br />{formatXtz(creator.volumeXtz)} XTZ</CreatorMeta>
                  <ReviewActions>
                    <UiButton
                      compact
                      uiVariant={creator.reviewStatus === "approved" ? "primary" : "default"}
                      onClick={() => reviewCreator(creator.address, "approved")}
                      disabled={Boolean(busy)}
                      title="Approve creator"
                    ><Check size={15} /> Approve</UiButton>
                    <UiButton
                      compact
                      uiVariant={creator.reviewStatus === "rejected" ? "danger" : "default"}
                      onClick={() => reviewCreator(creator.address, "rejected")}
                      disabled={Boolean(busy)}
                      title="Reject creator"
                    ><X size={15} /> Reject</UiButton>
                  </ReviewActions>
                  <Breakdown data-testid="objkt-creator-score-breakdown">
                    <summary>Score breakdown</summary>
                    <BreakdownGrid>
                      {(Object.entries(creator.scoreParts) as Array<[keyof typeof SCORE_LABELS, (typeof creator.scoreParts)[keyof typeof creator.scoreParts]]>).map(([key, part]) => (
                        <BreakdownCell key={key}>
                          <span>{SCORE_LABELS[key]}</span>
                          <strong>{part.score}/100</strong>
                          <span>{part.weight}% weight</span>
                          <span>+{part.contribution} pts</span>
                        </BreakdownCell>
                      ))}
                    </BreakdownGrid>
                  </Breakdown>
                </CreatorRow>
              ))}
            </CreatorList>
          ) : <Empty>No creators in review.</Empty>}
        </UiPanel>

        <UiPanel
          title="Approved market scan"
          actions={(
            <UiButton
              uiVariant="primary"
              onClick={() => runAction("scan", () => api.post("/api/objkt-operator/scan"), "Approved creators scanned.")}
              disabled={Boolean(busy) || approvedCreators.length === 0}
            >{busy === "scan" ? <Hourglass size={15} /> : <RefreshCw size={15} />} Scan</UiButton>
          )}
          compact
        >
          {state.scan?.candidates.length ? (
            <CandidateList data-testid="objkt-candidate-list">
              {state.scan.candidates.map((candidate) => {
                const quality = evaluateObjktCandidatePolicy(candidate, state.settings);
                return (
                  <CandidateRow key={candidate.id} data-testid="objkt-candidate-row">
                    {mediaUrl(candidate.thumbnailUri || candidate.displayUri) ? (
                      <CandidateMedia src={mediaUrl(candidate.thumbnailUri || candidate.displayUri)} alt="" />
                    ) : <CandidateMedia as="div" />}
                    <CandidateText>
                      <strong>{candidate.name}</strong>
                      <span>{candidate.creatorAlias || shortAddress(candidate.creatorAddress)}</span>
                      <span>{candidate.thesis}</span>
                      {!quality.eligible ? <span>Blocked: {quality.blockers.join(", ")}</span> : null}
                    </CandidateText>
                    <CandidateMetric><strong>{formatXtz(candidate.lowestAskXtz)} XTZ</strong><span>ask</span></CandidateMetric>
                    <CandidateMetric><strong>{candidate.score}/100</strong><span>score</span></CandidateMetric>
                    <CandidateMetric><strong>{candidate.resale.confidence}%</strong><span>confidence / {candidate.resale.liquidityGrade}</span></CandidateMetric>
                    <ReviewActions>
                      <UiButton onClick={() => window.open(candidate.objktUrl, "objkt-preview-tab")} title="Open asset on Objkt"><ExternalLink size={15} /></UiButton>
                      <UiButton
                        uiVariant="primary"
                        onClick={() => runAction("queue-candidate", () => api.post("/api/objkt-operator/queue", { candidateId: candidate.id }), "Candidate queued.")}
                        disabled={Boolean(busy) || !quality.eligible}
                      ><Check size={15} /> Queue</UiButton>
                    </ReviewActions>
                  </CandidateRow>
                );
              })}
            </CandidateList>
          ) : <Empty>{approvedCreators.length ? "No persisted scan results." : "Approve a creator to enable scanning."}</Empty>}
        </UiPanel>

        <UiPanel title="Signing queue" compact>
          {state.queue.length ? (
            <QueueList data-testid="objkt-signing-queue">
              {state.queue.map((item) => (
                <QueueRow key={`${item.id}:${item.queuedAt}`} data-testid="objkt-queue-row">
                  <CandidateText>
                    <strong>{item.name}</strong>
                    <span>{formatXtz(item.lowestAskXtz)} XTZ / {item.status} / {item.creatorAlias || shortAddress(item.creatorAddress)}</span>
                    {item.operationHash ? <Address>{item.operationHash}</Address> : null}
                  </CandidateText>
                  <ReviewActions>
                    {item.status === "queued" ? <UiButton uiVariant="primary" onClick={() => openCheckout(item)} disabled={Boolean(busy)}><ExternalLink size={15} /> Open Objkt</UiButton> : null}
                    {item.status === "checkout" ? <UiButton uiVariant="primary" onClick={() => updateQueue(item, "signing")} disabled={Boolean(busy)}><Wallet size={15} /> Sent to Kukai</UiButton> : null}
                    {item.status === "signing" ? (
                      <>
                        <OperationInput
                          aria-label={`Operation hash for ${item.name}`}
                          placeholder="Tezos operation hash"
                          value={operationHashes[item.id] || ""}
                          onChange={(event) => setOperationHashes({ ...operationHashes, [item.id]: event.target.value })}
                        />
                        <UiButton uiVariant="primary" onClick={() => updateQueue(item, "signed", operationHashes[item.id])} disabled={Boolean(busy)}><Check size={15} /> Record signed</UiButton>
                      </>
                    ) : null}
                    {["queued", "checkout"].includes(item.status) ? <UiButton uiVariant="danger" onClick={() => updateQueue(item, "skipped")} disabled={Boolean(busy)}><X size={15} /> Skip</UiButton> : null}
                  </ReviewActions>
                </QueueRow>
              ))}
            </QueueList>
          ) : <Empty>Queue empty.</Empty>}
        </UiPanel>

        <UiPanel title="Operator events" compact>
          {state.events.length ? (
            <EventList data-testid="objkt-operator-events">
              {state.events.map((event) => (
                <EventRow key={event.id}>
                  <span>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <strong>{event.type}</strong>
                  <span>{event.message}</span>
                </EventRow>
              ))}
            </EventList>
          ) : <Empty>No operator events yet.</Empty>}
        </UiPanel>
      </Shell>
    </AppWindow>
  );
}
