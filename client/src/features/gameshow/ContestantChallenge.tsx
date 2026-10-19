import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "react95";
import styled from "styled-components";
import type { GameshowStageChallenge, GameshowSubmission } from "@shared/gameshow";
import { api } from "../../lib/api";
import { gameshowStageKey } from "./useGameshowStage";
import { ShowNote, ShowSection } from "./show-desk-ui";
import { ContestantToolLinks } from "./ContestantWorkspace";

const AnswerForm = styled.form`
  display: grid;
  gap: 8px;
  label { display: grid; gap: 4px; font-weight: 700; }
  input, textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 8px;
    border: 1px solid var(--wtf-app-border, #808080);
    background: var(--wtf-app-surface, #fff);
    color: var(--wtf-app-text, #111);
    font: inherit;
    font-weight: normal;
  }
  textarea { resize: vertical; }
  button { justify-self: start; }
`;

function safeAnswerUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

export function ContestantChallenge({
  seasonId, challenge, submission, canSubmit, unavailableReason,
}: {
  seasonId: number;
  challenge: GameshowStageChallenge;
  submission: GameshowSubmission | undefined;
  canSubmit: boolean;
  unavailableReason?: string;
}) {
  const fieldId = useId();
  const qc = useQueryClient();
  const [answer, setAnswer] = useState("");
  const [answerUrl, setAnswerUrl] = useState("");
  const submit = useMutation({
    networkMode: "always",
    mutationFn: () => api.post<GameshowSubmission>(`/api/challenges/${challenge.id}/submit`, {
      contentText: answer.trim() || null,
      contentUrl: answerUrl.trim() || null,
    }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: gameshowStageKey(seasonId) }),
        qc.invalidateQueries({ queryKey: ["challenges"] }),
      ]);
    },
  });
  // Keep the durable receipt visible even when a subsequent stage refresh fails.
  const receipt = submission ?? submit.data;
  const deadlinePassed = challenge.deadline ? new Date(challenge.deadline).getTime() <= Date.now() : false;
  const accepting = canSubmit && challenge.status === "active" && !deadlinePassed;
  const receiptUrl = receipt?.contentUrl ? safeAnswerUrl(receipt.contentUrl) : null;

  return (
    <ShowSection aria-labelledby={`${fieldId}-heading`} data-testid={`contestant-challenge-${challenge.id}`}>
      <h4 id={`${fieldId}-heading`}>{challenge.title}</h4>
      <p style={{ whiteSpace: "pre-wrap" }}>{challenge.description}</p>
      <p><strong>What counts:</strong> {challenge.criteria || "The host has not published judging criteria yet."}</p>
      {challenge.rules && <p style={{ whiteSpace: "pre-wrap" }}><strong>Rules:</strong> {challenge.rules}</p>}
      {challenge.deadline && <ShowNote>Submission deadline: {new Date(challenge.deadline).toLocaleString()}</ShowNote>}
      {Boolean(challenge.tools?.length) && <div aria-label="Tools for this task">
        <p><strong>Tools for this task</strong></p>
        <ContestantToolLinks toolIds={challenge.tools!} />
      </div>}
      {receipt ? (
        <div data-testid="contestant-submission-receipt">
          <p role="status"><strong>Response recorded · {receipt.grade === "pending" ? "awaiting host review" : receipt.grade}</strong></p>
          {receipt.contentText && <p style={{ whiteSpace: "pre-wrap" }}>{receipt.contentText}</p>}
          {receiptUrl && <a href={receiptUrl} target="_blank" rel="noopener noreferrer">Open your submitted link</a>}
          {receipt.feedback && <p><strong>Host feedback:</strong> {receipt.feedback}</p>}
          <ShowNote>Your response is saved. The host will close submissions, review the round, and cue what happens next.</ShowNote>
        </div>
      ) : accepting ? (
        <AnswerForm onSubmit={(event) => { event.preventDefault(); submit.mutate(); }}>
          <label htmlFor={`${fieldId}-answer`}>Your response
            <textarea id={`${fieldId}-answer`} value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} disabled={submit.isPending} />
          </label>
          <label htmlFor={`${fieldId}-link`}>Evidence link, if the rules ask for one
            <input id={`${fieldId}-link`} type="url" value={answerUrl} onChange={(event) => setAnswerUrl(event.target.value)} placeholder="https://" disabled={submit.isPending} />
          </label>
          <ShowNote>Submit once when your response is ready. Only you and the show hosts can read your response.</ShowNote>
          {submit.isError && <p role="alert">{submit.error instanceof Error ? submit.error.message : "Your response could not be saved. Try again."}</p>}
          <Button type="submit" disabled={submit.isPending || (!answer.trim() && !answerUrl.trim())}>
            {submit.isPending ? "Recording response…" : `Submit response for ${challenge.title}`}
          </Button>
        </AnswerForm>
      ) : <ShowNote>{unavailableReason || (deadlinePassed ? "The submission deadline has passed." : "Submissions are not open for you. Check your show status and the host’s next cue above.")}</ShowNote>}
    </ShowSection>
  );
}
