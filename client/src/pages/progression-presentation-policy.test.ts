import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sideQuestsSource = readFileSync(new URL("./SideQuests.tsx", import.meta.url), "utf8");
const challengesSource = readFileSync(new URL("./Challenges.tsx", import.meta.url), "utf8");

test("SideQuests exposes Gamma host markers for progression cards and rewards", () => {
  assert.match(sideQuestsSource, /usePresentationShell/);
  assert.match(sideQuestsSource, /presentationRouteHref/);
  assert.match(sideQuestsSource, /data-progression-presentation-host=\{presentation\.host\}/);
  assert.match(sideQuestsSource, /\[data-progression-presentation-host="gamma"\]/);
  assert.match(sideQuestsSource, /data-progression-surface="side-quests"/);
  assert.match(sideQuestsSource, /data-progression-region="intro-panel"/);
  assert.match(sideQuestsSource, /data-progression-region="reward-account"/);
  assert.match(sideQuestsSource, /data-progression-region="quest-card"/);
  assert.match(sideQuestsSource, /data-progression-region="progress-track"/);
  assert.match(sideQuestsSource, /\[data-progression-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(sideQuestsSource, /\[data-progression-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(sideQuestsSource, /#00d2ff/);
});

test("Challenges exposes Gamma host markers for challenge cards, stats, and submissions", () => {
  assert.match(challengesSource, /usePresentationShell/);
  assert.match(challengesSource, /data-progression-presentation-host=\{presentation\.host\}/);
  assert.match(challengesSource, /\[data-progression-presentation-host="gamma"\]/);
  assert.match(challengesSource, /data-progression-surface="challenges"/);
  assert.match(challengesSource, /data-progression-region="intro-panel"/);
  assert.match(challengesSource, /data-progression-region="stat"/);
  assert.match(challengesSource, /data-progression-region="challenge-card"/);
  assert.match(challengesSource, /data-progression-region="submission-box"/);
  assert.match(challengesSource, /\[data-progression-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(challengesSource, /\[data-progression-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(challengesSource, /#00d2ff/);
});

test("Progression screens keep side quest, challenge, reward, and account behavior on shared APIs", () => {
  assert.match(sideQuestsSource, /api\.get<DailySideQuestResponse>\("\/api\/challenge-automation\/daily-loops"\)/);
  assert.match(sideQuestsSource, /api\.get<LegacySideQuest\[\]>\("\/api\/side-quests"\)/);
  assert.match(sideQuestsSource, /api\.get<SideQuestCompletion\[\]>\("\/api\/side-quests\/my\/completions"\)/);
  assert.match(sideQuestsSource, /api\.get<any>\("\/api\/rewards\/account"\)/);
  assert.match(sideQuestsSource, /api\.post\(`\/api\/challenge-automation\/daily-loops\/\$\{id\}\/claim`, \{\}\)/);
  assert.match(sideQuestsSource, /api\.post\(`\/api\/side-quests\/\$\{id\}\/complete`, data\)/);
  assert.match(sideQuestsSource, /api\.post\("\/api\/rewards\/cashout", \{\}\)/);
  assert.match(challengesSource, /api\.get<ChallengeRow\[\]>\("\/api\/challenges"\)/);
  assert.match(challengesSource, /api\.get<any>\(`\/api\/challenges\/\$\{expandedId\}`\)/);
  assert.match(challengesSource, /api\.post\(`\/api\/challenges\/\$\{id\}\/submit`, data\)/);
});
