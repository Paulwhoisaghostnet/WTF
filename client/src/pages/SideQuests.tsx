import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  TextInput,
  Hourglass,
  Separator,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";

const QuestCard = styled(GroupBox)`
  margin-bottom: 12px;
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 2px 6px;
  font-size: 11px;
  font-weight: bold;
  background: ${(p) =>
    p.$status === "active" ? "#00aa00" : p.$status === "completed" ? "#808080" : "#0000aa"};
  color: white;
`;

const CompletionBadge = styled.span<{ $state: "approved" | "pending" | "rejected" }>`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: bold;
  margin-left: 8px;
  background: ${(p) =>
    p.$state === "approved" ? "#008800" : p.$state === "rejected" ? "#880000" : "#886600"};
  color: white;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const RewardInfo = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 13px;
`;

const VERIFY_LABELS: Record<string, string> = {
  profile_avatar: "Set your profile avatar",
  profile_bio: "Write a profile bio",
  wallet_connected: "Connect a Tezos wallet",
  social_twitter: "Link your Twitter/X account",
  social_discord: "Link your Discord account",
  post_message: "Post in the message board",
};

export function SideQuests() {
  const { user, canParticipate } = useAuth();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [proofText, setProofText] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: quests, isLoading } = useQuery({
    queryKey: ["side-quests"],
    queryFn: () => api.get<any[]>("/api/side-quests"),
  });

  const { data: myCompletions } = useQuery({
    queryKey: ["side-quests", "my-completions"],
    queryFn: () => api.get<any[]>("/api/side-quests/my/completions"),
    enabled: !!user,
  });

  const completionMap = new Map(
    (myCompletions || []).map((c: any) => [c.sideQuestId, c])
  );

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.post(`/api/side-quests/${id}/complete`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["side-quests"] });
      qc.invalidateQueries({ queryKey: ["side-quests", "my-completions"] });
      setExpandedId(null);
      setProofText("");
      setProofUrl("");
      setSubmitError(null);
    },
    onError: (err: any) => {
      setSubmitError(err?.message || "Failed to submit");
    },
  });

  if (isLoading)
    return (
      <AppWindow title="Side Quests">
        <Hourglass size={32} />
      </AppWindow>
    );

  const activeQuests = (quests || []).filter((q: any) => q.status === "active");
  const completedQuests = (quests || []).filter((q: any) => q.status === "completed");

  return (
    <AppWindow title="Side Quests">
      <p style={{ marginBottom: 12 }}>
        Complete side quests to earn bonus WTF tokens and XP outside of main rounds.
      </p>

      {activeQuests.map((q: any) => {
        const myComp = completionMap.get(q.id);
        const isAutoVerify = q.autoVerifyType && q.autoVerifyType !== "manual";

        return (
          <QuestCard key={q.id} label={q.title}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusBadge $status={q.status}>{q.status.toUpperCase()}</StatusBadge>
              {q.persistent && (
                <span style={{ fontSize: 10, background: "#006", color: "#fff", padding: "1px 5px" }}>
                  PERSISTENT
                </span>
              )}
              {isAutoVerify && (
                <span style={{ fontSize: 10, background: "#060", color: "#fff", padding: "1px 5px" }}>
                  AUTO-VERIFY
                </span>
              )}
              {myComp && (
                <CompletionBadge
                  $state={myComp.approved === true ? "approved" : myComp.approved === false ? "rejected" : "pending"}
                >
                  {myComp.approved === true ? "COMPLETED" : myComp.approved === false ? "REJECTED" : "PENDING REVIEW"}
                </CompletionBadge>
              )}
            </div>
            <p style={{ marginTop: 8 }}>{q.description}</p>
            {q.criteria && (
              <p>
                <strong>Criteria:</strong> {q.criteria}
              </p>
            )}
            {isAutoVerify && (
              <p style={{ fontSize: 12, color: "#555" }}>
                <strong>How to complete:</strong> {VERIFY_LABELS[q.autoVerifyType] || q.autoVerifyType}
              </p>
            )}

            <RewardInfo>
              {(q.rewardAmountWtf ?? 0) > 0 && <span><strong>{q.rewardAmountWtf} WTF</strong></span>}
              {(q.rewardXp ?? 0) > 0 && <span><strong>{q.rewardXp} XP</strong></span>}
            </RewardInfo>

            {q.deadline && (
              <p style={{ fontSize: 12 }}>
                <strong>Deadline:</strong> {new Date(q.deadline).toLocaleString()}
              </p>
            )}
            {q.maxCompletions && (
              <p style={{ fontSize: 12 }}>
                <strong>Max completions:</strong> {q.maxCompletions}
              </p>
            )}

            {canParticipate && !myComp && q.status === "active" && (
              <>
                <Separator style={{ margin: "8px 0" }} />
                {isAutoVerify ? (
                  <Button
                    onClick={() => {
                      setSubmitError(null);
                      completeMutation.mutate({ id: q.id, data: {} });
                    }}
                    disabled={completeMutation.isPending}
                  >
                    {completeMutation.isPending ? "Verifying..." : "Verify & Complete"}
                  </Button>
                ) : expandedId === q.id ? (
                  <div>
                    <Field>
                      <label>Proof / Description</label>
                      <TextInput
                        value={proofText}
                        onChange={(e: any) => setProofText(e.target.value)}
                        placeholder="Describe how you completed the quest..."
                        multiline
                        fullWidth
                      />
                    </Field>
                    <Field>
                      <label>Proof Link (optional)</label>
                      <TextInput
                        value={proofUrl}
                        onChange={(e: any) => setProofUrl(e.target.value)}
                        placeholder="https://..."
                        fullWidth
                      />
                    </Field>
                    {submitError && (
                      <p style={{ color: "red", fontSize: 12, marginBottom: 8 }}>{submitError}</p>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        onClick={() => {
                          setSubmitError(null);
                          completeMutation.mutate({
                            id: q.id,
                            data: { proofText, proofUrl: proofUrl || undefined },
                          });
                        }}
                        disabled={!proofText || completeMutation.isPending}
                      >
                        Submit
                      </Button>
                      <Button onClick={() => { setExpandedId(null); setSubmitError(null); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setExpandedId(q.id)}>
                    Complete Quest
                  </Button>
                )}
                {submitError && expandedId !== q.id && isAutoVerify && (
                  <p style={{ color: "red", fontSize: 12, marginTop: 4 }}>{submitError}</p>
                )}
              </>
            )}

            {myComp && myComp.approved === true && myComp.xpAwarded > 0 && (
              <p style={{ fontSize: 12, color: "green", marginTop: 4 }}>
                Rewarded: +{myComp.xpAwarded} XP
              </p>
            )}
          </QuestCard>
        );
      })}

      {completedQuests.length > 0 && (
        <>
          <Separator style={{ margin: "16px 0" }} />
          <h4 style={{ marginBottom: 8 }}>Completed Quests</h4>
          {completedQuests.map((q: any) => {
            const myComp = completionMap.get(q.id);
            return (
              <QuestCard key={q.id} label={q.title} style={{ opacity: 0.7 }}>
                <StatusBadge $status="completed">COMPLETED</StatusBadge>
                {myComp && (
                  <CompletionBadge $state={myComp.approved === true ? "approved" : "pending"}>
                    {myComp.approved === true ? "YOU COMPLETED THIS" : "SUBMITTED"}
                  </CompletionBadge>
                )}
                <p style={{ marginTop: 8 }}>{q.description}</p>
              </QuestCard>
            );
          })}
        </>
      )}

      {activeQuests.length === 0 && completedQuests.length === 0 && (
        <p>No side quests available.</p>
      )}
    </AppWindow>
  );
}
