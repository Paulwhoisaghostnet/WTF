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

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

export function SideQuests() {
  const { canParticipate } = useAuth();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [proofText, setProofText] = useState("");
  const [proofUrl, setProofUrl] = useState("");

  const { data: quests, isLoading } = useQuery({
    queryKey: ["side-quests"],
    queryFn: () => api.get<any[]>("/api/side-quests"),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.post(`/api/side-quests/${id}/complete`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["side-quests"] });
      setExpandedId(null);
      setProofText("");
      setProofUrl("");
    },
  });

  if (isLoading)
    return (
      <AppWindow title="Side Quests">
        <Hourglass size={32} />
      </AppWindow>
    );

  return (
    <AppWindow title="Side Quests">
      <p style={{ marginBottom: 12 }}>
        Complete side quests to earn bonus WTF tokens outside of main rounds.
      </p>

      {quests?.map((q: any) => (
        <QuestCard key={q.id} label={q.title}>
          <StatusBadge $status={q.status}>{q.status.toUpperCase()}</StatusBadge>
          <p style={{ marginTop: 8 }}>{q.description}</p>
          {q.criteria && (
            <p>
              <strong>Criteria:</strong> {q.criteria}
            </p>
          )}
          {q.rewardAmountWtf > 0 && (
            <p>
              <strong>Reward:</strong> {q.rewardAmountWtf} WTF
            </p>
          )}

          {canParticipate && q.status === "active" && (
            <>
              <Separator style={{ margin: "8px 0" }} />
              {expandedId === q.id ? (
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
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      onClick={() =>
                        completeMutation.mutate({
                          id: q.id,
                          data: {
                            proofText,
                            proofUrl: proofUrl || undefined,
                          },
                        })
                      }
                      disabled={!proofText || completeMutation.isPending}
                    >
                      Submit
                    </Button>
                    <Button onClick={() => setExpandedId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" onClick={() => setExpandedId(q.id)}>
                  Complete Quest
                </Button>
              )}
            </>
          )}
        </QuestCard>
      ))}

      {(!quests || quests.length === 0) && <p>No side quests available.</p>}
    </AppWindow>
  );
}
