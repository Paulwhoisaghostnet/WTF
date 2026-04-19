import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  TextInput,
  Hourglass,
  Separator,
  Fieldset,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";

const ChallengeCard = styled(GroupBox)`
  margin-bottom: 12px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 2px 6px;
  font-size: 11px;
  font-weight: bold;
  background: ${(p) =>
    p.$status === "active"
      ? "#00aa00"
      : p.$status === "grading"
        ? "#aaaa00"
        : p.$status === "completed"
          ? "#808080"
          : "#0000aa"};
  color: white;
`;

const GradeBadge = styled.span<{ $grade: string }>`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: bold;
  margin-left: 8px;
  background: ${(p) =>
    p.$grade === "pass"
      ? "#008800"
      : p.$grade === "bonus"
        ? "#006688"
        : p.$grade === "fail"
          ? "#880000"
          : "#886600"};
  color: white;
`;

const SubmissionBox = styled.div`
  margin-top: 8px;
  padding: 8px;
  background: #f0f0f0;
  border: 1px solid #999;
`;

export function Challenges() {
  const { user, canParticipate } = useAuth();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [submitText, setSubmitText] = useState("");
  const [submitUrl, setSubmitUrl] = useState("");

  const { data: challenges, isLoading } = useQuery({
    queryKey: ["challenges"],
    queryFn: () => api.get<any[]>("/api/challenges"),
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

  if (isLoading)
    return (
      <AppWindow title="Challenges">
        <Hourglass size={32} />
      </AppWindow>
    );

  return (
    <AppWindow title="Challenges">
      {(challenges || []).map((c: any) => {
        const isExpanded = expandedId === c.id;
        const mySub = isExpanded && detailData?.submissions
          ? detailData.submissions.find((s: any) => s.userId === user?.id)
          : null;

        return (
          <ChallengeCard key={c.id} label={c.title}>
            <StatusBadge $status={c.status}>{c.status.toUpperCase()}</StatusBadge>
            <p style={{ marginTop: 8 }}>{c.description}</p>
            {c.criteria && (
              <p>
                <strong>Criteria:</strong> {c.criteria}
              </p>
            )}
            {c.rules && (
              <p>
                <strong>Rules:</strong> {c.rules}
              </p>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 13 }}>
              {c.rewardAmountWtf > 0 && <span><strong>{c.rewardAmountWtf} WTF</strong></span>}
              {c.rewardXp > 0 && <span><strong>{c.rewardXp} XP</strong></span>}
            </div>
            {c.deadline && (
              <p style={{ fontSize: 12 }}>
                <strong>Deadline:</strong> {new Date(c.deadline).toLocaleString()}
              </p>
            )}

            {user && (
              <Button
                size="sm"
                style={{ marginTop: 6 }}
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
              >
                {isExpanded ? "Hide Details" : "View Details"}
              </Button>
            )}

            {isExpanded && user && detailData?.cockpitProgress && (
              <Fieldset
                label="Your cockpit stats (for criteria that depend on holdings & activity)"
                style={{ marginTop: 10, fontSize: 12 }}
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
              <SubmissionBox>
                <strong>Your Submission</strong>
                <GradeBadge $grade={mySub.grade}>{mySub.grade.toUpperCase()}</GradeBadge>
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
                {mySub.grade === "pass" || mySub.grade === "bonus" ? (
                  <p style={{ color: "green", fontSize: 12 }}>
                    {mySub.rewardDistributed ? "Reward distributed" : "Reward pending distribution"}
                  </p>
                ) : mySub.grade === "fail" ? (
                  <p style={{ color: "red", fontSize: 12 }}>Submission did not pass</p>
                ) : (
                  <p style={{ color: "#886600", fontSize: 12 }}>Awaiting grading...</p>
                )}
              </SubmissionBox>
            )}

            {isExpanded && !mySub && canParticipate && c.status === "active" && (
              <>
                <Separator style={{ margin: "8px 0" }} />
                <div>
                  <Field>
                    <label>Your Response</label>
                    <TextInput
                      value={submitText}
                      onChange={(e: any) => setSubmitText(e.target.value)}
                      placeholder="Describe your submission..."
                      multiline
                      fullWidth
                    />
                  </Field>
                  <Field>
                    <label>Link (optional)</label>
                    <TextInput
                      value={submitUrl}
                      onChange={(e: any) => setSubmitUrl(e.target.value)}
                      placeholder="https://..."
                      fullWidth
                    />
                  </Field>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      onClick={() =>
                        submitMutation.mutate({
                          id: c.id,
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
                    <Button onClick={() => setExpandedId(null)}>Cancel</Button>
                  </div>
                </div>
              </>
            )}

            {isExpanded && !mySub && (!canParticipate || c.status !== "active") && (
              <p style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
                {c.status !== "active" ? "This challenge is no longer accepting submissions." : "You need participant privileges to submit."}
              </p>
            )}
          </ChallengeCard>
        );
      })}

      {(!challenges || challenges.length === 0) && (
        <p>No challenges available.</p>
      )}
    </AppWindow>
  );
}
