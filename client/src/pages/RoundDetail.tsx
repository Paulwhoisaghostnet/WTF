import { useQuery } from "@tanstack/react-query";
import { GroupBox, Hourglass, Button, Separator } from "react95";
import styled from "styled-components";
import { useRoute, useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { RoundInfoCard } from "../components/RoundInfoCard";
import { api } from "../lib/api";
import { presentationRouteHref, usePresentationShell } from "../lib/presentation-shell";

const roundDetailRegionAttrs = (region: string): any => ({
  "data-rounds-region": region,
});

const RoundsDetailSurface = styled.div`
  display: grid;
  gap: 12px;
  min-width: 0;

  &[data-rounds-presentation-host="gamma"] {
    color: var(--gamma-milk, #f2ead9);
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  &[data-rounds-presentation-host="gamma"],
  &[data-rounds-presentation-host="gamma"] * {
    letter-spacing: 0;
  }

  &[data-rounds-presentation-host="gamma"] [data-rounds-region] {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-rounds-presentation-host="gamma"] :where(fieldset, section, [data-rounds-region]) {
    border-color: var(--gamma-line, rgba(242, 234, 217, 0.18));
    border-radius: 6px;
  }

  &[data-rounds-presentation-host="gamma"] fieldset,
  &[data-rounds-presentation-host="gamma"] [data-rounds-region="challenge-card"] {
    background: color-mix(in srgb, var(--gamma-panel, #11110f) 82%, var(--gamma-ink, #070706));
    color: var(--gamma-milk, #f2ead9);
    border: 1px solid var(--gamma-line, rgba(242, 234, 217, 0.18));
  }

  &[data-rounds-presentation-host="gamma"] legend,
  &[data-rounds-presentation-host="gamma"] h3 {
    color: var(--gamma-cyan, #00d2ff);
  }

  &[data-rounds-presentation-host="gamma"] p,
  &[data-rounds-presentation-host="gamma"] strong {
    color: var(--gamma-milk, #f2ead9);
  }

  &[data-rounds-presentation-host="gamma"] button:not(:disabled) {
    border-color: var(--gamma-line, rgba(242, 234, 217, 0.18));
    border-radius: 5px;
  }
`;

const ChallengeCard = styled(GroupBox).attrs(roundDetailRegionAttrs("challenge-card"))`
  margin-bottom: 8px;
`;

export function RoundDetail({ roundId: propRoundId }: { roundId?: string }) {
  const [, params] = useRoute("/rounds/:id");
  const [, setLocation] = useLocation();
  const presentation = usePresentationShell();
  const goToRoute = (route: string) =>
    setLocation(presentationRouteHref(route, presentation.host));
  const roundId = propRoundId ?? params?.id;

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
      <RoundsDetailSurface
        data-rounds-presentation-host={presentation.host}
        data-rounds-surface="round-detail"
        data-rounds-region="surface"
      >
        <RoundInfoCard round={round} />

        <Separator style={{ margin: "12px 0" }} />

        <h3 data-rounds-region="detail-heading">Challenges</h3>
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
              onClick={() => goToRoute("/challenges")}
            >
              View Challenge
            </Button>
          </ChallengeCard>
        ))}
        {(!challenges || challenges.length === 0) && (
          <p>No challenges for this round yet.</p>
        )}

        <Button onClick={() => goToRoute("/rounds")} style={{ marginTop: 12 }}>
          Back to Rounds
        </Button>
      </RoundsDetailSurface>
    </AppWindow>
  );
}
