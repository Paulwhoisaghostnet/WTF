import { useId } from "react";
import { Button } from "react95";
import styled from "styled-components";
import type { GameshowContestantStatus, GameshowRoundStatus } from "@shared/gameshow";
import { useLocation } from "wouter";
import { presentationRouteHref, usePresentationShell } from "../../lib/presentation-shell";
import { useAuth } from "../../lib/auth-context";
import { ContestantChallenge } from "./ContestantChallenge";
import { ContestantWorkspace } from "./ContestantWorkspace";
import { useGameshowConnection, useGameshowStage } from "./useGameshowStage";
import { ShowActions, ShowDeskSurface, ShowHelp, ShowNote, ShowSection, ShowToolbar } from "./show-desk-ui";

const CueGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
  gap: 12px;
  margin: 0;
  dt { font-size: var(--wtf-type-caption, 13px); color: var(--wtf-app-muted-text, #444); }
  dd { margin: 2px 0 0; font-weight: 700; }
`;

const RunSheet = styled.ol`
  display: grid;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 0;
  li { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--wtf-app-border, #808080); }
  li:last-child { border-bottom: 0; }
`;

const roundStatus: Record<GameshowRoundStatus, string> = {
  upcoming: "Waiting for host", active: "Open for play", grading: "Host reviewing", completed: "Complete",
};
const contestantStatus: Record<GameshowContestantStatus, string> = {
  active: "Active contestant", reserve: "Reserve — wait for the host", eliminated: "Eliminated — following the show", withdrew: "Withdrawn", non_participant: "Audience member",
};

/** Contestant owner surface within the existing Rounds app; authority stays on the server. */
export function ContestantDesk({ seasonId, roundId }: { seasonId: number; roundId?: number }) {
  const { isAdmin } = useAuth();
  const stage = useGameshowStage(seasonId);
  const isConnected = useGameshowConnection();
  const runSheetHeadingId = useId();
  const presentation = usePresentationShell();
  const [, setLocation] = useLocation();
  const go = (route: string) => setLocation(presentationRouteHref(route, presentation.host));
  const data = stage.data;
  const round = data?.rounds.find((entry) => entry.id === (roundId ?? data.currentRoundId));
  const completedCount = data?.rounds.filter((entry) => entry.status === "completed").length ?? 0;
  const unavailableReason = !isConnected || stage.fetchStatus === "paused"
    ? "You are offline. Reconnect and refresh the show before submitting; your draft stays here."
    : stage.isError ? "Refresh the show successfully before submitting. The saved view may be out of date; your draft stays here." : undefined;

  return (
    <ShowDeskSurface data-gameshow-presentation-host={presentation.host} data-testid="contestant-desk" aria-label="Contestant desk">
      <ShowToolbar>
        <h2>Contestant desk</h2>
        <ShowActions>
          <Button onClick={() => stage.refetch()} disabled={stage.isFetching}>{stage.isFetching ? "Refreshing show…" : "Refresh show"}</Button>
          <ShowHelp label="How the contestant desk works">The host controls enrollment and each round. This desk refreshes while you are here. Read the rules, submit the requested response once, and return here for the next host cue.</ShowHelp>
        </ShowActions>
      </ShowToolbar>
      {stage.isError && <p role="alert">{data ? "Show updates are unavailable; the last saved view is shown. " : "The show could not be loaded. "}{stage.error instanceof Error ? stage.error.message : "Use Refresh show to try again."}</p>}
      {unavailableReason && <p role="status">{unavailableReason}</p>}
      {!data && !stage.isError && <p role="status">Loading the show and your contestant status…</p>}
      {data && <>
        <CueGrid>
          <div><dt>Your show</dt><dd>Season {data.season.number}: {data.season.name}</dd></div>
          <div><dt>Your place</dt><dd>{data.me.contestant ? contestantStatus[data.me.contestant.status] : "Not enrolled — contact the host"}</dd></div>
          <div><dt>Show progress</dt><dd>{completedCount} of {data.rounds.length} rounds complete</dd></div>
        </CueGrid>
        <ShowNote>Updated {new Date(stage.dataUpdatedAt).toLocaleTimeString()}. Updates refresh automatically while this browser tab is active.</ShowNote>
        {!data.me.contestant && <p>The host must add your wtfOS username to this season’s roster. Signing in or opening a game does not enroll you.</p>}
        {data.me.blockers.length > 0 && <ul aria-label="Your show status" style={{ margin: 0, paddingLeft: 20 }}>{data.me.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}

        <ShowSection aria-label="Current host cue">
          <ShowToolbar>
            <h3 aria-live="polite">{round ? `Round ${round.number}: ${round.name}` : data.season.status === "completed" ? "The show is complete" : "Waiting for the host’s opening cue"}</h3>
            {round && <strong role="status">{roundStatus[round.status]}</strong>}
          </ShowToolbar>
          {round ? <>
            {round.description && <p style={{ whiteSpace: "pre-wrap" }}>{round.description}</p>}
            <p style={{ whiteSpace: "pre-wrap" }}><strong>Round rules:</strong> {round.rules || "The host has not published this round’s rules yet."}</p>
            <p><strong>What happens next:</strong> {round.status === "upcoming" ? "Read the instructions while the host prepares this round. Wait for Open for play before submitting." : round.status === "active" ? "Follow the instructions below and submit your response before the host closes the round." : round.status === "grading" ? "Submissions are closed. The host is reviewing responses; your result and feedback appear below." : "This round is complete. Follow the current cue from the host or review your saved responses below."}</p>
            {round.challenges.length === 0 && <p>No game or challenge has been configured for this round. The host needs to publish the game, instructions, and judging criteria before it can run.</p>}
            {round.challenges.map((challenge) => <ContestantChallenge key={challenge.id} seasonId={seasonId} challenge={challenge} submission={data.me.submissions.find((entry) => entry.challengeId === challenge.id)} canSubmit={data.me.canSubmit && round.id === data.currentRoundId && !unavailableReason} unavailableReason={unavailableReason} />)}
          </> : <p>{data.season.status === "completed" ? "Review the run sheet and your recorded responses. The host announces the result using the published show rules." : "The host will prepare and open a round. You can review the run sheet while you wait."}</p>}
        </ShowSection>

        <ContestantWorkspace />

        {!roundId && <ShowSection aria-labelledby={runSheetHeadingId}>
          <ShowToolbar>
            <h3 id={runSheetHeadingId}>Show run sheet</h3>
            <ShowHelp label="How the run sheet works">Every scheduled round appears here. Waiting for host means the round has not opened. Open for play accepts responses. Host reviewing locks responses. Complete records the end of that round.</ShowHelp>
          </ShowToolbar>
          {data.rounds.length === 0 ? <p>The host has not configured the lineup. No rounds are ready to play yet.</p> : <RunSheet>{data.rounds.map((entry) => <li key={entry.id} aria-current={entry.id === data.currentRoundId ? "step" : undefined}>
            <div><strong>{entry.number}. {entry.name}</strong><ShowNote>{roundStatus[entry.status]} · {entry.challenges.length === 0 ? "Game not configured" : `${entry.challenges.length} challenge${entry.challenges.length === 1 ? "" : "s"}`}</ShowNote></div>
            <Button onClick={() => go(`/rounds/${entry.id}`)}>Read round {entry.number}</Button>
          </li>)}</RunSheet>}
        </ShowSection>}

        <ShowActions>
          {roundId && <Button onClick={() => go(`/rounds?seasonId=${seasonId}`)}>Return to contestant desk</Button>}
          <Button onClick={() => go("/mission-control")}>Open my rewards & activity</Button>
          {isAdmin && data.canManage && <Button onClick={() => go(`/control-board?seasonId=${seasonId}`)}>Open host control board</Button>}
        </ShowActions>
      </>}
    </ShowDeskSurface>
  );
}
