import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  TextInput,
  Hourglass,
  Separator,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
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

export function Challenges() {
  const { user, isAdmin, canParticipate } = useAuth();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [submitText, setSubmitText] = useState("");
  const [submitUrl, setSubmitUrl] = useState("");

  const { data: challenges, isLoading } = useQuery({
    queryKey: ["challenges"],
    queryFn: () => api.get<any[]>("/api/challenges"),
  });

  const submitMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.post(`/api/challenges/${id}/submit`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      setSubmitText("");
      setSubmitUrl("");
      setExpandedId(null);
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
      {challenges?.map((c: any) => (
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
          {c.rewardAmountWtf > 0 && (
            <p>
              <strong>Reward:</strong> {c.rewardAmountWtf} WTF
            </p>
          )}
          {c.deadline && (
            <p>
              <strong>Deadline:</strong>{" "}
              {new Date(c.deadline).toLocaleString()}
            </p>
          )}

          {canParticipate && c.status === "active" && (
            <>
              <Separator style={{ margin: "8px 0" }} />
              {expandedId === c.id ? (
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
              ) : (
                <Button size="sm" onClick={() => setExpandedId(c.id)}>
                  Submit Response
                </Button>
              )}
            </>
          )}
        </ChallengeCard>
      ))}

      {(!challenges || challenges.length === 0) && (
        <p>No challenges available.</p>
      )}
    </AppWindow>
  );
}
