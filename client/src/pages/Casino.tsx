import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, GroupBox, Hourglass, Panel } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import {
  presentationRouteHref,
  usePresentationShell,
} from "../lib/presentation-shell";
import { purchaseCasinoMembership } from "../lib/tezos";
import { useWallet } from "../lib/wallet-context";
import { useWindowManager } from "../lib/window-context";

type CasinoStatus = {
  userId: number;
  appPass: {
    sku: string;
    owned: boolean;
    quantity: number;
    marketCategory: "casino";
  };
  membership: {
    active: boolean;
    expiresAt: string | null;
    walletAddress: string | null;
    purchaseRef: string | null;
  };
  canEnter: boolean;
  wageringEnabled: false;
  config: {
    network: string;
    contractAddress: string | null;
    treasuryAddress: string;
    feeMutez: number;
    feeTez: string;
    durationDays: number;
    configured: boolean;
  };
};

type CasinoGame = {
  key: string;
  title: string;
  tagline?: string;
  summary?: string;
  mode: string;
  status: string;
  tableKind?: string;
  wagerAsset?: string;
  wageringEnabled?: false;
  minPlayers: number;
  maxPlayers: number | null;
  defaultHouseTakeBps: number;
  requiredContracts?: string[];
  highlights?: string[];
  subdomains?: string[];
};

type CasinoIntentResponse = {
  ok: boolean;
  intent: {
    purchaseRef: string;
    contractAddress: string | null;
    feeMutez: number;
    feeTez: string;
    expiresAt: string;
  };
};

type CasinoPracticeGame = {
  id: number;
  slug: string;
  creatorUserId: number;
  creatorName: string;
  title: string;
  summary: string;
  instructions: string;
  outcomes: string[];
  status: "submitted" | "approved" | "rejected";
  active: boolean;
  moderationNote: string | null;
  playCount: number;
  practiceOnly: true;
  wageringEnabled: false;
  rewardsEnabled: false;
  currency: null;
};

type CasinoPracticeResponse = {
  games: CasinoPracticeGame[];
  mine: CasinoPracticeGame[];
  moderationQueue: CasinoPracticeGame[];
  canModerate: boolean;
  practiceOnly: true;
  wageringEnabled: false;
  rewardsEnabled: false;
};

const gammaCasinoScope = `[data-casino-presentation-host="gamma"]`;

const Shell = styled.div`
  min-height: 100%;
  background:
    linear-gradient(90deg, rgba(255, 214, 107, 0.22), transparent 24%),
    linear-gradient(180deg, #14261f 0%, #0d1514 100%);
  color: #f7eed4;
  padding: 10px;

  &[data-casino-presentation-host="gamma"] {
    background: #080807;
    border: 1px solid rgba(242, 234, 217, 0.14);
    border-radius: 6px;
    color: #f2ead9;
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
    line-height: 1.45;
  }

  &[data-casino-presentation-host="gamma"],
  &[data-casino-presentation-host="gamma"] * {
    box-sizing: border-box;
    letter-spacing: 0;
    text-shadow: none;
  }

  &[data-casino-presentation-host="gamma"] [data-casino-region] {
    background-image: none;
    box-shadow: none;
  }

  &[data-casino-presentation-host="gamma"]
    :where(button, input, select, textarea, div, span, strong, p, label, legend, fieldset) {
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
  }

  &[data-casino-presentation-host="gamma"] :where([data-casino-region="meta"], [data-casino-region="subline"], [data-casino-region="status-line"]) {
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
  }

  &[data-casino-presentation-host="gamma"] fieldset {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: rgba(242, 234, 217, 0.035);
    color: #f2ead9;
  }

  &[data-casino-presentation-host="gamma"] legend {
    color: #28d7ff;
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }

  &[data-casino-presentation-host="gamma"] button {
    border-radius: 4px;
  }
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: stretch;
  margin-bottom: 10px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const TitlePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 12px;
  background: #f6e2a6;
  color: #101010;
  border-color: #ffffff #20170a #20170a #ffffff;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.045);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;

  ${gammaCasinoScope} & {
    color: #f2ead9;
    font-size: 22px;
    font-weight: 800;
  }
`;

const Subline = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;

  ${gammaCasinoScope} & {
    color: rgba(242, 234, 217, 0.68);
    align-items: center;
    text-transform: uppercase;
  }
`;

const Badge = styled.span<{ $ready?: boolean }>`
  border: 1px solid #101010;
  background: ${(p) => (p.$ready ? "#7dff94" : "#ffcf6b")};
  color: #101010;
  padding: 2px 6px;
  font-weight: 700;

  ${gammaCasinoScope} & {
    background: ${(p) =>
      p.$ready ? "rgba(40, 215, 255, 0.14)" : "rgba(242, 234, 217, 0.045)"};
    border: 1px solid
      ${(p) =>
        p.$ready ? "rgba(40, 215, 255, 0.58)" : "rgba(242, 234, 217, 0.18)"};
    border-radius: 4px;
    color: ${(p) => (p.$ready ? "#28d7ff" : "rgba(242, 234, 217, 0.72)")};
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 10px;
  }
`;

const Meter = styled(Panel).attrs({ variant: "well" })`
  min-width: 240px;
  padding: 8px;
  background: #e7dfc0;
  color: #101010;
  font-size: 12px;
  line-height: 1.45;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.045);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.82);
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 10px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Box = styled(GroupBox)`
  min-width: 0;
  color: #101010;
  background: #d4ccb2;
`;

const Empty = styled.div`
  min-height: 210px;
  border: 2px inset #808080;
  background: #eee6c8;
  color: #4b3f2a;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 14px;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.035);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.76);
  }
`;

const GameGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
`;

const GameCard = styled(Panel).attrs({ variant: "well" })`
  padding: 10px;
  min-height: 120px;
  background: #f1e9c9;
  color: #101010;
  line-height: 1.35;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.045);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const CardMeta = styled.div`
  margin-top: 6px;
  font-size: 11px;
  color: #3a321f;

  ${gammaCasinoScope} & {
    color: rgba(242, 234, 217, 0.66);
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
  }
`;

const CardTagLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
`;

const CardTag = styled.span`
  border: 1px solid #6b5a2c;
  background: #fff4bc;
  color: #2f2818;
  padding: 1px 5px;
  font-size: 10px;

  ${gammaCasinoScope} & {
    background: rgba(40, 215, 255, 0.08);
    border: 1px solid rgba(40, 215, 255, 0.36);
    border-radius: 4px;
    color: #28d7ff;
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
  }
`;

const CardActions = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 10px;
`;

const Controls = styled.div`
  display: grid;
  gap: 8px;
`;

const StatusLine = styled.div<{ $error?: boolean }>`
  min-height: 18px;
  color: ${(p) => (p.$error ? "#b00020" : "#173b18")};
  font-size: 11px;
  overflow-wrap: anywhere;

  ${gammaCasinoScope} & {
    color: ${(p) => (p.$error ? "#ff7a7a" : "rgba(242, 234, 217, 0.76)")};
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
  }
`;

const PracticeNotice = styled(Panel).attrs({ variant: "well" })`
  margin: 10px 0;
  padding: 9px;
  background: #dff7df;
  color: #173b18;
  font-size: 12px;

  ${gammaCasinoScope} & {
    background: rgba(125, 255, 148, 0.08);
    border: 1px solid rgba(125, 255, 148, 0.35);
    border-radius: 6px;
    color: #a8ffb8;
  }
`;

const CommunityLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.7fr);
  gap: 10px;
  margin-top: 10px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const FormGrid = styled.div`
  display: grid;
  gap: 7px;
`;

const Field = styled.label`
  display: grid;
  gap: 3px;
  font-size: 11px;
`;

const TextInput = styled.input`
  min-width: 0;
  padding: 6px;
  border: 2px inset #808080;
  background: #fff;
  color: #101010;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.06);
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 4px;
    color: #f2ead9;
  }
`;

const TextArea = styled.textarea`
  min-width: 0;
  min-height: 64px;
  resize: vertical;
  padding: 6px;
  border: 2px inset #808080;
  background: #fff;
  color: #101010;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.06);
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 4px;
    color: #f2ead9;
  }
`;

const SubmissionList = styled.div`
  display: grid;
  gap: 6px;
  margin-top: 10px;
`;

const SubmissionRow = styled(Panel).attrs({ variant: "well" })`
  padding: 7px;
  background: #eee6c8;
  color: #101010;
  font-size: 11px;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.035);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 4px;
    color: rgba(242, 234, 217, 0.8);
  }
`;

function formatExpiry(value: string | null): string {
  if (!value) return "No active card";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CasinoSurface() {
  const presentation = usePresentationShell();
  const qc = useQueryClient();
  const wallet = useWallet();
  const wm = useWindowManager();
  const [, setLocation] = useLocation();
  const [practiceTitle, setPracticeTitle] = useState("");
  const [practiceSummary, setPracticeSummary] = useState("");
  const [practiceInstructions, setPracticeInstructions] = useState("");
  const [practiceOutcomes, setPracticeOutcomes] = useState("");
  const [practiceResult, setPracticeResult] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

  const statusQuery = useQuery({
    queryKey: ["casino", "status"],
    queryFn: () => api.get<CasinoStatus>("/api/casino/status"),
    staleTime: 20_000,
  });

  const gamesQuery = useQuery({
    queryKey: ["casino", "games"],
    queryFn: () =>
      api.get<{ games: CasinoGame[]; canEnter: boolean; wageringEnabled: false }>(
        "/api/casino/games"
      ),
    staleTime: 20_000,
  });

  const practiceQuery = useQuery({
    queryKey: ["casino", "practice-games"],
    queryFn: () =>
      api.get<CasinoPracticeResponse>("/api/casino/practice-games"),
    staleTime: 10_000,
  });

  const membershipMutation = useMutation({
    mutationFn: async () => {
      const connected = await wallet.connect();
      const intentResponse = await api.post<CasinoIntentResponse>(
        "/api/casino/membership-intents",
        { walletAddress: connected.address }
      );
      const opHash = await purchaseCasinoMembership({
        walletAddress: connected.address,
        contractAddress: intentResponse.intent.contractAddress,
        membershipRef: intentResponse.intent.purchaseRef,
        feeMutez: intentResponse.intent.feeMutez,
      });
      await api.post("/api/casino/membership-verify", { opHash });
      return opHash;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casino"] });
    },
  });

  const entryMutation = useMutation({
    mutationFn: () => api.post("/api/casino/entry", {}),
  });

  const createPracticeMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; game: CasinoPracticeGame }>("/api/casino/practice-games", {
        title: practiceTitle,
        summary: practiceSummary,
        instructions: practiceInstructions,
        outcomes: practiceOutcomes
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setPracticeTitle("");
      setPracticeSummary("");
      setPracticeInstructions("");
      setPracticeOutcomes("");
      qc.invalidateQueries({ queryKey: ["casino", "practice-games"] });
    },
  });

  const reviewPracticeMutation = useMutation({
    mutationFn: ({ gameId, action }: { gameId: number; action: "approve" | "reject" }) =>
      api.post(`/api/casino/practice-games/${gameId}/review`, {
        action,
        note: reviewNotes[gameId] || "",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casino", "practice-games"] });
    },
  });

  const playPracticeMutation = useMutation({
    mutationFn: (slug: string) =>
      api.post<{
        ok: true;
        game: CasinoPracticeGame;
        result: { outcomeLabel: string; wager: null; reward: null };
      }>(`/api/casino/practice-games/${slug}/play`, {}),
    onSuccess: (data) => {
      setPracticeResult(`${data.game.title}: ${data.result.outcomeLabel} — practice only; no wager or reward.`);
      qc.invalidateQueries({ queryKey: ["casino", "practice-games"] });
    },
  });

  const status = statusQuery.data;
  const games = gamesQuery.data?.games ?? [];
  const practiceGames = practiceQuery.data?.games ?? [];
  const myPracticeGames = practiceQuery.data?.mine ?? [];
  const practiceQueue = practiceQuery.data?.moderationQueue ?? [];
  const busy = statusQuery.isLoading || gamesQuery.isLoading;
  const membershipError =
    membershipMutation.error instanceof Error ? membershipMutation.error.message : "";
  const entryError = entryMutation.error instanceof Error ? entryMutation.error.message : "";

  const openCasinoRoute = (route: string) => {
    if (presentation.host === "gamma") {
      setLocation(presentationRouteHref(route, presentation.host));
      return;
    }
    wm.openPage(route);
  };

  return (
    <Shell
      data-casino-presentation-host={presentation.host}
      data-casino-surface="lobby"
      data-casino-region="surface"
    >
      <Header data-casino-region="header">
        <TitlePanel data-casino-region="title-panel">
          <Title>WTF Casino</Title>
          <Subline data-casino-region="subline">
            <Badge $ready={status?.appPass.owned} data-casino-region="status-badge">APP</Badge>
            <Badge $ready={status?.membership.active} data-casino-region="status-badge">CARD</Badge>
            <Badge $ready={status?.canEnter} data-casino-region="status-badge">ENTRY</Badge>
            <span data-casino-region="meta">{status?.config.network ?? "mainnet"}</span>
          </Subline>
        </TitlePanel>
        <Meter data-casino-region="meter">
          <div data-casino-region="meta">App pass: {status?.appPass.owned ? "owned" : "missing"}</div>
          <div data-casino-region="meta">Membership: {formatExpiry(status?.membership.expiresAt ?? null)}</div>
          <div data-casino-region="meta">Fee: {status?.config.feeTez ?? "1"} XTZ</div>
          <div data-casino-region="meta">Contract: {status?.config.contractAddress ?? "pending"}</div>
        </Meter>
      </Header>

      <PracticeNotice data-casino-region="practice-notice">
        <strong>Practice floor only.</strong> Every built-in and community table uses simulated
        results. No community table can accept a wager, move currency, award a prize, or enable a
        house take.
      </PracticeNotice>

      <Layout data-casino-region="layout">
        <Box label="Casino Floor" data-casino-region="floor">
          {busy ? (
            <Empty data-casino-region="empty">
              <Hourglass size={28} />
            </Empty>
          ) : games.length === 0 ? (
            <Empty data-casino-region="empty">No casino tables installed.</Empty>
          ) : (
            <GameGrid data-casino-region="game-grid">
              {games.map((game) => (
                <GameCard key={game.key} data-casino-region="game-card">
                  <strong>{game.title}</strong>
                  {game.tagline && <CardMeta data-casino-region="meta">{game.tagline}</CardMeta>}
                  {game.summary && <CardMeta data-casino-region="meta">{game.summary}</CardMeta>}
                  <CardMeta data-casino-region="meta">
                    {game.mode.replace("_", " ")} · {game.status}
                  </CardMeta>
                  <CardMeta data-casino-region="meta">
                    {game.maxPlayers
                      ? `${game.minPlayers}-${game.maxPlayers} players`
                      : `${game.minPlayers}+ players`}
                  </CardMeta>
                  <CardMeta data-casino-region="meta">
                    Practice balance: {game.wagerAsset ?? "XTZ"} simulation
                  </CardMeta>
                  <CardMeta data-casino-region="meta">Live wagers and real rewards: disabled</CardMeta>
                  {game.highlights && game.highlights.length > 0 && (
                    <CardTagLine data-casino-region="card-tags">
                      {game.highlights.slice(0, 4).map((highlight) => (
                        <CardTag key={highlight}>{highlight}</CardTag>
                      ))}
                    </CardTagLine>
                  )}
                  {["wtf-button", "rug-pull", "guinea-pig-raceway"].includes(game.key) && (
                    <CardActions data-casino-region="card-actions">
                      <Button
                        size="sm"
                        onClick={() => openCasinoRoute(`/casino/${game.key}`)}
                        disabled={!status?.canEnter}
                      >
                        Open Table
                      </Button>
                    </CardActions>
                  )}
                </GameCard>
              ))}
            </GameGrid>
          )}
        </Box>

        <Box label="Entry" data-casino-region="entry">
          <Controls data-casino-region="entry-controls">
            <Button onClick={() => openCasinoRoute("/wtfiam")} disabled={status?.appPass.owned}>
              Buy App
            </Button>
            <Button
              onClick={() => membershipMutation.mutate()}
              disabled={
                membershipMutation.isPending ||
                !status?.appPass.owned ||
                status?.membership.active
              }
            >
              {membershipMutation.isPending ? "Working" : "Buy Card"}
            </Button>
            <Button
              onClick={() => entryMutation.mutate()}
              disabled={entryMutation.isPending || !status?.canEnter}
            >
              Enter
            </Button>
            <StatusLine
              $error={Boolean(membershipError || entryError)}
              data-casino-region="status-line"
            >
              {membershipError ||
                entryError ||
                (status?.canEnter
                  ? "Access verified."
                  : "App pass and active card required.")}
            </StatusLine>
          </Controls>
        </Box>
      </Layout>

      <CommunityLayout data-casino-region="community-practice-layout">
        <Box label="Community Practice Tables" data-casino-region="community-practice-floor">
          <CardMeta data-casino-region="meta">
            Member-made chance games approved by an operator. Results are stored for play history,
            but never pay or cost currency.
          </CardMeta>
          {practiceQuery.isLoading ? (
            <Empty data-casino-region="empty"><Hourglass size={24} /></Empty>
          ) : practiceGames.length === 0 ? (
            <Empty data-casino-region="empty">No community practice tables are approved yet.</Empty>
          ) : (
            <GameGrid data-casino-region="community-game-grid">
              {practiceGames.map((game) => (
                <GameCard key={game.id} data-casino-region="community-game-card">
                  <strong>{game.title}</strong>
                  <CardMeta data-casino-region="meta">By {game.creatorName}</CardMeta>
                  <CardMeta data-casino-region="meta">{game.summary}</CardMeta>
                  <CardMeta data-casino-region="meta">How to play: {game.instructions}</CardMeta>
                  <CardMeta data-casino-region="meta">
                    Equal-chance results: {game.outcomes.join(" · ")}
                  </CardMeta>
                  <CardTagLine data-casino-region="card-tags">
                    <CardTag>PRACTICE ONLY</CardTag>
                    <CardTag>NO WAGER</CardTag>
                    <CardTag>{game.playCount} PLAYS</CardTag>
                  </CardTagLine>
                  <CardActions data-casino-region="card-actions">
                    <Button
                      size="sm"
                      disabled={!status?.canEnter || playPracticeMutation.isPending}
                      onClick={() => playPracticeMutation.mutate(game.slug)}
                    >
                      Play Practice Round
                    </Button>
                  </CardActions>
                </GameCard>
              ))}
            </GameGrid>
          )}
          <StatusLine
            $error={playPracticeMutation.isError}
            data-casino-region="practice-play-status"
          >
            {playPracticeMutation.error instanceof Error
              ? playPracticeMutation.error.message
              : practiceResult ||
                (status?.canEnter
                  ? "Choose an approved table to play a no-wager round."
                  : "App pass and active membership are required to play.")}
          </StatusLine>
        </Box>

        <Box label="Create a Practice Table" data-casino-region="practice-creator-desk">
          <CardMeta data-casino-region="meta">
            Write the table name, explain the rules, and put one possible result on each line.
            Every result has the same chance. Submissions stay hidden until operator approval.
          </CardMeta>
          <FormGrid>
            <Field>
              Table name
              <TextInput value={practiceTitle} onChange={(event) => setPracticeTitle(event.target.value)} />
            </Field>
            <Field>
              Short description
              <TextArea value={practiceSummary} onChange={(event) => setPracticeSummary(event.target.value)} />
            </Field>
            <Field>
              How to play
              <TextArea value={practiceInstructions} onChange={(event) => setPracticeInstructions(event.target.value)} />
            </Field>
            <Field>
              Possible results — one per line
              <TextArea value={practiceOutcomes} onChange={(event) => setPracticeOutcomes(event.target.value)} />
            </Field>
            <Button
              onClick={() => createPracticeMutation.mutate()}
              disabled={createPracticeMutation.isPending}
            >
              {createPracticeMutation.isPending ? "Submitting" : "Submit for Review"}
            </Button>
          </FormGrid>
          <StatusLine
            $error={createPracticeMutation.isError}
            data-casino-region="practice-create-status"
          >
            {createPracticeMutation.error instanceof Error
              ? createPracticeMutation.error.message
              : createPracticeMutation.isSuccess
                ? "Submitted. Your table is hidden while an operator reviews it."
                : "No wagers, wallet actions, or rewards are added to community tables."}
          </StatusLine>

          <SubmissionList data-casino-region="practice-submissions">
            {myPracticeGames.map((game) => (
              <SubmissionRow key={game.id}>
                <strong>{game.title}</strong> · {game.status}
                {game.moderationNote ? <div>Operator note: {game.moderationNote}</div> : null}
              </SubmissionRow>
            ))}
          </SubmissionList>
        </Box>
      </CommunityLayout>

      {practiceQuery.data?.canModerate ? (
        <Box label="Operator Practice Review" data-casino-region="practice-review-queue">
          {practiceQueue.length === 0 ? (
            <CardMeta data-casino-region="meta">No practice tables are awaiting review.</CardMeta>
          ) : (
            <SubmissionList>
              {practiceQueue.map((game) => (
                <SubmissionRow key={game.id}>
                  <strong>{game.title}</strong> · By {game.creatorName}
                  <div>{game.summary}</div>
                  <div>How to play: {game.instructions}</div>
                  <div>Results: {game.outcomes.join(" · ")}</div>
                  <Field>
                    Required review note
                    <TextInput
                      value={reviewNotes[game.id] || ""}
                      onChange={(event) =>
                        setReviewNotes((current) => ({ ...current, [game.id]: event.target.value }))
                      }
                    />
                  </Field>
                  <CardActions>
                    <Button
                      size="sm"
                      disabled={
                        reviewPracticeMutation.isPending ||
                        !(reviewNotes[game.id] || "").trim()
                      }
                      onClick={() => reviewPracticeMutation.mutate({ gameId: game.id, action: "approve" })}
                    >
                      Approve Practice Table
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        reviewPracticeMutation.isPending ||
                        !(reviewNotes[game.id] || "").trim()
                      }
                      onClick={() => reviewPracticeMutation.mutate({ gameId: game.id, action: "reject" })}
                    >
                      Reject
                    </Button>
                  </CardActions>
                </SubmissionRow>
              ))}
            </SubmissionList>
          )}
          <StatusLine $error={reviewPracticeMutation.isError}>
            {reviewPracticeMutation.error instanceof Error
              ? reviewPracticeMutation.error.message
              : "Enter a review note before approving or rejecting a table."}
          </StatusLine>
        </Box>
      ) : null}
    </Shell>
  );
}

export function Casino() {
  return (
    <AppWindow title="WTF Casino">
      <CasinoSurface />
    </AppWindow>
  );
}
