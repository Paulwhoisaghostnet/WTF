import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  Hourglass,
  Separator,
  Tab,
  TabBody,
  Tabs,
  TextInput,
} from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";

type DailySideQuest = {
  id: number;
  title: string;
  description?: string | null;
  summary?: string | null;
  route: string;
  actionLabel?: string | null;
  category?: string | null;
  order?: number;
  rewards?: { xp?: number; wtf?: number };
  claimRequired?: boolean;
  verifiedToday?: boolean;
  claimableToday?: boolean;
  claimedToday?: boolean;
  completedToday?: boolean;
  completedByCount?: number;
  verifiedByCount?: number;
  rewardStatus?: string | null;
  completedAt?: string | null;
  claimedAt?: string | null;
};

type DailySideQuestResponse = {
  completionKey: string;
  resetAtUtc?: string;
  nextResetAt?: string;
  loops: DailySideQuest[];
};

type LegacySideQuest = {
  id: number;
  title: string;
  description?: string | null;
  criteria?: string | null;
  status: string;
  persistent?: boolean;
  autoVerifyType?: string | null;
  rewardAmountWtf?: number | null;
  rewardXp?: number | null;
  xpReward?: number | null;
  deadline?: string | null;
  maxCompletions?: number | null;
  completionCount?: number;
  approvedCompletionCount?: number;
};

type SideQuestCompletion = {
  id: number;
  sideQuestId: number;
  approved: boolean | null;
  completedAt?: string | null;
  xpAwarded?: number | null;
};

const Shell = styled.div`
  display: grid;
  gap: 12px;
  min-width: 0;
`;

const IntroPanel = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid #808080;
  background: #e7e1cb;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const TitleBlock = styled.div`
  min-width: 0;
`;

const PageTitle = styled.h2`
  margin: 0;
  font-size: 22px;
`;

const PageCopy = styled.p`
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
`;

const ProgressWrap = styled.div`
  min-width: 190px;
`;

const ProgressLabel = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  font-weight: bold;
`;

const ProgressTrack = styled.div`
  height: 14px;
  margin-top: 4px;
  border: 1px solid #808080;
  background: #ffffff;
  box-shadow: inset 1px 1px 0 #bdbdbd;
`;

const ProgressFill = styled.div<{ $pct: number }>`
  width: ${(p) => Math.max(0, Math.min(100, p.$pct))}%;
  height: 100%;
  background: linear-gradient(90deg, #008000, #00a45c);
`;

const AccountPanel = styled(GroupBox)`
  margin: 0;
`;

const AccountGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(92px, 1fr));
  gap: 8px;
  font-size: 12px;

  @media (max-width: 780px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const AccountMetric = styled.div`
  min-height: 52px;
  border: 2px inset #c0c0c0;
  background: #f7f3dc;
  padding: 6px;

  strong {
    display: block;
    margin-top: 3px;
    font-size: 15px;
    overflow-wrap: anywhere;
  }
`;

const AccountActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
  font-size: 12px;
`;

const QuestGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const QuestCard = styled(GroupBox)`
  min-width: 0;
`;

const QuestHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
`;

const QuestTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  overflow-wrap: anywhere;
`;

const QuestDescription = styled.p`
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.35;
`;

const QuestMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const Chip = styled.span<{ $tone?: "green" | "blue" | "gold" | "gray" | "red" }>`
  display: inline-flex;
  align-items: center;
  min-height: 19px;
  padding: 2px 7px;
  border: 1px solid #5a5a5a;
  background: ${(p) =>
    p.$tone === "green"
      ? "#d7f0d4"
      : p.$tone === "blue"
        ? "#d7e9f7"
        : p.$tone === "gold"
          ? "#fff1ba"
          : p.$tone === "red"
            ? "#ffd7d7"
            : "#eeeeee"};
  font-size: 11px;
  font-weight: bold;
  color: #202020;
`;

const QuestFooter = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
`;

const SmallNote = styled.div`
  font-size: 11px;
  line-height: 1.35;
  color: #404040;
  overflow-wrap: anywhere;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const EmptyState = styled.div`
  padding: 14px;
  border: 1px dashed #777777;
  background: #f6f6f6;
  font-size: 13px;
`;

const VERIFY_LABELS: Record<string, string> = {
  profile_avatar: "Set your profile avatar",
  profile_bio: "Write a profile bio",
  wallet_connected: "Connect a Tezos wallet",
  social_twitter: "Link your Twitter/X account",
  social_discord: "Link your Discord account",
  post_message: "Post in the message board",
  holds_positive_balance: "Hold any indexed wallet token",
  holds_art_nft: "Hold an indexed art NFT",
  has_mint_event: "Have an indexed mint event",
  listed_on_trade_board: "List an item on the WTF trade board",
};

function shortWallet(address: string | null | undefined) {
  if (!address) return "set one before cashout";
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function rewardText(rewards?: { xp?: number; wtf?: number }) {
  const parts = [];
  if ((rewards?.wtf ?? 0) > 0) parts.push(`${rewards?.wtf} WTF`);
  if ((rewards?.xp ?? 0) > 0) parts.push(`${rewards?.xp} XP`);
  return parts.join(" + ") || "Reward";
}

function statusForDailyQuest(quest: DailySideQuest) {
  if (quest.claimedToday || quest.completedToday) {
    return { label: "Claimed today", tone: "green" as const };
  }
  if (quest.claimableToday) {
    return { label: "Ready to claim", tone: "gold" as const };
  }
  if (quest.verifiedToday) {
    return { label: "Verified", tone: "blue" as const };
  }
  return { label: "Open", tone: "gray" as const };
}

function completionLabel(count: number | undefined, noun = "claimed") {
  const safeCount = Math.max(0, Number(count ?? 0));
  return `${safeCount} player${safeCount === 1 ? "" : "s"} ${noun}`;
}

export function SideQuests() {
  const { user, canParticipate } = useAuth();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [proofText, setProofText] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    logClientSystemEvent({
      eventType: "side_quest.viewed",
      metadata: { userId: user?.id ?? null },
    });
  }, [user?.id]);

  const dailyQuery = useQuery({
    queryKey: ["side-quests", "daily"],
    queryFn: () =>
      api.get<DailySideQuestResponse>("/api/challenge-automation/daily-loops"),
    enabled: !!user,
  });

  const { data: quests, isLoading: legacyLoading } = useQuery({
    queryKey: ["side-quests", "legacy"],
    queryFn: () => api.get<LegacySideQuest[]>("/api/side-quests"),
  });

  const { data: myCompletions } = useQuery({
    queryKey: ["side-quests", "my-completions"],
    queryFn: () => api.get<SideQuestCompletion[]>("/api/side-quests/my/completions"),
    enabled: !!user,
  });

  const { data: rewardAccount } = useQuery({
    queryKey: ["rewards-account"],
    queryFn: () => api.get<any>("/api/rewards/account"),
    enabled: !!user,
  });

  const dailyLoops = useMemo(
    () => [...(dailyQuery.data?.loops ?? [])].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [dailyQuery.data?.loops]
  );
  const claimedTodayCount = dailyLoops.filter((quest) => quest.claimedToday || quest.completedToday).length;
  const claimableTodayCount = dailyLoops.filter((quest) => quest.claimableToday).length;
  const verifiedTodayCount = dailyLoops.filter((quest) => quest.verifiedToday).length;
  const dailyProgressPct = dailyLoops.length > 0 ? (claimedTodayCount / dailyLoops.length) * 100 : 0;

  const completionMap = new Map(
    (myCompletions || []).map((completion) => [completion.sideQuestId, completion])
  );

  const claimMutation = useMutation({
    mutationFn: (id: number) =>
      api.post(`/api/challenge-automation/daily-loops/${id}/claim`, {}),
    onSuccess: (_data, id) => {
      setClaimError(null);
      logClientSystemEvent({
        eventType: "side_quest.reward_claimed",
        metadata: { challengeAutomationId: id },
      });
      qc.invalidateQueries({ queryKey: ["side-quests", "daily"] });
      qc.invalidateQueries({ queryKey: ["rewards-account"] });
      qc.invalidateQueries({ queryKey: ["wtfiam"] });
    },
    onError: (err: any) => {
      setClaimError(err?.message || "Claim failed");
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.post(`/api/side-quests/${id}/complete`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["side-quests", "legacy"] });
      qc.invalidateQueries({ queryKey: ["side-quests", "my-completions"] });
      qc.invalidateQueries({ queryKey: ["rewards-account"] });
      qc.invalidateQueries({ queryKey: ["wtfiam"] });
      setExpandedId(null);
      setProofText("");
      setProofUrl("");
      setSubmitError(null);
    },
    onError: (err: any) => {
      setSubmitError(err?.message || "Failed to submit");
    },
  });

  const cashoutMutation = useMutation({
    mutationFn: () => api.post("/api/rewards/cashout", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rewards-account"] });
      qc.invalidateQueries({ queryKey: ["wtfiam"] });
    },
  });

  const isLoading = dailyQuery.isLoading || legacyLoading;
  if (isLoading) {
    return (
      <AppWindow title="Side Quests">
        <Hourglass size={32} />
      </AppWindow>
    );
  }

  const activeQuests = (quests || []).filter((quest) => quest.status === "active");
  const completedQuests = (quests || []).filter((quest) => quest.status === "completed");
  const availableRewardWtf = rewardAccount?.balances?.availableWtf ?? 0;
  const cashoutMinimumWtf = rewardAccount?.cashout?.minimumWtf ?? 20;
  const canCashOutRewardWtf =
    availableRewardWtf >= cashoutMinimumWtf && Boolean(rewardAccount?.primaryWallet);

  return (
    <AppWindow title="Side Quests">
      <Shell>
        <IntroPanel>
          <TitleBlock>
            <PageTitle>Side Quests</PageTitle>
            <PageCopy>
              Small daily wins, verified by WTF OS. Claiming moves rewards into your ledger.
            </PageCopy>
          </TitleBlock>
          <ProgressWrap>
            <ProgressLabel>
              <span>{claimedTodayCount}/{dailyLoops.length || 0} claimed</span>
              <span>00:00 UTC reset</span>
            </ProgressLabel>
            <ProgressTrack aria-label="Daily side quest claim progress">
              <ProgressFill $pct={dailyProgressPct} />
            </ProgressTrack>
            <SmallNote>
              {claimableTodayCount > 0
                ? `${claimableTodayCount} ready to claim`
                : `${verifiedTodayCount} verified today`}
            </SmallNote>
          </ProgressWrap>
        </IntroPanel>

        {user && (
          <AccountPanel label="Reward Account">
            <AccountGrid>
              <AccountMetric>
                Total earned
                <strong>{rewardAccount?.balances?.totalEarnedWtf ?? 0} WTF</strong>
              </AccountMetric>
              <AccountMetric>
                Available
                <strong>{availableRewardWtf} WTF</strong>
              </AccountMetric>
              <AccountMetric>
                Pending cashout
                <strong>{rewardAccount?.balances?.pendingCashoutWtf ?? 0} WTF</strong>
              </AccountMetric>
              <AccountMetric>
                Already paid
                <strong>{rewardAccount?.balances?.alreadyPaidWtf ?? 0} WTF</strong>
              </AccountMetric>
              <AccountMetric>
                Market spent
                <strong>{rewardAccount?.balances?.marketSpentWtf ?? 0} WTF</strong>
              </AccountMetric>
            </AccountGrid>
            <AccountActions>
              <Button
                size="sm"
                disabled={cashoutMutation.isPending || !canCashOutRewardWtf}
                onClick={() => cashoutMutation.mutate()}
              >
                {cashoutMutation.isPending ? "Cashout Running..." : "Cash Out 20+ WTF"}
              </Button>
              <span>Minimum cashout: {cashoutMinimumWtf} WTF. XP stays in app.</span>
              <span>Primary wallet: {shortWallet(rewardAccount?.primaryWallet?.walletAddress)}</span>
              {cashoutMutation.isError && (
                <span style={{ color: "#8a1a1a" }}>
                  {(cashoutMutation.error as any)?.message || "Cashout failed"}
                </span>
              )}
              {cashoutMutation.isSuccess && (
                <span style={{ color: "#1f6b25" }}>Cashout request recorded.</span>
              )}
            </AccountActions>
          </AccountPanel>
        )}

        <div>
          <Tabs value={tab} onChange={(value: number) => setTab(value)}>
            <Tab value={0}>Today</Tab>
            <Tab value={1}>Special</Tab>
            <Tab value={2}>Rewards</Tab>
          </Tabs>
          <TabBody>
            {tab === 0 && (
              <>
                {claimError && (
                  <p style={{ color: "#8a1a1a", marginTop: 0 }}>{claimError}</p>
                )}
                {dailyLoops.length > 0 ? (
                  <QuestGrid>
                    {dailyLoops.map((quest) => {
                      const status = statusForDailyQuest(quest);
                      const isClaiming =
                        claimMutation.isPending && claimMutation.variables === quest.id;
                      const routeLabel = quest.actionLabel || "Open";
                      return (
                        <QuestCard key={quest.id} label={quest.category === "creative" ? "Creative" : "Social"}>
                          <QuestHeader>
                            <div>
                              <QuestTitle>{quest.title}</QuestTitle>
                              <QuestDescription>{quest.description}</QuestDescription>
                            </div>
                            <Chip $tone={status.tone}>{status.label}</Chip>
                          </QuestHeader>
                          <QuestMeta>
                            <Chip $tone="blue">{rewardText(quest.rewards)}</Chip>
                            <Chip>{completionLabel(quest.completedByCount)}</Chip>
                            {quest.verifiedByCount ? (
                              <Chip $tone="gray">{completionLabel(quest.verifiedByCount, "verified")}</Chip>
                            ) : null}
                          </QuestMeta>
                          <QuestFooter>
                            <SmallNote>
                              {quest.claimableToday
                                ? "Verified by WTF OS. Your reward is waiting."
                                : quest.claimedToday || quest.completedToday
                                  ? "Reward is in your account ledger."
                                  : "Do the task and WTF OS will light up the claim button."}
                            </SmallNote>
                            {quest.claimedToday || quest.completedToday ? (
                              <Button size="sm" disabled>
                                Claimed
                              </Button>
                            ) : quest.claimableToday ? (
                              <Button
                                size="sm"
                                disabled={isClaiming}
                                onClick={() => claimMutation.mutate(quest.id)}
                              >
                                {isClaiming ? "Claiming..." : "Claim"}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => setLocation(quest.route || "/side-quests")}
                              >
                                {routeLabel}
                              </Button>
                            )}
                          </QuestFooter>
                        </QuestCard>
                      );
                    })}
                  </QuestGrid>
                ) : (
                  <EmptyState>No daily side quests are active yet.</EmptyState>
                )}
              </>
            )}

            {tab === 1 && (
              <>
                {activeQuests.length === 0 && completedQuests.length === 0 ? (
                  <EmptyState>No special side quests are active right now.</EmptyState>
                ) : (
                  <QuestGrid>
                    {[...activeQuests, ...completedQuests].map((quest) => {
                      const myComp = completionMap.get(quest.id);
                      const isAutoVerify =
                        quest.autoVerifyType && quest.autoVerifyType !== "manual";
                      const rewardWtf = quest.rewardAmountWtf ?? 0;
                      const rewardXp = quest.rewardXp ?? quest.xpReward ?? 0;
                      const completionTone =
                        myComp?.approved === true
                          ? "green"
                          : myComp?.approved === false
                            ? "red"
                            : myComp
                              ? "gold"
                              : quest.status === "completed"
                                ? "gray"
                                : "blue";
                      const completionText =
                        myComp?.approved === true
                          ? "Completed"
                          : myComp?.approved === false
                            ? "Rejected"
                            : myComp
                              ? "In review"
                              : quest.status === "completed"
                                ? "Closed"
                                : "Open";

                      return (
                        <QuestCard key={quest.id} label={quest.persistent ? "Recurring" : "Special"}>
                          <QuestHeader>
                            <div>
                              <QuestTitle>{quest.title}</QuestTitle>
                              <QuestDescription>{quest.description}</QuestDescription>
                            </div>
                            <Chip $tone={completionTone}>{completionText}</Chip>
                          </QuestHeader>
                          <QuestMeta>
                            {rewardWtf > 0 && <Chip $tone="blue">{rewardWtf} WTF</Chip>}
                            {rewardXp > 0 && <Chip $tone="green">{rewardXp} XP</Chip>}
                            {isAutoVerify && <Chip $tone="gray">Auto-verified</Chip>}
                            <Chip>{completionLabel(quest.approvedCompletionCount)}</Chip>
                          </QuestMeta>

                          {quest.criteria && (
                            <SmallNote style={{ marginTop: 8 }}>{quest.criteria}</SmallNote>
                          )}
                          {isAutoVerify && (
                            <SmallNote style={{ marginTop: 8 }}>
                              {VERIFY_LABELS[quest.autoVerifyType || ""] || quest.autoVerifyType}
                            </SmallNote>
                          )}
                          {quest.deadline && (
                            <SmallNote style={{ marginTop: 8 }}>
                              Deadline: {new Date(quest.deadline).toLocaleString()}
                            </SmallNote>
                          )}

                          {canParticipate && !myComp && quest.status === "active" && (
                            <>
                              <Separator style={{ margin: "10px 0" }} />
                              {isAutoVerify ? (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSubmitError(null);
                                    completeMutation.mutate({ id: quest.id, data: {} });
                                  }}
                                  disabled={completeMutation.isPending}
                                >
                                  {completeMutation.isPending ? "Checking..." : "Check & Claim"}
                                </Button>
                              ) : expandedId === quest.id ? (
                                <div>
                                  <Field>
                                    <label>Proof / Description</label>
                                    <TextInput
                                      value={proofText}
                                      onChange={(event: any) => setProofText(event.target.value)}
                                      placeholder="Describe how you completed the quest..."
                                      multiline
                                      fullWidth
                                    />
                                  </Field>
                                  <Field>
                                    <label>Proof Link (optional)</label>
                                    <TextInput
                                      value={proofUrl}
                                      onChange={(event: any) => setProofUrl(event.target.value)}
                                      placeholder="https://..."
                                      fullWidth
                                    />
                                  </Field>
                                  {submitError && (
                                    <p style={{ color: "#8a1a1a", fontSize: 12, marginBottom: 8 }}>
                                      {submitError}
                                    </p>
                                  )}
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setSubmitError(null);
                                        completeMutation.mutate({
                                          id: quest.id,
                                          data: { proofText, proofUrl: proofUrl || undefined },
                                        });
                                      }}
                                      disabled={!proofText || completeMutation.isPending}
                                    >
                                      Submit
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setExpandedId(null);
                                        setSubmitError(null);
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button size="sm" onClick={() => setExpandedId(quest.id)}>
                                  Submit Proof
                                </Button>
                              )}
                              {submitError && expandedId !== quest.id && isAutoVerify && (
                                <p style={{ color: "#8a1a1a", fontSize: 12, marginTop: 4 }}>
                                  {submitError}
                                </p>
                              )}
                            </>
                          )}

                          {myComp && myComp.approved === true && (
                            <SmallNote style={{ marginTop: 8, color: "#1f6b25" }}>
                              Claimed to your account ledger.
                            </SmallNote>
                          )}
                        </QuestCard>
                      );
                    })}
                  </QuestGrid>
                )}
              </>
            )}

            {tab === 2 && (
              <QuestGrid>
                <QuestCard label="WTF">
                  <QuestTitle>{availableRewardWtf} WTF available</QuestTitle>
                  <QuestDescription>
                    Total earned: {rewardAccount?.balances?.totalEarnedWtf ?? 0} WTF
                  </QuestDescription>
                  <QuestMeta>
                    <Chip $tone="gold">
                      {rewardAccount?.balances?.pendingCashoutWtf ?? 0} WTF pending
                    </Chip>
                    <Chip $tone="green">
                      {rewardAccount?.balances?.alreadyPaidWtf ?? 0} WTF paid
                    </Chip>
                    <Chip>{rewardAccount?.balances?.marketSpentWtf ?? 0} WTF spent</Chip>
                  </QuestMeta>
                </QuestCard>
                <QuestCard label="XP">
                  <QuestTitle>XP stays in WTF OS</QuestTitle>
                  <QuestDescription>
                    XP records platform activity and never gets sent to a wallet.
                  </QuestDescription>
                  <QuestMeta>
                    <Chip $tone="green">Earned by interactions</Chip>
                    <Chip $tone="gray">Used in app systems</Chip>
                  </QuestMeta>
                </QuestCard>
              </QuestGrid>
            )}
          </TabBody>
        </div>
      </Shell>
    </AppWindow>
  );
}
