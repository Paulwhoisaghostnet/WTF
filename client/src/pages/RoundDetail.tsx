import { useQuery } from "@tanstack/react-query";
import { GroupBox, Hourglass, Button, Separator } from "react95";
import styled from "styled-components";
import { useRoute, useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";

const ChallengeCard = styled(GroupBox)`
  margin-bottom: 8px;
`;

export function RoundDetail() {
  const [, params] = useRoute("/rounds/:id");
  const [, setLocation] = useLocation();
  const roundId = params?.id;

  const { data: round, isLoading } = useQuery({
    queryKey: ["round", roundId],
    queryFn: () => api.get<any>(`/api/rounds/${roundId}`),
    enabled: !!roundId,
  });

  const { data: challenges } = useQuery({
    queryKey: ["challenges", roundId],
    queryFn: () => api.get<any[]>(`/api/challenges?roundId=${roundId}`),
    enabled: !!roundId,
  });

  if (isLoading)
    return (
      <AppWindow title="Loading...">
        <Hourglass size={32} />
      </AppWindow>
    );

  if (!round) return <AppWindow title="Round Not Found"><p>Round not found.</p></AppWindow>;

  return (
    <AppWindow title={`Round ${round.number}: ${round.name}`}>
      <GroupBox label="Details">
        <p>{round.description || "No description provided."}</p>
        <p>
          <strong>Status:</strong> {round.status}
        </p>
        {round.startDate && (
          <p>
            <strong>Start:</strong>{" "}
            {new Date(round.startDate).toLocaleDateString()}
          </p>
        )}
        {round.endDate && (
          <p>
            <strong>End:</strong>{" "}
            {new Date(round.endDate).toLocaleDateString()}
          </p>
        )}
      </GroupBox>

      <Separator style={{ margin: "12px 0" }} />

      <h3>Challenges</h3>
      {challenges?.map((c: any) => (
        <ChallengeCard key={c.id} label={c.title}>
          <p>{c.description}</p>
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
          <p>
            <strong>Status:</strong> {c.status}
          </p>
          <Button
            size="sm"
            onClick={() => setLocation(`/challenges`)}
          >
            View Challenge
          </Button>
        </ChallengeCard>
      ))}
      {(!challenges || challenges.length === 0) && (
        <p>No challenges for this round yet.</p>
      )}

      <Button onClick={() => setLocation("/rounds")} style={{ marginTop: 12 }}>
        Back to Rounds
      </Button>
    </AppWindow>
  );
}
