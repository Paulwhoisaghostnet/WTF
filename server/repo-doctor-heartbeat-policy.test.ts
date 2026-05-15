import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync("scripts/repo-doctor-heartbeat.sh", "utf8");
const installer = readFileSync("scripts/install-systemd-timers.sh", "utf8");
const service = readFileSync("scripts/systemd/repo-doctor-heartbeat.service", "utf8");
const timer = readFileSync("scripts/systemd/repo-doctor-heartbeat.timer", "utf8");

test("repo doctor heartbeat is host-level, lock guarded, and kill-switchable", () => {
  assert.match(service, /ExecStart=\/opt\/wtf-combo\/scripts\/repo-doctor-heartbeat\.sh/);
  assert.match(service, /Type=oneshot/);
  assert.match(
    service,
    /EnvironmentFile=-\/etc\/wtf\/wtf\.env/,
    "repo doctor service should tolerate missing env files and let the script choose docker/database mode"
  );
  assert.match(timer, /OnUnitActiveSec=15min/);
  assert.match(installer, /repo-doctor-heartbeat\.timer/);
  assert.match(
    installer,
    /list-timers 'repo-doctor-heartbeat\.timer' 'wtf-\*'/,
    "installer verification output should include the repo-doctor timer, not only wtf-* timers"
  );

  assert.match(script, /REPO_DOCTOR_DISABLED/);
  assert.match(script, /repo-doctor\.disabled/);
  assert.match(script, /--dry-run/);
  assert.match(script, /REPO_DOCTOR_MAX_WRITES/);
  assert.match(script, /pg_try_advisory_xact_lock/);
});

test("repo doctor heartbeat writes only audit rows and treats empty feature tables as inactive", () => {
  assert.match(script, /INSERT INTO sync_runs/);
  assert.match(script, /INSERT INTO system_event_logs/);
  assert.match(script, /RETURNING id AS run_id \\gset/);
  assert.match(script, /WHERE sync_runs\.id = :run_id/);
  assert.match(script, /zeroRowPolicy', 'inactive_not_error/);
  assert.match(script, /safeBackfills', jsonb_build_array\(\)/);
  assert.match(script, /writesAttempted', 0/);
  assert.doesNotMatch(script, /UPDATE users/i);
  assert.doesNotMatch(script, /DELETE FROM/i);
});
