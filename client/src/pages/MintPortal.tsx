import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Separator, Tab, TabBody, Tabs, TextInput } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { getNetwork, mintOpenEditionFromWtf } from "../lib/tezos";
import { useWallet } from "../lib/wallet-context";
import { GenerativeArtPanel } from "../features/mint-portal/GenerativeArtPanel";

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Muted = styled.span`
  color: #555;
  font-size: 12px;
`;

const TagChip = styled.code`
  background: #f5f5dc;
  border: 1px solid #8b7d6b;
  padding: 1px 6px;
  font-size: 12px;
`;

const StatusBadge = styled.span<{ $tone: "ok" | "pending" | "muted" }>`
  display: inline-block;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: bold;
  background: ${(p) =>
    p.$tone === "ok"
      ? "#2e7d32"
      : p.$tone === "pending"
        ? "#cc5500"
        : "#555"};
  color: white;
`;

const ChallengeCard = styled(GroupBox)`
  margin-bottom: 12px;
`;

type Submission = {
  id: number;
  challengeId: number;
  submittedAt: string;
  grade: number | null;
  rewardDistributed: boolean;
  source: string;
  mintTokenContract: string | null;
  mintTokenId: string | null;
  mintOpHash: string | null;
  contentUrl: string | null;
};

type MintChallenge = {
  id: number;
  roundId: number | null;
  title: string;
  description: string;
  status: "draft" | "active" | "grading" | "completed";
  deadline: string | null;
  rewardAmountWtf: number;
  rewardXp: number;
  submissionContract: string | null;
  submissionTag: string | null;
  submissionCuration: string | null;
  roundTitle: string | null;
  seasonId: number | null;
  seasonTitle: string | null;
  mySubmissions: Submission[];
};

type MintPortalResponse = {
  challenges: MintChallenge[];
  wallet: { count: number; addresses: string[] };
};

type MintContract = {
  id: number;
  name: string;
  address: string;
  network: "ghostnet" | "shadownet" | "mainnet";
  opHash: string | null;
  deployedAt: string | null;
};

type MintContractsResponse = {
  contracts: MintContract[];
};

function copyToClipboard(value: string): Promise<void> {
  if (!navigator?.clipboard) {
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }
  return navigator.clipboard.writeText(value);
}

function formatDeadline(iso: string | null): string {
  if (!iso) return "no deadline";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleString();
}

function SubmissionRow({ s }: { s: Submission }) {
  const tone: "ok" | "pending" | "muted" =
    s.rewardDistributed || (s.grade !== null && s.grade > 0)
      ? "ok"
      : s.grade === null
        ? "pending"
        : "muted";
  const label =
    s.source === "mint_auto" ? "Auto (mint)" : s.source || "Manual";
  return (
    <Row>
      <StatusBadge $tone={tone}>
        {s.grade !== null ? `graded ${s.grade}` : "awaiting review"}
      </StatusBadge>
      <Muted>{label}</Muted>
      {s.mintTokenContract && s.mintTokenId ? (
        <Muted>
          {s.mintTokenContract}/{s.mintTokenId}
        </Muted>
      ) : null}
      <Muted>{new Date(s.submittedAt).toLocaleString()}</Muted>
      {s.mintOpHash ? (
        <a
          href={`https://tzkt.io/${s.mintOpHash}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          op
        </a>
      ) : null}
    </Row>
  );
}

export function MintPortal() {
  const { user } = useAuth();
  const wallet = useWallet();
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const [mintNetwork] = useState(() => getNetwork());
  const [mintContract, setMintContract] = useState("");
  const [mintTokenId, setMintTokenId] = useState("0");
  const [mintQty, setMintQty] = useState("1");
  const [mintPriceMutez, setMintPriceMutez] = useState("0");
  const [recordChallengeId, setRecordChallengeId] = useState("");

  const portalQuery = useQuery<MintPortalResponse>({
    queryKey: ["mint-portal"],
    queryFn: () => api.get<MintPortalResponse>("/api/mint-portal/challenges"),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  const contractsQuery = useQuery<MintContractsResponse>({
    queryKey: ["mint-portal-contracts", mintNetwork],
    queryFn: () =>
      api.get<MintContractsResponse>(
        `/api/mint-portal/contracts?network=${encodeURIComponent(mintNetwork)}`
      ),
    enabled: Boolean(user),
  });

  const matchMutation = useMutation({
    mutationFn: () =>
      api.post<{
        ok: boolean;
        mintsScanned: number;
        submissionsCreated: number;
        bindingsActive: number;
      }>("/api/mint-portal/match", { lookbackHours: 6 }),
    onSuccess: (result) => {
      setSyncStatus(
        `Scanned ${result.mintsScanned} mint(s); created ${result.submissionsCreated} new submission(s).`
      );
      qc.invalidateQueries({ queryKey: ["mint-portal"] });
    },
    onError: (err: Error) => {
      setSyncStatus(`Sync failed: ${err.message}`);
    },
  });

  const challenges = portalQuery.data?.challenges ?? [];
  const byStatus = useMemo(() => {
    const active = challenges.filter((c) => c.status === "active");
    const grading = challenges.filter((c) => c.status === "grading");
    return { active, grading };
  }, [challenges]);
  const contractOptions = contractsQuery.data?.contracts ?? [];
  const directMintChallenges = useMemo(
    () => challenges.filter((c) => c.status === "active" && c.submissionContract),
    [challenges]
  );

  useEffect(() => {
    if (!mintContract && directMintChallenges[0]?.submissionContract) {
      setMintContract(directMintChallenges[0].submissionContract);
      setRecordChallengeId(String(directMintChallenges[0].id));
      return;
    }
    if (!mintContract && contractOptions[0]?.address) {
      setMintContract(contractOptions[0].address);
    }
  }, [contractOptions, directMintChallenges, mintContract]);

  const mintMutation = useMutation({
    mutationFn: async () => {
      const connected = wallet.address ? { address: wallet.address } : await wallet.connect();
      const opHash = await mintOpenEditionFromWtf({
        contractAddress: mintContract,
        tokenId: mintTokenId,
        qty: mintQty,
        priceMutez: mintPriceMutez,
        walletAddress: connected.address,
      });
      if (recordChallengeId) {
        await api.post("/api/mint-portal/record-mint", {
          challengeId: Number(recordChallengeId),
          tokenContract: mintContract,
          tokenId: mintTokenId,
          opHash,
        });
      }
      return { opHash };
    },
    onSuccess: ({ opHash }) => {
      setMintStatus(`Mint submitted: ${opHash}`);
      qc.invalidateQueries({ queryKey: ["mint-portal"] });
    },
    onError: (err: Error) => {
      setMintStatus(`Mint failed: ${err.message}`);
    },
  });

  async function handleCopy(value: string | null, key: string) {
    if (!value) return;
    try {
      await copyToClipboard(value);
      setCopied(key);
      setTimeout(() => setCopied((prev) => (prev === key ? null : prev)), 1500);
    } catch {
      /* swallow; user can long-press to copy on their own */
    }
  }

  if (!user) {
    return (
      <AppWindow title="Mint Portal">
        <Stack>
          <p>Log in to use the Mint Portal.</p>
        </Stack>
      </AppWindow>
    );
  }

  const [activeTab, setActiveTab] = useState(0);

  return (
    <AppWindow title="Mint Portal">
      <Tabs value={activeTab} onChange={(v) => setActiveTab(v as number)}>
        <Tab value={0}>Challenges</Tab>
        <Tab value={1}>Generative Art</Tab>
      </Tabs>
      <TabBody>
      {activeTab === 1 && (
        <div style={{ padding: "8px 0" }}>
          <GenerativeArtPanel />
        </div>
      )}
      {activeTab === 0 && (
      <Stack>
        <GroupBox label="What is this?">
          <p style={{ margin: 0 }}>
            Active challenges with a mint binding show up here. Mint the
            required token with the shown <TagChip>submission tag</TagChip>{" "}
            (and, where specified, on the shown contract or curation) and the
            portal will auto-create your challenge submission once your
            wallet event is indexed.
          </p>
          <Separator />
          <Row>
            <Button
              onClick={() => matchMutation.mutate()}
              disabled={matchMutation.isPending}
            >
              {matchMutation.isPending
                ? "Syncing..."
                : "Check my recent mints"}
            </Button>
            <Muted>
              Wallets linked: {portalQuery.data?.wallet.count ?? 0}
            </Muted>
            {syncStatus ? <Muted>{syncStatus}</Muted> : null}
          </Row>
        </GroupBox>

        <GroupBox label="Mint from WTF">
          <Stack>
            <Row>
              <Muted>Network: {mintNetwork}</Muted>
              <Muted>
                Wallet:{" "}
                {wallet.address
                  ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`
                  : "not connected"}
              </Muted>
              <Muted>Provider: {wallet.providerName || "none"}</Muted>
            </Row>
            <Row>
              <label style={{ fontSize: 12 }}>Challenge</label>
              <select
                value={recordChallengeId}
                onChange={(event) => {
                  const id = event.target.value;
                  setRecordChallengeId(id);
                  const selected = directMintChallenges.find((c) => String(c.id) === id);
                  if (selected?.submissionContract) setMintContract(selected.submissionContract);
                }}
              >
                <option value="">Standalone mint</option>
                {directMintChallenges.map((challenge) => (
                  <option key={challenge.id} value={challenge.id}>
                    {challenge.title}
                  </option>
                ))}
              </select>
            </Row>
            <Row>
              <label style={{ fontSize: 12 }}>Contract</label>
              <select value={mintContract} onChange={(event) => setMintContract(event.target.value)}>
                {mintContract ? null : <option value="">Select contract</option>}
                {contractOptions.map((contract) => (
                  <option key={contract.id} value={contract.address}>
                    {contract.name} ({contract.address})
                  </option>
                ))}
                {mintContract && !contractOptions.some((c) => c.address === mintContract) ? (
                  <option value={mintContract}>{mintContract}</option>
                ) : null}
              </select>
            </Row>
            <Row>
              <label style={{ fontSize: 12 }}>Token</label>
              <TextInput value={mintTokenId} onChange={(event) => setMintTokenId(event.target.value)} width={90} />
              <label style={{ fontSize: 12 }}>Qty</label>
              <TextInput value={mintQty} onChange={(event) => setMintQty(event.target.value)} width={70} />
              <label style={{ fontSize: 12 }}>Price mutez</label>
              <TextInput value={mintPriceMutez} onChange={(event) => setMintPriceMutez(event.target.value)} width={130} />
              <Button
                onClick={() => mintMutation.mutate()}
                disabled={
                  mintMutation.isPending ||
                  wallet.isConnecting ||
                  !mintContract ||
                  !/^[0-9]+$/.test(mintTokenId) ||
                  !/^[1-9][0-9]*$/.test(mintQty) ||
                  !/^[0-9]+$/.test(mintPriceMutez)
                }
              >
                {mintMutation.isPending || wallet.isConnecting ? "Minting..." : "Mint"}
              </Button>
            </Row>
            {mintStatus ? <Muted>{mintStatus}</Muted> : null}
            {contractsQuery.isLoading ? <Muted>Loading WTF mint contracts...</Muted> : null}
          </Stack>
        </GroupBox>

        {portalQuery.isLoading ? (
          <Row>
            <Hourglass size={24} />
            <Muted>Loading challenges...</Muted>
          </Row>
        ) : null}
        {portalQuery.error ? (
          <p>
            Failed to load challenges:{" "}
            {(portalQuery.error as Error).message}
          </p>
        ) : null}

        {challenges.length === 0 && !portalQuery.isLoading ? (
          <GroupBox label="Nothing minted-bound yet">
            <p style={{ margin: 0 }}>
              No active challenges currently require a mint. Host-created
              challenges with a submission tag, contract, or curation will
              appear here the moment they go active.
            </p>
          </GroupBox>
        ) : null}

        {byStatus.active.length > 0 ? (
          <h3 style={{ margin: "6px 0" }}>Active challenges</h3>
        ) : null}
        {byStatus.active.map((c) => (
          <ChallengeCard key={c.id} label={c.title}>
            <Stack>
              <Row>
                {c.seasonTitle ? <Muted>{c.seasonTitle}</Muted> : null}
                {c.roundTitle ? <Muted>Round: {c.roundTitle}</Muted> : null}
                <Muted>Deadline: {formatDeadline(c.deadline)}</Muted>
                <Muted>
                  Reward: {c.rewardAmountWtf} WTF + {c.rewardXp} XP
                </Muted>
              </Row>
              <p style={{ margin: 0 }}>{c.description}</p>
              {c.submissionTag ? (
                <Row>
                  <b>Submission tag:</b>
                  <TagChip>#{c.submissionTag}</TagChip>
                  <Button
                    size="sm"
                    onClick={() => handleCopy(c.submissionTag, `tag-${c.id}`)}
                  >
                    {copied === `tag-${c.id}` ? "Copied!" : "Copy"}
                  </Button>
                </Row>
              ) : null}
              {c.submissionContract ? (
                <Row>
                  <b>Target contract:</b>
                  <TagChip>{c.submissionContract}</TagChip>
                  <Button
                    size="sm"
                    onClick={() =>
                      handleCopy(c.submissionContract, `contract-${c.id}`)
                    }
                  >
                    {copied === `contract-${c.id}` ? "Copied!" : "Copy"}
                  </Button>
                </Row>
              ) : null}
              {c.submissionCuration ? (
                <Row>
                  <b>Curation slug:</b>
                  <TagChip>{c.submissionCuration}</TagChip>
                  <Button
                    size="sm"
                    onClick={() =>
                      handleCopy(c.submissionCuration, `cur-${c.id}`)
                    }
                  >
                    {copied === `cur-${c.id}` ? "Copied!" : "Copy"}
                  </Button>
                </Row>
              ) : null}
              <Separator />
              {c.mySubmissions.length === 0 ? (
                <Muted>
                  No submissions yet. Once you mint the binding token, the
                  watcher will link it here automatically.
                </Muted>
              ) : (
                <Stack>
                  <b>Your submissions</b>
                  {c.mySubmissions.map((s) => (
                    <SubmissionRow key={s.id} s={s} />
                  ))}
                </Stack>
              )}
            </Stack>
          </ChallengeCard>
        ))}

        {byStatus.grading.length > 0 ? (
          <h3 style={{ margin: "6px 0" }}>In grading</h3>
        ) : null}
        {byStatus.grading.map((c) => (
          <ChallengeCard key={c.id} label={c.title}>
            <Stack>
              <Row>
                <Muted>
                  Grading — no new submissions; showing your existing entries.
                </Muted>
              </Row>
              {c.mySubmissions.length === 0 ? (
                <Muted>No submission recorded for this challenge.</Muted>
              ) : (
                c.mySubmissions.map((s) => (
                  <SubmissionRow key={s.id} s={s} />
                ))
              )}
            </Stack>
          </ChallengeCard>
        ))}
      </Stack>
      )}
      </TabBody>
    </AppWindow>
  );
}

export default MintPortal;
