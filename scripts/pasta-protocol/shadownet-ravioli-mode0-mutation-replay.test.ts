import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { assertRavioliUiLiveExecutionAllowed } from "./shadownet-ravioli-ui-live";
import { root } from "./shadownet-proof-kit";

const RETIRED_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_MODE0_MUTATION_RESUME_EXECUTE";
const RETIRED_V3_RESTART_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V3_RESTART_EXECUTE";
const RETIRED_V3_PREFLIGHT_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V3_PREFLIGHT_ONLY";
const RETIRED_V4_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_RESUME_EXECUTE";
const RETIRED_V4_PREFLIGHT_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_PREFLIGHT_ONLY";
const RETIRED_SCRIPT = "pasta:shadownet:ravioli:ui-live:resume:mode0";
const RETIRED_V2_SCRIPT = "pasta:shadownet:ravioli:ui-live:resume:current-v2";
const RETIRED_V3_RESTART_SCRIPT = "pasta:shadownet:ravioli:ui-live:restart:current-v3";
const RETIRED_V3_PREFLIGHT_SCRIPT = "pasta:shadownet:ravioli:ui-live:preflight:current-v3";
const RETIRED_V4_RESUME_SCRIPT = "pasta:shadownet:ravioli:ui-live:resume:current-v4";
const RETIRED_V4_PREFLIGHT_SCRIPT = "pasta:shadownet:ravioli:ui-live:preflight:current-v4";

test("retired July-22 mode-0 recovery fails before every live execution precondition", () => {
  assert.throws(
    () => assertRavioliUiLiveExecutionAllowed({
      [RETIRED_FLAG]: "1",
      PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/path-that-must-never-be-opened",
      TEZOS_NETWORK: "shadownet",
    }),
    /LEGACY_RECOVERY_RETIRED/,
  );
});

test("crossed current-v3 restart and preflight flags are permanently retired", () => {
  const baseEnvironment = {
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/path-that-must-never-be-opened",
    TEZOS_NETWORK: "shadownet",
  };
  assert.throws(
    () => assertRavioliUiLiveExecutionAllowed({
      ...baseEnvironment,
      [RETIRED_V3_RESTART_FLAG]: "1",
    }),
    /CURRENT_V3_RECOVERY_RETIRED/,
  );
  assert.throws(
    () => assertRavioliUiLiveExecutionAllowed({
      ...baseEnvironment,
      [RETIRED_V3_PREFLIGHT_FLAG]: "1",
    }),
    /CURRENT_V3_RECOVERY_RETIRED/,
  );
});

test("crossed current-v4 resume and preflight flags are permanently retired", () => {
  const baseEnvironment = {
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/path-that-must-never-be-opened",
    TEZOS_NETWORK: "shadownet",
  };
  assert.throws(
    () => assertRavioliUiLiveExecutionAllowed({
      ...baseEnvironment,
      [RETIRED_V4_RESUME_FLAG]: "1",
    }),
    /CURRENT_V4_RECOVERY_RETIRED/,
  );
  assert.throws(
    () => assertRavioliUiLiveExecutionAllowed({
      ...baseEnvironment,
      [RETIRED_V4_PREFLIGHT_FLAG]: "1",
    }),
    /CURRENT_V4_RECOVERY_RETIRED/,
  );
});

test("retired recovery remains quarantine evidence and has no runnable package command", async () => {
  const [packageText, runnerText, quarantineText] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-ravioli-ui-live.ts"), "utf8"),
    readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-ravioli-mode0-mutation-replay.quarantined.ts"), "utf8"),
  ]);
  const scripts = JSON.parse(packageText).scripts as Record<string, string>;
  assert.equal(scripts[RETIRED_SCRIPT], undefined);
  assert.equal(scripts[RETIRED_V2_SCRIPT], undefined);
  assert.equal(scripts[RETIRED_V3_RESTART_SCRIPT], undefined);
  assert.equal(scripts[RETIRED_V3_PREFLIGHT_SCRIPT], undefined);
  assert.equal(scripts[RETIRED_V4_RESUME_SCRIPT], undefined);
  assert.equal(scripts[RETIRED_V4_PREFLIGHT_SCRIPT], undefined);
  assert.match(runnerText, /LEGACY_RECOVERY_RETIRED/);
  assert.ok(
    runnerText.indexOf("LEGACY_RECOVERY_RETIRED") <
      runnerText.indexOf('if (environment[EXECUTE_FLAG] !== "1")'),
    "the retired flag must fail before ordinary execution validation can reach filesystem or network work",
  );
  assert.ok(
    runnerText.indexOf("CURRENT_V4_RECOVERY_RETIRED") <
      runnerText.indexOf('if (environment[EXECUTE_FLAG] !== "1")'),
    "the crossed current-v4 flags must fail before ordinary execution validation can reach filesystem or network work",
  );
  assert.match(quarantineText, /loadRavioliMode0MutationReplay/);
  assert.match(quarantineText, /createRavioliMode0MutationReplayInterceptor/);

  const retiredVerifierStart = runnerText.indexOf(
    "export async function verifyRavioliMode0MutationReplayLive",
  );
  const currentVerifierBaseStart = runnerText.indexOf(
    "export async function verifyRavioliCurrentV2ResumeLive",
  );
  const currentVerifierEnd = runnerText.indexOf(
    "export function stableRavioliMode0MutationLiveCheck",
  );
  assert.ok(retiredVerifierStart >= 0 && retiredVerifierStart < currentVerifierBaseStart);
  assert.ok(currentVerifierBaseStart >= 0 && currentVerifierBaseStart < currentVerifierEnd);
  assert.match(
    runnerText.slice(retiredVerifierStart, currentVerifierBaseStart),
    /"opened_by"/,
    "the remaining opened_by read belongs only to the retired July-22 verifier",
  );
  assert.doesNotMatch(
    runnerText.slice(currentVerifierBaseStart, currentVerifierEnd),
    /opened_by/,
    "the active current-v4 verifier base must not enumerate the superseded big map",
  );
});
