import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Fieldset,
  GroupBox,
  Hourglass,
  Separator,
  Tab,
  TabBody,
  Tabs,
  TextInput,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { usePresentationShell } from "../lib/presentation-shell";
import { customerChallengeTitle } from "./challenge-display";

type ChallengeRow = {
  id: number;
  title: string;
  description?: string | null;
  criteria?: string | null;
  rules?: string | null;
  status?: string | null;
  deadline?: string | null;
  rewardAmountWtf?: number | null;
  rewardXp?: number | null;
};

const gammaProgressionScope = `[data-progression-presentation-host="gamma"]`;

const Shell = styled.div`
  display: grid;
  gap: 12px;
  min-width: 0;

  &[data-progression-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-progression-presentation-host="gamma"] [data-progression-region] {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-progression-presentation-host="gamma"] button,
  &[data-progression-presentation-host="gamma"] input,
  &[data-progression-presentation-host="gamma"] textarea {
    letter-spacing: 0;
  }
`;

const IntroPanel = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid #808080;
  background: var(--wtf-app-info-bg, #dce7e2);
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;

  ${gammaProgressionScope} & {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #0d0d0b;
    color: #f2ead9;
    padding: 12px;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const PageTitle = styled.h2`
  margin: 0;
  font-size: 22px;
`;

const PageCopy = styled.p`
  margin: 4px 0 0;
  font-size: var(--wtf-type-body, 15px);
  line-height: 1.4;

  ${gammaProgressionScope} & {
    color: rgba(242, 234, 217, 0.72);
  }
`;

const StatStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(78px, 1fr));
  gap: 6px;
  min-width: 260px;

  @media (max-width: 720px) {
    min-width: 0;
  }
`;

const Stat = styled.div`
  min-height: 48px;
  border: 2px inset #c0c0c0;
  background: var(--wtf-app-surface-raised, #f5f5f5);
  padding: 6px;
  font-size: var(--wtf-type-caption, 13px);

  ${gammaProgressionScope} & {
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 5px;
    background: #0a0a09;
    color: rgba(242, 234, 217, 0.68);
  }

  strong {
    display: block;
    margin-top: 2px;
    font-size: 16px;

    ${gammaProgressionScope} & {
      color: #f2ead9;
    }
  }
`;

const ChallengeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 840px) {
    grid-template-columns: 1fr;
  }
`;

const ChallengeCard = styled(GroupBox)`
  min-width: 0;

  ${gammaProgressionScope} & {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #10100e;
  }
`;

const ChallengeHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
`;

const ChallengeTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  overflow-wrap: anywhere;
`;

const ChallengeCopy = styled.p`
  margin: 6px 0 0;
  font-size: var(--wtf-type-body, 15px);
  line-height: 1.35;

  ${gammaProgressionScope} & {
    color: rgba(242, 234, 217, 0.72);
  }
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const Chip = styled.span<{ $tone?: "green" | "blue" | "gold" | "gray" | "red" }>`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
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
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: #202020;

  ${gammaProgressionScope} & {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 4px;
    background: transparent;
    color: ${(p) =>
      p.$tone === "green"
        ? "#d6ff3f"
        : p.$tone === "blue"
          ? "#00d2ff"
          : p.$tone === "gold"
            ? "#f2ead9"
            : p.$tone === "red"
              ? "#ff7a7a"
              : "rgba(242, 234, 217, 0.68)"};
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12px;
    text-transform: uppercase;
  }
`;

const DetailNote = styled.div`
  margin-top: 8px;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
  color: var(--wtf-app-muted-text, #303030);

  ${gammaProgressionScope} & {
    color: rgba(242, 234, 217, 0.68);
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const SubmissionBox = styled.div`
  margin-top: 8px;
  padding: 8px;
  background: #f0f0f0;
  border: 1px solid #999;

  ${gammaProgressionScope} & {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 5px;
    background: #0a0a09;
    color: #f2ead9;
  }
`;

const EmptyState = styled.div`
  padding: 14px;
  border: 1px dashed var(--wtf-app-border, #777777);
  background: var(--wtf-app-surface, #f6f6f6);
  font-size: var(--wtf-type-body, 15px);

  ${gammaProgressionScope} & {
    border-color: rgba(242, 234, 217, 0.24);
    border-radius: 6px;
    background: #0a0a09;
    color: rgba(242, 234, 217, 0.7);
  }
`;

function statusLabel(status: string | null | undefined) {
  if (status === "active") return "Open";
  if (status === "grading") return "In judging";
  if (status === "completed") return "Complete";
  if (status === "archived") return "Archived";
  return status || "Draft";
}

function statusTone(status: string | null | undefined) {
  if (status === "active") return "green" as const;
  if (status === "grading") return "gold" as const;
  if (status === "completed") return "gray" as const;
  if (status === "archived") return "gray" as const;
  return "blue" as const;
}

function rewardLabel(challenge: ChallengeRow) {
  const parts = [];
  if ((challenge.rewardAmountWtf ?? 0) > 0) parts.push(`${challenge.rewardAmountWtf} WTF`);
  if ((challenge.rewardXp ?? 0) > 0) parts.push(`${challenge.rewardXp} XP`);
  return parts.join(" + ") || "Bragging rights";
}

export function Challenges() {
  const { user, canParticipate } = useAuth();
  const presentation = usePresentationShell();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [submitText, setSubmitText] = useState("");
  const [submitUrl, setSubmitUrl] = useState("");

  const { data: challenges, isLoading } = useQuery({
    queryKey: ["challenges"],
    queryFn: () => api.get<ChallengeRow[]>("/api/challenges"),
  });

  const { data: detailData } = useQuery({
    queryKey: ["challenges", expandedId, "detail"],
    queryFn: () => api.get<any>(`/api/challenges/${expandedId}`),
    enabled: expandedId !== null && !!user,
  });

  const submitMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.post(`/api/challenges/${id}/submit`, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      qc.invalidateQueries({ queryKey: ["challenges", vars.id, "detail"] });
      setSubmitText("");
      setSubmitUrl("");
    },
  });

  const challengeRows = challenges ?? [];
  const activeChallenges = useMemo(
    () =>
      challengeRows.filter(
        (challenge) => challenge.status === "active" || challenge.status === "grading"
      ),
    [challengeRows]
  );
  const completedChallenges = useMemo(
    () =>
      challengeRows.filter(
        (challenge) => challenge.status !== "active" && challenge.status !== "grading"
      ),
    [challengeRows]
  );
  const visibleChallenges =
    tab === 0 ? activeChallenges : tab === 1 ? completedChallenges : challengeRows;

  if (isLoading) {
    return (
      <AppWindow title="Challenges">
        <Hourglass size={32} />
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Challenges">
      <Shell
        data-progression-presentation-host={presentation.host}
        data-progression-surface="challenges"
        data-progression-region="shell"
      >
        <IntroPanel data-progression-region="intro-panel">
          <div>
            <PageTitle>Challenges</PageTitle>
            <PageCopy>
              Bigger missions that can span multiple side quests, submissions, or show events.
            </PageCopy>
          </div>
          <StatStrip data-progression-region="stat-strip">
            <Stat data-progression-region="stat">
              Open
              <strong>{activeChallenges.length}</strong>
            </Stat>
            <Stat data-progression-region="stat">
              Complete
              <strong>{completedChallenges.length}</strong>
            </Stat>
            <Stat data-progression-region="stat">
              Total
              <strong>{challengeRows.length}</strong>
            </Stat>
          </StatStrip>
        </IntroPanel>

        <div>
          <Tabs value={tab} onChange={(value: number) => setTab(value)}>
            <Tab value={0}>Open</Tab>
            <Tab value={1}>Past</Tab>
            <Tab value={2}>All</Tab>
          </Tabs>
          <TabBody data-progression-region="tab-body">
            {visibleChallenges.length === 0 ? (
              <EmptyState>No challenges in this view.</EmptyState>
            ) : (
              <ChallengeGrid data-progression-region="challenge-grid">
                {visibleChallenges.map((challenge) => {
                  const isExpanded = expandedId === challenge.id;
                  const displayTitle = customerChallengeTitle(challenge.title);
                  const mySub =
                    isExpanded && detailData?.submissions
                      ? detailData.submissions.find((submission: any) => submission.userId === user?.id)
                      : null;

                  return (
                    <ChallengeCard
                      key={challenge.id}
                      label="Challenge"
                      data-progression-region="challenge-card"
                    >
                      <ChallengeHeader>
                        <div>
                          <ChallengeTitle>{displayTitle}</ChallengeTitle>
                          <ChallengeCopy>{challenge.description}</ChallengeCopy>
                        </div>
                        <Chip $tone={statusTone(challenge.status)}>{statusLabel(challenge.status)}</Chip>
                      </ChallengeHeader>
                      <ChipRow>
                        <Chip $tone="blue">{rewardLabel(challenge)}</Chip>
                        {challenge.deadline && (
                          <Chip $tone="gold">
                            Due {new Date(challenge.deadline).toLocaleDateString()}
                          </Chip>
                        )}
                      </ChipRow>

                      {challenge.criteria && (
                        <DetailNote>
                          <strong>Win condition:</strong> {challenge.criteria}
                        </DetailNote>
                      )}
                      {challenge.rules && (
                        <DetailNote>
                          <strong>Rules:</strong> {challenge.rules}
                        </DetailNote>
                      )}

                      {user && (
                        <Button
                          size="sm"
                          style={{ marginTop: 10 }}
                          onClick={() => setExpandedId(isExpanded ? null : challenge.id)}
                        >
                          {isExpanded ? "Hide Details" : "View Details"}
                        </Button>
                      )}

                      {isExpanded && user && detailData?.cockpitProgress && (
                        <Fieldset
                          label="Your activity stats"
                          style={{ marginTop: 10, fontSize: 12 }}
                          data-progression-region="activity-stats"
                        >
                          <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                            <li>
                              Holdings with balance &gt; 0:{" "}
                              <strong>{detailData.cockpitProgress.holdingsWithBalance}</strong>
                            </li>
                            <li>
                              Non-WTF FA2 positions:{" "}
                              <strong>{detailData.cockpitProgress.nonWtfHoldingsWithBalance}</strong>
                            </li>
                            <li>
                              Mint events indexed:{" "}
                              <strong>{detailData.cockpitProgress.mintEventCount}</strong>
                            </li>
                            <li>
                              Trade-board listing slots:{" "}
                              <strong>{detailData.cockpitProgress.tradeBoardListedQuantity}</strong>
                            </li>
                          </ul>
                        </Fieldset>
                      )}

                      {isExpanded && mySub && (
                        <SubmissionBox data-progression-region="submission-box">
                          <strong>Your Submission</strong>
                          <Chip $tone={mySub.grade === "fail" ? "red" : mySub.grade === "pending" ? "gold" : "green"}>
                            {String(mySub.grade || "pending").toUpperCase()}
                          </Chip>
                          <p style={{ marginTop: 4 }}>{mySub.contentText}</p>
                          {mySub.contentUrl && (
                            <p>
                              <a href={mySub.contentUrl} target="_blank" rel="noopener noreferrer">
                                {mySub.contentUrl}
                              </a>
                            </p>
                          )}
                          {mySub.feedback && (
                            <p style={{ marginTop: 4, fontStyle: "italic" }}>
                              <strong>Feedback:</strong> {mySub.feedback}
                            </p>
                          )}
                          <DetailNote style={{ color: mySub.grade === "fail" ? "#8a1a1a" : "#1f6b25" }}>
                            {mySub.grade === "fail"
                              ? "Submission did not pass."
                              : mySub.rewardDistributed
                                ? "Reward distributed."
                                : "Reward pending distribution."}
                          </DetailNote>
                        </SubmissionBox>
                      )}

                      {isExpanded && !mySub && canParticipate && challenge.status === "active" && (
                        <>
                          <Separator style={{ margin: "10px 0" }} />
                          <Field>
                            <label>Your Response</label>
                            <TextInput
                              value={submitText}
                              onChange={(event: any) => setSubmitText(event.target.value)}
                              placeholder="Describe your submission..."
                              multiline
                              fullWidth
                            />
                          </Field>
                          <Field>
                            <label>Link (optional)</label>
                            <TextInput
                              value={submitUrl}
                              onChange={(event: any) => setSubmitUrl(event.target.value)}
                              placeholder="https://..."
                              fullWidth
                            />
                          </Field>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Button
                              size="sm"
                              onClick={() =>
                                submitMutation.mutate({
                                  id: challenge.id,
                                  data: {
                                    contentText: submitText,
                                    contentUrl: submitUrl || undefined,
                                  },
                                })
                              }
                              disabled={!submitText || submitMutation.isPending}
                            >
                              Submit Response
                            </Button>
                            <Button size="sm" onClick={() => setExpandedId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}

                      {isExpanded && !mySub && (!canParticipate || challenge.status !== "active") && (
                        <DetailNote>
                          {challenge.status !== "active"
                            ? "This challenge is not accepting submissions."
                            : "Participant access is required to submit."}
                        </DetailNote>
                      )}
                    </ChallengeCard>
                  );
                })}
              </ChallengeGrid>
            )}
          </TabBody>
        </div>
      </Shell>
    </AppWindow>
  );
}
