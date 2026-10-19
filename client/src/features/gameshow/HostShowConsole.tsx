import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { STAGE_REFRESH_INTERVAL_MS, type GameshowSubmission } from "@shared/gameshow";
import { useGameshowConnection, useGameshowStage } from "./useGameshowStage";
import { api } from "../../lib/api";
import { ContestantProvisioning } from "./ContestantProvisioning";
import { presentationRouteHref, usePresentationShell } from "../../lib/presentation-shell";

const Surface = styled.section`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
  line-height: 1.5;
  h2, h3, p { margin: 0; }
  input, select, textarea { box-sizing: border-box; max-width: 100%; font: inherit; padding: 6px; }
  textarea { width: 100%; min-height: 70px; }
  button { min-height: var(--wtf-control-min-height, 34px); white-space: normal; }
  :focus-visible { outline: 2px solid var(--wtf-app-info, #175cd3); outline-offset: 2px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--wtf-app-border, #808080); overflow-wrap: anywhere; }
  th { font-weight: bold; }
  details { padding: 8px 0; }
  summary { cursor: pointer; font-weight: bold; }
`;
const Actions = styled.div`display: flex; flex-wrap: wrap; align-items: center; gap: 8px;`;
const Stack = styled.div`display: grid; gap: 8px; min-width: 0;`;
const Columns = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); gap: 12px; min-width: 0;
`;

function SubmissionReview({ submission, title, criteria, reward, disabled, onSaved }: {
  submission: GameshowSubmission; title: string; criteria: string | null; reward: string; disabled: boolean; onSaved: () => void;
}) {
  const [grade, setGrade] = useState<"pass" | "fail" | "bonus">("pass");
  const [feedback, setFeedback] = useState("");
  const online = useGameshowConnection();
  const save = useMutation({
    networkMode: "always",
    mutationFn: () => api.put(`/api/submissions/${submission.id}/grade`, { grade, feedback }),
    onSuccess: onSaved,
  });
  return <GroupBox label={`${submission.username} · ${title}`}>
    <Stack>
      <p style={{ whiteSpace: "pre-wrap" }}><strong>Judging criteria:</strong> {criteria || "No criteria published. Resolve the challenge instructions before judging."}</p>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{submission.contentText || "Link submission"}</p>
      {submission.contentUrl && /^https?:\/\//i.test(submission.contentUrl) && <a href={submission.contentUrl} target="_blank" rel="noopener noreferrer">Open submitted evidence</a>}
      <p>{reward}</p>
      <label>Result for {submission.username}
        <select aria-label={`Result for ${submission.username}`} value={grade} onChange={event => setGrade(event.target.value as typeof grade)}>
          <option value="pass">Pass</option><option value="fail">Fail</option><option value="bonus">Bonus</option>
        </select>
      </label>
      <label>Decision notes for {submission.username}
        <textarea value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Explain how this entry meets the published criteria." />
      </label>
      <Button disabled={disabled || !online || save.isPending || !feedback.trim() || !criteria?.trim()} onClick={() => save.mutate()}>
        {save.isPending ? "Saving result…" : `Save result for ${submission.username}`}
      </Button>
      {save.isError && <p role="alert">{save.error.message}</p>}
    </Stack>
  </GroupBox>;
}

/** Live operations stay inside the existing strict-admin Control Board window. */
export function HostShowConsole({ seasonId }: { seasonId: number | null }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const presentation = usePresentationShell();
  const online = useGameshowConnection();
  const go = (path: string) => setLocation(presentationRouteHref(path, presentation.host));
  const [username, setUsername] = useState("");
  const [rosterStatus, setRosterStatus] = useState<"active" | "reserve">("active");
  const [notice, setNotice] = useState("");
  const stage = useGameshowStage(seasonId);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["gameshow-stage", seasonId] });
    qc.invalidateQueries({ queryKey: ["/api/rounds"] });
    qc.invalidateQueries({ queryKey: ["/api/seasons"] });
    qc.invalidateQueries({ queryKey: ["/api/control-board/feed"] });
  };
  const command = useMutation({
    networkMode: "always",
    mutationFn: ({ roundId, action }: { roundId: number; action: "start" | "close" | "advance" }) => api.post(`/api/rounds/${roundId}/${action}`),
    onSuccess: (_data, variables) => {
      setNotice(variables.action === "start" ? "Round opened. Contestants can now submit." : variables.action === "close" ? "Entries closed. Review the submitted work before advancing." : "Round archived. The next round waits for your start cue.");
      refresh();
    },
    onError: () => refresh(),
  });
  const enroll = useMutation({
    networkMode: "always",
    mutationFn: () => api.post<{ status: string }>(`/api/seasons/${seasonId}/contestants`, { username: username.trim(), status: rosterStatus }),
    onSuccess: (contestant) => { setNotice(`${username.trim()} is on the roster as ${contestant.status}. Existing roster positions are preserved; use the Cohort tab to manage them.`); setUsername(""); refresh(); },
  });
  if (seasonId === null) return <p>Create a season in the season editor before preparing the show. <Button onClick={() => go("/admin?section=seasons")}>Open season editor</Button></p>;
  if (stage.isLoading) return <p role="status">Loading the host run sheet…</p>;
  if (!stage.data) return <Stack><p role="alert">{stage.error?.message || "Show state is unavailable."}</p><Button onClick={() => stage.refetch()}>Retry show state</Button></Stack>;
  const show = stage.data;
  const current = show.rounds.find(round => round.id === show.currentRoundId);
  const next = show.rounds.find(round => round.status === "upcoming");
  const cue = current ?? next;
  const completed = show.rounds.filter(round => round.status === "completed").length;
  const active = show.contestants.filter(contestant => contestant.status === "active");
  const queue = show.submissions.filter(submission => submission.grade === "pending" && current?.challenges.some(challenge => challenge.id === submission.challengeId));
  const preparationGaps = show.rounds.filter(round => !round.rules?.trim() || !round.challenges.length || round.challenges.some(challenge => !challenge.criteria?.trim()));
  const stale = stage.isError || !online || stage.fetchStatus === "paused";
  return <Surface aria-label="Host show console" data-gameshow-host-console>
    <Actions><h2>Run the show</h2><Button disabled={stage.isFetching} onClick={() => stage.refetch()}>Refresh show state</Button><Button onClick={() => go(`/rounds?seasonId=${seasonId}`)}>Open contestant desk</Button></Actions>
    <p>{completed} of {show.rounds.length} rounds archived · {active.length} active contestants · {show.season.status}</p>
    <p>Updated {new Date(stage.dataUpdatedAt).toLocaleTimeString()}. Refreshes every {STAGE_REFRESH_INTERVAL_MS / 1000} seconds while this window is visible.</p>
    {stale && <p role="alert">Connection interrupted. Displayed state may be old; refresh before cueing the show.</p>}
    {notice && <p role="status">{notice}</p>}
    {(command.isError || enroll.isError) && <p role="alert">{command.error?.message || enroll.error?.message}</p>}
    {!show.canManage && <p role="alert">Your account does not have permission to manage this show.</p>}
    <details><summary>How to host this show</summary><p>Prepare the rules and challenges, enroll contestants, then start each round. Close entries when play ends. Review every submitted entry and resolve elimination drafts in the Round tab. Archive the round, then start the next when everyone is ready. The Audit tab preserves host actions.</p><p>Pass and Bonus use each challenge’s configured reward rules. These are review grades; the show’s scoring and winner rules must be published separately. Existing wallet and reward claim safeguards still apply.</p></details>
    <Columns>
      <GroupBox label="Next host cue"><Stack>
        {cue ? <>
          <h3>Round {cue.number}: {cue.name}</h3>
          <p>{cue.status === "active" ? "Play is open. Contestants can submit their entries." : cue.status === "grading" ? "Entries are closed. Review results before archiving." : "Waiting backstage. Start opens this round’s prepared challenges."}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{cue.rules || "Publish this round’s rules before opening play."}</p>
          <p>{cue.submissionCount} entries · {cue.pendingCount} awaiting review</p>
          <Actions>
            {cue.status === "upcoming" && <Button disabled={!show.canManage || stale || command.isPending || !cue.rules?.trim() || !cue.challenges.length || cue.challenges.some(challenge => !challenge.criteria?.trim())} title="Open this round and its prepared challenges for eligible contestants." onClick={() => command.mutate({ roundId: cue.id, action: "start" })}>Start round {cue.number}</Button>}
            {cue.status === "active" && <Button disabled={!show.canManage || stale || command.isPending} title="Stop new entries and move the round to review." onClick={() => command.mutate({ roundId: cue.id, action: "close" })}>Close round {cue.number} entries</Button>}
            {cue.status === "grading" && <Button disabled={!show.canManage || stale || command.isPending || cue.pendingCount > 0} title="Archive reviewed results. The next round stays closed until you start it." onClick={() => command.mutate({ roundId: cue.id, action: "advance" })}>{completed === show.rounds.length - 1 ? "Archive final round" : `Archive round ${cue.number}`}</Button>}
          </Actions>
          {command.isPending && <p role="status">Saving host cue…</p>}
        </> : <p>{show.season.status === "completed" ? "The show is complete. Review the archived round results below." : "No rounds prepared. Add your lineup in the round editor."}</p>}
      </Stack></GroupBox>
      <GroupBox label="Contestant check-in"><Stack>
        <p>Enroll an existing wtfOS username. This adds a show roster entry; required ante and wallet checks still apply.</p>
        <label>Contestant username <input value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" /></label>
        <label>Roster position <select value={rosterStatus} onChange={event => setRosterStatus(event.target.value as typeof rosterStatus)}><option value="active">Active contestant</option><option value="reserve">Reserve</option></select></label>
        <Button disabled={!show.canManage || stale || enroll.isPending || !username.trim()} onClick={() => enroll.mutate()}>{enroll.isPending ? "Enrolling contestant…" : "Enroll contestant"}</Button>
        <p>{show.contestants.length ? show.contestants.map(contestant => `${contestant.displayName || contestant.username} (${contestant.status})`).join(" · ") : "Nobody is enrolled yet."}</p>
      </Stack></GroupBox>
    </Columns>
    <ContestantProvisioning show={show} disabled={stale || !show.canManage} />
    <GroupBox label="Show preparation"><Stack>
      <p>{show.rounds.length === 10 ? "Ten round slots are present." : `${show.rounds.length} round slots are present; this production calls for ten.`} {preparationGaps.length ? `${preparationGaps.length} rounds still need rules, a challenge, or judging criteria.` : "Every round has rules, a challenge, and judging criteria."}</p>
      <Actions><Button onClick={() => go("/admin?section=rounds")}>Edit round lineup</Button><Button onClick={() => go("/admin?section=challenges")}>Edit challenges and rewards</Button></Actions>
      <p>Round slots alone do not mean the games are ready. Rehearse each game and publish scoring, tie and elimination rules before admitting contestants.</p>
    </Stack></GroupBox>
    {current?.status === "grading" && <section aria-label="Round review queue"><Stack><h3>Review round {current.number}</h3>
      {queue.length ? queue.map(submission => {
        const challenge = current.challenges.find(item => item.id === submission.challengeId)!;
        return <SubmissionReview key={submission.id} submission={submission} title={challenge.title} criteria={challenge.criteria} disabled={stale || !show.canManage} reward={`Configured pass/bonus reward: ${challenge.rewardXp} EXP; WTF reward amount: ${challenge.rewardAmountWtf}. Check the challenge reward configuration before grading.`} onSaved={() => { setNotice(`Result saved for ${submission.username}.`); refresh(); }} />;
      }) : <p>All submitted entries are reviewed. Resolve any elimination drafts in the Round tab, then archive this round.</p>}
    </Stack></section>}
    <section aria-label="Host run sheet"><h3>Run sheet and archived results</h3>
      {show.rounds.map(round => <details key={round.id}>
        <summary>Round {round.number} · {round.name} · {round.status} · {round.submissionCount} entries</summary>
        <p style={{ whiteSpace: "pre-wrap" }}>{round.rules || "Rules not published."}</p>
        <p>{round.challenges.map(challenge => challenge.title).join(" · ") || "No challenge attached."}</p>
        {round.status === "completed" && show.submissions.filter(submission => round.challenges.some(challenge => challenge.id === submission.challengeId)).map(submission => <p key={submission.id}>{submission.username}: {submission.grade}{submission.feedback ? ` — ${submission.feedback}` : ""}</p>)}
        <Button onClick={() => go(`/rounds/${round.id}`)}>Open round {round.number} instructions</Button>
      </details>)}
    </section>
  </Surface>;
}
