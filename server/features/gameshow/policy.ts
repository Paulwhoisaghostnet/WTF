import type { GameshowContestantStatus, GameshowRoundStatus } from "@shared/gameshow";

export class GameshowError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function anteSatisfied(required: string, paid: string): boolean {
  return BigInt(paid || "0") >= BigInt(required || "0");
}

export function participationBlockers(input: {
  seasonStatus: string;
  roundStatus?: GameshowRoundStatus;
  contestantStatus?: GameshowContestantStatus;
  anteWtfRequired: string;
  antePaidWtf?: string;
}): string[] {
  const blockers: string[] = [];
  if (!input.contestantStatus) blockers.push("The host has not enrolled you in this season.");
  else if (input.contestantStatus !== "active") blockers.push(`Your season place is ${input.contestantStatus.replaceAll("_", " ")}.`);
  if (input.contestantStatus && !anteSatisfied(input.anteWtfRequired, input.antePaidWtf ?? "0")) {
    blockers.push(`The season requires a verified ante of ${input.anteWtfRequired} WTF.`);
  }
  if (input.seasonStatus === "completed") blockers.push("This season is complete.");
  else if (input.seasonStatus !== "active" || input.roundStatus !== "active") blockers.push("Wait for the host to open the next round.");
  return blockers;
}

export function assertTransition(status: GameshowRoundStatus, action: "start" | "close" | "advance") {
  const required = { start: "upcoming", close: "active", advance: "grading" } as const;
  if (status !== required[action]) throw new GameshowError(409, `Cannot ${action} a ${status} round. Refresh the stage to see the current state.`);
}
