import { useMemo, useState } from "react";
import { styled } from "styled-components";
import {
  Archive,
  ExternalLink,
  FileText,
  RefreshCcw,
  RotateCcw,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { useWindowManager } from "../../lib/window-context";
import {
  useIpfsPinningOverview,
  useRetryPinningJob,
  useSavePinPolicy,
  type IpfsPinningOverview,
} from "./useIpfsPinning";
import { usePresentationShell } from "../../lib/presentation-shell";

type BackupMode = "wallet_full" | "wallet_collection" | "token";

export function IpfsPinningManager({ legacyMode }: { legacyMode?: "setup" | "dashboard" }) {
  const wm = useWindowManager();
  const presentation = usePresentationShell();
  const overviewQ = useIpfsPinningOverview();
  const savePolicy = useSavePinPolicy();
  const retryJob = useRetryPinningJob();
  const [mode, setMode] = useState<BackupMode>("wallet_full");
  const [walletAddress, setWalletAddress] = useState("");
  const [includeFuture, setIncludeFuture] = useState(true);
  const [publicDiscovery, setPublicDiscovery] = useState(true);
  const [ackPublic, setAckPublic] = useState(false);

  const overview = overviewQ.data;
  const submitDisabled =
    !overview?.role.canUsePinning ||
    !overview.prerequisites.hasActivePdsRepo ||
    !overview.prerequisites.hasWtfosSite ||
    overview.prerequisites.siteSuspended ||
    !walletAddress.trim() ||
    !ackPublic ||
    savePolicy.isPending ||
    mode !== "wallet_full";

  const estimate = useMemo(() => {
    const jobs = overview?.jobs ?? [];
    return {
      discovered: jobs.filter((job) => job.source === "wallet_scan").length,
      pinned: jobs.filter((job) => job.status === "pinned").length,
      queued: jobs.filter((job) => job.status === "queued" || job.status === "staged").length,
      failed: jobs.filter((job) => job.status === "failed").length,
    };
  }, [overview]);

  return (
    <Shell
      data-ipfs-pinning-surface="manager"
      data-ipfs-pinning-presentation-host={presentation.host}
      data-ipfs-pinning-mode={legacyMode ?? "manager"}
      data-ipfs-pinning-region="shell"
    >
      <Header data-ipfs-pinning-region="header">
        <TitleBlock data-ipfs-pinning-region="title-block">
          <Kicker data-ipfs-pinning-region="kicker">{legacyMode ? "Porcupin alias" : "wtfOS organ"}</Kicker>
          <h1>IPFS Pinning Manager</h1>
          <p>
            Hosted Porcupin, Hetzner Object Storage, and public PDS pin records for Tezos media preservation.
          </p>
        </TitleBlock>
        <HeaderActions data-ipfs-pinning-region="header-actions">
          <IconButton data-ipfs-pinning-region="icon-button" onClick={() => overviewQ.refetch()} title="Refresh pinning status">
            <RefreshCcw size={16} />
          </IconButton>
          <IconButton data-ipfs-pinning-region="icon-button" onClick={() => wm.openPage("/wtf-subdomains")} title="Open WTF Domains">
            <ExternalLink size={16} />
          </IconButton>
        </HeaderActions>
      </Header>

      {overviewQ.isLoading ? (
        <Loading data-ipfs-pinning-region="loading">Loading pinning manager...</Loading>
      ) : overviewQ.isError || !overview ? (
        <Notice data-ipfs-pinning-region="notice" $tone="danger">Could not load the pinning manager.</Notice>
      ) : (
        <>
          {!overview.role.canUsePinning && (
            <Notice data-ipfs-pinning-region="notice" $tone="locked">
              <ShoppingBag size={18} />
              <span>
                WTF Pin Collector is required for hosted pinning. The market pass grants only pinning access.
              </span>
              <TextButton data-ipfs-pinning-region="text-button" onClick={() => wm.openPage("/wtfiam?category=preservation")}>
                <ShoppingBag size={15} />
                Market
              </TextButton>
            </Notice>
          )}

          <StatusGrid data-ipfs-pinning-region="status-grid">
            <StatusTile label="Role" value={overview.role.canUsePinning ? "Pin Collector ready" : "Locked"} tone={overview.role.canUsePinning ? "ok" : "warn"} />
            <StatusTile label="PDS repo" value={overview.prerequisites.hasActivePdsRepo ? overview.pds?.repoDid || "active" : "setup needed"} tone={overview.prerequisites.hasActivePdsRepo ? "ok" : "warn"} />
            <StatusTile label="Pin home" value={overview.site?.host || "claim wtfos.me"} tone={overview.site?.host && !overview.prerequisites.siteSuspended ? "ok" : "warn"} />
            <StatusTile label="Provider" value={overview.provider.health} tone={overview.provider.health === "configured" ? "ok" : "warn"} />
            <StatusTile label="S3" value={overview.storage.s3Access.ok ? overview.storage.s3Access.bucket || "connected" : "not ready"} tone={overview.storage.s3Access.ok ? "ok" : "warn"} />
            <StatusTile label="Storage Box" value={overview.storage.storageBoxMirror.configured ? "manifest mirror" : "manifest mirror off"} tone="neutral" />
          </StatusGrid>

          <MainGrid data-ipfs-pinning-region="main-grid">
            <Section data-ipfs-pinning-region="section">
              <SectionHeader data-ipfs-pinning-region="section-header">
                <Wallet size={18} />
                <h2>Wallet Backup</h2>
              </SectionHeader>
              <ModeRow data-ipfs-pinning-region="mode-row">
                <ModeButton data-ipfs-pinning-region="mode-button" $active={mode === "wallet_full"} onClick={() => setMode("wallet_full")}>Whole wallet</ModeButton>
                <ModeButton data-ipfs-pinning-region="mode-button" $active={mode === "wallet_collection"} onClick={() => setMode("wallet_collection")}>Selected collection</ModeButton>
                <ModeButton data-ipfs-pinning-region="mode-button" $active={mode === "token"} onClick={() => setMode("token")}>Selected item</ModeButton>
              </ModeRow>
              {mode !== "wallet_full" && (
                <Notice data-ipfs-pinning-region="notice" $tone="neutral">Selected collection and item flows use the same PDS record contracts and will attach to this manager next.</Notice>
              )}
              <Field data-ipfs-pinning-region="field">
                <label>Wallet address</label>
                <input
                  value={walletAddress}
                  onChange={(event) => setWalletAddress(event.target.value)}
                  placeholder="tz1..."
                />
              </Field>
              <CheckRow data-ipfs-pinning-region="check-row">
                <input
                  type="checkbox"
                  checked={includeFuture}
                  onChange={(event) => setIncludeFuture(event.target.checked)}
                />
                <span>Keep future scans enabled for this wallet.</span>
              </CheckRow>
              <CheckRow data-ipfs-pinning-region="check-row">
                <input
                  type="checkbox"
                  checked={publicDiscovery}
                  onChange={(event) => setPublicDiscovery(event.target.checked)}
                />
                <span>Publish the well-known pointer at the wtfos.me host.</span>
              </CheckRow>
              <Disclosure data-ipfs-pinning-region="disclosure">
                <input
                  type="checkbox"
                  checked={ackPublic}
                  onChange={(event) => setAckPublic(event.target.checked)}
                />
                <span>
                  I understand pin policies, manifests, and item records are public AT records in my wtfos.me PDS.
                </span>
              </Disclosure>
              {!overview.prerequisites.hasActivePdsRepo || !overview.prerequisites.hasWtfosSite ? (
                <Notice data-ipfs-pinning-region="notice" $tone="warn">
                  Broad wallet backup needs an active wtfos.me repo and host before publishing pin records.
                  <TextButton data-ipfs-pinning-region="text-button" onClick={() => wm.openPage("/wtf-subdomains/setup")}>
                    <ExternalLink size={15} />
                    Setup
                  </TextButton>
                </Notice>
              ) : null}
              <PrimaryButton data-ipfs-pinning-region="primary-button" disabled={submitDisabled} onClick={() => {
                savePolicy.mutate({
                  scopeType: "wallet_full",
                  scopeRef: walletAddress.trim(),
                  walletAddress: walletAddress.trim(),
                  sourceChain: "tezos",
                  includeExisting: true,
                  includeFuture,
                  publicDiscovery,
                });
              }}>
                <Archive size={16} />
                Enable Wallet Backup
              </PrimaryButton>
              {savePolicy.isError && <Notice data-ipfs-pinning-region="notice" $tone="danger">{savePolicy.error.message}</Notice>}
              {savePolicy.isSuccess && <Notice data-ipfs-pinning-region="notice" $tone="ok">Wallet backup policy queued for PDS publishing.</Notice>}
            </Section>

            <Section data-ipfs-pinning-region="section">
              <SectionHeader data-ipfs-pinning-region="section-header">
                <FileText size={18} />
                <h2>PDS And Restore</h2>
              </SectionHeader>
              <DetailList data-ipfs-pinning-region="detail-list">
                <dt>Repo DID</dt>
                <dd>{overview.pds?.repoDid || "No active repo"}</dd>
                <dt>Host</dt>
                <dd>{overview.site?.host || "No wtfos.me host"}</dd>
                <dt>Aliases</dt>
                <dd>{overview.subdomainRefs.map((ref) => ref.host).join(", ") || "None"}</dd>
                <dt>Well-known</dt>
                <dd>{overview.site?.wellKnownUrl || "Unavailable"}</dd>
                <dt>Quota</dt>
                <dd>{formatBytes(overview.quota.usedBytes)} / {formatBytes(overview.quota.quotaBytes)}</dd>
              </DetailList>
              <CounterGrid data-ipfs-pinning-region="counter-grid">
                <MiniCounter label="Discovered" value={estimate.discovered} />
                <MiniCounter label="Pinned" value={estimate.pinned} />
                <MiniCounter label="Queued" value={estimate.queued} />
                <MiniCounter label="Failed" value={estimate.failed} />
              </CounterGrid>
            </Section>
          </MainGrid>

          <Section data-ipfs-pinning-region="section">
            <SectionHeader data-ipfs-pinning-region="section-header">
              <Archive size={18} />
              <h2>Jobs</h2>
            </SectionHeader>
            <JobTable overview={overview} retryJob={(id) => retryJob.mutate(id)} retrying={retryJob.isPending} />
          </Section>

          <FooterStrip data-ipfs-pinning-region="footer">
            <span>Hosted cache root: {overview.provider.storageRoot}</span>
            <TextButton data-ipfs-pinning-region="text-button" onClick={() => wm.openPage("/apps/porcupin-setup")}>
              <ExternalLink size={15} />
              Own-node setup
            </TextButton>
          </FooterStrip>
        </>
      )}
    </Shell>
  );
}

function JobTable({ overview, retryJob, retrying }: {
  overview: IpfsPinningOverview;
  retryJob: (id: number) => void;
  retrying: boolean;
}) {
  const jobs = overview.jobs.slice(0, 12);
  if (jobs.length === 0) return <Empty data-ipfs-pinning-region="empty-state">No pinning jobs yet.</Empty>;
  return (
    <Table data-ipfs-pinning-region="job-table">
      <thead>
        <tr>
          <th>CID</th>
          <th>Source</th>
          <th>Status</th>
          <th>Provider</th>
          <th>Bytes</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job.id}>
            <td className="mono">{job.cid || job.fileName || `job-${job.id}`}</td>
            <td>{job.source}</td>
            <td>{job.status}</td>
            <td>{job.providerKey}</td>
            <td>{formatBytes(Number(job.byteSize || 0))}</td>
            <td>
              {job.status === "failed" ? (
                <IconButton data-ipfs-pinning-region="icon-button" disabled={retrying} onClick={() => retryJob(Number(job.id))} title="Retry pin">
                  <RotateCcw size={15} />
                </IconButton>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function StatusTile({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "danger" | "neutral" }) {
  return (
    <Tile data-ipfs-pinning-region="status-tile" $tone={tone}>
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </Tile>
  );
}

function MiniCounter({ label, value }: { label: string; value: number }) {
  return (
    <Counter data-ipfs-pinning-region="counter">
      <strong>{value}</strong>
      <span>{label}</span>
    </Counter>
  );
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = value;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx++;
  }
  return `${n >= 10 || idx === 0 ? Math.round(n) : n.toFixed(1)} ${units[idx]}`;
}

const Shell = styled.div`
  min-height: 100%;
  padding: 18px;
  color: #121212;
  background: #f4f7f5;
  display: grid;
  gap: 14px;
  align-content: start;

  &[data-ipfs-pinning-presentation-host="gamma"] {
    padding: 4px;
    background: #070706;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-ipfs-pinning-presentation-host="gamma"] [data-ipfs-pinning-region] {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-ipfs-pinning-presentation-host="gamma"] button,
  &[data-ipfs-pinning-presentation-host="gamma"] input {
    font-family: inherit;
  }
`;

const gammaIpfsScope = `[data-ipfs-pinning-presentation-host="gamma"]`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  ${gammaIpfsScope} & {
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    padding: 10px;
    background: rgba(12, 12, 11, 0.86);
  }
`;

const TitleBlock = styled.div`
  h1 {
    margin: 2px 0 4px;
    font-size: 28px;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    max-width: 760px;
    color: #46534d;
  }

  ${gammaIpfsScope} & h1 {
    color: #f2ead9;
    font-size: clamp(22px, 4vw, 28px);
  }

  ${gammaIpfsScope} & p {
    color: rgba(242, 234, 217, 0.72);
  }
`;

const Kicker = styled.div`
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 800;
  color: #1f7a5b;

  ${gammaIpfsScope} & {
    color: #00d2ff;
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
    letter-spacing: 0;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
`;

const IconButton = styled.button`
  width: 34px;
  height: 34px;
  display: inline-grid;
  place-items: center;
  border: 1px solid #1d2b24;
  background: #ffffff;
  color: #111;
  cursor: pointer;

  ${gammaIpfsScope} & {
    border: 1px solid rgba(0, 210, 255, 0.58);
    border-radius: 6px;
    background: #11110f;
    color: #00d2ff;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;

const TextButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  border: 1px solid #1d2b24;
  background: #ffffff;
  color: #111;
  font-weight: 800;
  cursor: pointer;

  ${gammaIpfsScope} & {
    border: 1px solid rgba(0, 210, 255, 0.58);
    border-radius: 6px;
    background: #11110f;
    color: #00d2ff;
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  border: 2px solid #0f221a;
  background: #1f7a5b;
  color: #fff;
  font-weight: 900;
  cursor: pointer;

  ${gammaIpfsScope} & {
    border: 1px solid rgba(0, 210, 255, 0.68);
    border-radius: 6px;
    background: #00d2ff;
    color: #070706;
  }

  &:disabled {
    background: #b8c3bd;
    color: #516159;
    cursor: default;
  }
`;

const Loading = styled.div`
  padding: 32px;
  background: #fff;
  border: 1px solid #d8e0dc;

  ${gammaIpfsScope} & {
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #11110f;
    color: #f2ead9;
  }
`;

const Notice = styled.div<{ $tone: "ok" | "warn" | "danger" | "locked" | "neutral" }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid
    ${({ $tone }) =>
      $tone === "danger" ? "#8d1f28" : $tone === "ok" ? "#1f7a5b" : $tone === "locked" ? "#9a6b1a" : "#9aa6a0"};
  background: ${({ $tone }) =>
    $tone === "danger" ? "#fff0f1" : $tone === "ok" ? "#eefaf3" : $tone === "locked" ? "#fff8e8" : "#ffffff"};

  ${gammaIpfsScope} & {
    border: 1px solid ${({ $tone }) => ($tone === "danger" ? "rgba(255, 116, 116, 0.72)" : "rgba(242, 234, 217, 0.2)")};
    border-radius: 6px;
    background: #11110f;
    color: #f2ead9;
  }
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const Tile = styled.div<{ $tone: "ok" | "warn" | "danger" | "neutral" }>`
  min-height: 74px;
  padding: 10px;
  border: 1px solid ${({ $tone }) => ($tone === "ok" ? "#1f7a5b" : $tone === "danger" ? "#8d1f28" : "#9aa6a0")};
  background: #ffffff;
  display: grid;
  align-content: center;
  gap: 5px;

  ${gammaIpfsScope} & {
    border: 1px solid ${({ $tone }) => ($tone === "danger" ? "rgba(255, 116, 116, 0.72)" : $tone === "ok" ? "rgba(0, 210, 255, 0.54)" : "rgba(242, 234, 217, 0.18)")};
    border-radius: 6px;
    background: #11110f;
    color: #f2ead9;
  }

  span {
    color: #59655f;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  ${gammaIpfsScope} & span {
    color: rgba(242, 234, 217, 0.64);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
    letter-spacing: 0;
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }

  ${gammaIpfsScope} & strong {
    color: #f2ead9;
  }
`;

const MainGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 14px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Section = styled.section`
  background: #ffffff;
  border: 1px solid #d8e0dc;
  padding: 14px;
  display: grid;
  gap: 12px;

  ${gammaIpfsScope} & {
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #11110f;
  }
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  h2 {
    margin: 0;
    font-size: 18px;
    letter-spacing: 0;
  }

  ${gammaIpfsScope} & {
    color: #00d2ff;
  }

  ${gammaIpfsScope} & h2 {
    color: #f2ead9;
  }
`;

const ModeRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const ModeButton = styled.button<{ $active: boolean }>`
  min-height: 34px;
  border: 1px solid #1d2b24;
  background: ${({ $active }) => ($active ? "#111" : "#f8faf9")};
  color: ${({ $active }) => ($active ? "#fff" : "#111")};
  font-weight: 800;
  cursor: pointer;

  ${gammaIpfsScope} & {
    border: 1px solid ${({ $active }) => ($active ? "rgba(0, 210, 255, 0.8)" : "rgba(242, 234, 217, 0.2)")};
    border-radius: 6px;
    background: ${({ $active }) => ($active ? "rgba(0, 210, 255, 0.14)" : "#11110f")};
    color: ${({ $active }) => ($active ? "#00d2ff" : "#f2ead9")};
  }
`;

const Field = styled.div`
  display: grid;
  gap: 5px;

  label {
    font-weight: 800;
    font-size: 12px;
    text-transform: uppercase;
  }

  ${gammaIpfsScope} & label {
    color: rgba(242, 234, 217, 0.76);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
    letter-spacing: 0;
  }

  input {
    min-height: 38px;
    border: 1px solid #99a7a0;
    padding: 0 10px;
    font: inherit;
  }

  ${gammaIpfsScope} & input {
    border: 1px solid rgba(242, 234, 217, 0.24);
    border-radius: 6px;
    background: #070706;
    color: #f2ead9;
  }
`;

const CheckRow = styled.label`
  display: flex;
  gap: 8px;
  align-items: center;

  ${gammaIpfsScope} & {
    color: rgba(242, 234, 217, 0.82);
  }
`;

const Disclosure = styled(CheckRow)`
  padding: 10px;
  border: 1px solid #9a6b1a;
  background: #fff8e8;
  align-items: flex-start;

  ${gammaIpfsScope} & {
    border: 1px solid rgba(242, 234, 217, 0.24);
    border-radius: 6px;
    background: #0d0d0c;
  }
`;

const DetailList = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 8px 12px;

  dt {
    color: #59655f;
    font-weight: 800;
  }

  ${gammaIpfsScope} & dt {
    color: rgba(242, 234, 217, 0.62);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  ${gammaIpfsScope} & dd {
    color: #f2ead9;
  }
`;

const CounterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
`;

const Counter = styled.div`
  border: 1px solid #d8e0dc;
  padding: 8px;
  display: grid;
  gap: 3px;
  text-align: center;

  strong {
    font-size: 20px;
  }

  span {
    color: #59655f;
    font-size: 12px;
  }

  ${gammaIpfsScope} & {
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    background: #0d0d0c;
  }

  ${gammaIpfsScope} & strong {
    color: #00d2ff;
  }

  ${gammaIpfsScope} & span {
    color: rgba(242, 234, 217, 0.66);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;

  th,
  td {
    border-bottom: 1px solid #d8e0dc;
    padding: 8px 6px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  th {
    font-size: 12px;
    text-transform: uppercase;
    color: #59655f;
  }

  ${gammaIpfsScope} & {
    color: #f2ead9;
  }

  ${gammaIpfsScope} & th,
  ${gammaIpfsScope} & td {
    border-bottom: 1px solid rgba(242, 234, 217, 0.16);
  }

  ${gammaIpfsScope} & th {
    color: rgba(242, 234, 217, 0.62);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
    letter-spacing: 0;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
`;

const Empty = styled.div`
  padding: 16px;
  border: 1px dashed #aeb9b3;
  color: #59655f;

  ${gammaIpfsScope} & {
    border: 1px dashed rgba(242, 234, 217, 0.26);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.72);
  }
`;

const FooterStrip = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #d8e0dc;
  background: #fff;
  color: #46534d;

  ${gammaIpfsScope} & {
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #11110f;
    color: rgba(242, 234, 217, 0.72);
  }

  @media (max-width: 700px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;
