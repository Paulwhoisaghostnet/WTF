import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass } from "react95";
import styled from "styled-components";
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
  gap: 12px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

const TableWrap = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    border: 1px solid #808080;
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
  }

  th {
    background: #c0c0c0;
  }
`;

const DEFAULT_REGISTRY: ChallengeAutomationRegistry = {
  triggers: [],
  rewardActions: [],
  predicates: [],
};

function statusButtonLabel(status: string) {
  if (status === "active") return "Pause";
  if (status === "paused") return "Activate";
  if (status === "draft") return "Activate";
  return "Reopen";
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
      <GroupBox label="Challenge Automation Registry">
        <ActionRow>
          <span>{registry.triggers.length} triggers</span>
          <span>{registry.predicates.length} predicates</span>
          <span>{registry.rewardActions.length} reward actions</span>
          <Button
            size="sm"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            Seed Examples
          </Button>
        </ActionRow>
      </GroupBox>

      <ChallengeBuilder
        state={builderState}
        setState={setBuilderState}
        registry={registry}
        onSubmit={(payload, id) => saveMutation.mutate({ payload, id })}
        isPending={saveMutation.isPending}
      />

      <GroupBox label="Automation Challenges">
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
                    <td style={{ maxWidth: 360 }}>{challenge.summary || "---"}</td>
                    <td>
                      <ActionRow>
                        <Button
                          size="sm"
                          onClick={() => setSelectedId(challenge.id)}
                        >
                          Inspect
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            setBuilderState(challengeToBuilderState(challenge))
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            statusMutation.mutate({
                              id: challenge.id,
                              status: nextStatus,
                            })
                          }
                          disabled={statusMutation.isPending}
                        >
                          {statusButtonLabel(challenge.status)}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            statusMutation.mutate({
                              id: challenge.id,
                              status: "archived",
                            })
                          }
                          disabled={statusMutation.isPending}
                        >
                          Archive
                        </Button>
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
      </GroupBox>

      {selectedChallenge && (
        <GroupBox label={`Challenge Detail: ${selectedChallenge.title}`}>
          <Stack>
            <p>{detailQuery.data?.challenge?.summary || selectedChallenge.summary}</p>
            <ChallengeProgressView
              progress={progressQuery.data?.progress}
              events={eventsQuery.data?.events}
              audit={auditQuery.data?.audit}
            />
          </Stack>
        </GroupBox>
      )}
    </Stack>
  );
}
