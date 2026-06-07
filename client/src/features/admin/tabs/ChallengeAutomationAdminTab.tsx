import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass } from "react95";
import styled from "styled-components";
import { UiButton, UiPanel, UiStatusPill } from "../../../components/wtfos-ui";
import { api } from "../../../lib/api";
import { ChallengeBuilder } from "../challenges/ChallengeBuilder";
import { ChallengeProgressView } from "../challenges/ChallengeProgressView";
import {
  challengeToBuilderState,
  emptyBuilderState,
} from "../challenges/builder-utils";
import type {
  AutomationChallenge,
  ChallengeAutomationRegistry,
  ChallengeBuilderState,
} from "../challenges/types";

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-3, 12px);
`;

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const TableWrap = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;

  th,
  td {
    border: 1px solid var(--wtf-app-border, #808080);
    padding: var(--wtf-space-1, 4px) var(--wtf-space-2, 8px);
    text-align: left;
    vertical-align: top;
  }

  th {
    background: var(--wtf-app-surface-raised, #ffffff);
  }
`;

const SummaryCell = styled.td`
  max-width: 360px;
  overflow-wrap: anywhere;
`;

const DetailSummary = styled.p`
  margin: 0;
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.45;
`;

const DEFAULT_REGISTRY: ChallengeAutomationRegistry = {
  triggers: [],
  rewardActions: [],
  predicates: [],
};

function statusButtonLabel(status: string) {
  if (status === "active") return "Pause challenge";
  if (status === "paused") return "Activate challenge";
  if (status === "draft") return "Activate challenge";
  return "Reopen challenge";
}

export function ChallengeAutomationAdminTab() {
  const queryClient = useQueryClient();
  const [builderState, setBuilderState] =
    useState<ChallengeBuilderState>(emptyBuilderState());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const registryQuery = useQuery({
    queryKey: ["admin", "challenge-automation", "registry"],
    queryFn: () =>
      api.get<ChallengeAutomationRegistry>("/api/admin/challenge-automation/registry"),
  });
  const challengesQuery = useQuery({
    queryKey: ["admin", "challenge-automation", "challenges"],
    queryFn: () =>
      api.get<{ challenges: AutomationChallenge[] }>(
        "/api/admin/challenge-automation/challenges"
      ),
  });
  const detailQuery = useQuery({
    queryKey: ["admin", "challenge-automation", "challenge", selectedId],
    queryFn: () =>
      api.get<any>(`/api/admin/challenge-automation/challenges/${selectedId}`),
    enabled: selectedId !== null,
  });
  const progressQuery = useQuery({
    queryKey: ["admin", "challenge-automation", "progress", selectedId],
    queryFn: () =>
      api.get<any>(
        `/api/admin/challenge-automation/challenges/${selectedId}/progress`
      ),
    enabled: selectedId !== null,
  });
  const eventsQuery = useQuery({
    queryKey: ["admin", "challenge-automation", "events"],
    queryFn: () =>
      api.get<any>("/api/admin/challenge-automation/events?limit=100"),
  });
  const auditQuery = useQuery({
    queryKey: ["admin", "challenge-automation", "audit", selectedId],
    queryFn: () =>
      api.get<any>(
        `/api/admin/challenge-automation/audit?limit=150${
          selectedId ? `&challengeId=${selectedId}` : ""
        }`
      ),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "challenge-automation"] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }: { id?: number | null; payload: Record<string, unknown> }) =>
      id
        ? api.patch(`/api/admin/challenge-automation/challenges/${id}`, payload)
        : api.post("/api/admin/challenge-automation/challenges", payload),
    onSuccess: () => {
      invalidate();
      setBuilderState(emptyBuilderState());
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.post(`/api/admin/challenge-automation/challenges/${id}/status`, {
        status,
      }),
    onSuccess: invalidate,
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      api.post("/api/admin/challenge-automation/seed-examples", {}),
    onSuccess: invalidate,
  });
  const seedDailyLoopsMutation = useMutation({
    mutationFn: () =>
      api.post("/api/admin/challenge-automation/seed-daily-loops", {}),
    onSuccess: invalidate,
  });

  const registry = registryQuery.data || DEFAULT_REGISTRY;
  const challenges = challengesQuery.data?.challenges || [];
  const selectedChallenge = useMemo(
    () => challenges.find((challenge) => challenge.id === selectedId) || null,
    [challenges, selectedId]
  );

  if (registryQuery.isLoading || challengesQuery.isLoading) {
    return <Hourglass />;
  }

  return (
    <Stack>
      <UiPanel title="Challenge automation registry" compact>
        <ActionRow>
          <UiStatusPill>{registry.triggers.length} triggers</UiStatusPill>
          <UiStatusPill>{registry.predicates.length} predicates</UiStatusPill>
          <UiStatusPill>{registry.rewardActions.length} reward actions</UiStatusPill>
          <UiButton
            compact
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            Seed example challenges
          </UiButton>
          <UiButton
            compact
            onClick={() => seedDailyLoopsMutation.mutate()}
            disabled={seedDailyLoopsMutation.isPending}
          >
            Seed daily side quests
          </UiButton>
        </ActionRow>
      </UiPanel>

      <ChallengeBuilder
        state={builderState}
        setState={setBuilderState}
        registry={registry}
        onSubmit={(payload, id) => saveMutation.mutate({ payload, id })}
        isPending={saveMutation.isPending}
      />

      <UiPanel title="Automation challenges" compact>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Summary</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((challenge) => {
                const nextStatus =
                  challenge.status === "active" ? "paused" : "active";
                return (
                  <tr key={challenge.id}>
                    <td>{challenge.title}</td>
                    <td>{challenge.status}</td>
                    <td>
                      {challenge.progressCount || 0} users /{" "}
                      {challenge.completionCount || 0} complete
                    </td>
                    <SummaryCell>{challenge.summary || "---"}</SummaryCell>
                    <td>
                      <ActionRow>
                        <UiButton
                          compact
                          onClick={() => setSelectedId(challenge.id)}
                        >
                          Inspect challenge
                        </UiButton>
                        <UiButton
                          compact
                          onClick={() =>
                            setBuilderState(challengeToBuilderState(challenge))
                          }
                        >
                          Edit challenge
                        </UiButton>
                        <UiButton
                          compact
                          onClick={() =>
                            statusMutation.mutate({
                              id: challenge.id,
                              status: nextStatus,
                            })
                          }
                          disabled={statusMutation.isPending}
                        >
                          {statusButtonLabel(challenge.status)}
                        </UiButton>
                        <UiButton
                          compact
                          uiVariant="danger"
                          onClick={() =>
                            statusMutation.mutate({
                              id: challenge.id,
                              status: "archived",
                            })
                          }
                          disabled={statusMutation.isPending}
                        >
                          Archive challenge
                        </UiButton>
                      </ActionRow>
                    </td>
                  </tr>
                );
              })}
              {challenges.length === 0 && (
                <tr>
                  <td>No automation challenges yet.</td>
                  <td>---</td>
                  <td>---</td>
                  <td>---</td>
                  <td>---</td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableWrap>
      </UiPanel>

      {selectedChallenge && (
        <UiPanel title={`Challenge detail: ${selectedChallenge.title}`} compact>
          <Stack>
            <DetailSummary>
              {detailQuery.data?.challenge?.summary || selectedChallenge.summary}
            </DetailSummary>
            <ChallengeProgressView
              progress={progressQuery.data?.progress}
              events={eventsQuery.data?.events}
              audit={auditQuery.data?.audit}
            />
          </Stack>
        </UiPanel>
      )}
    </Stack>
  );
}
