import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync("scripts/repo-doctor-heartbeat.sh", "utf8");
const installer = readFileSync("scripts/install-systemd-timers.sh", "utf8");
const deploy = readFileSync("scripts/server-deploy.sh", "utf8");
const service = readFileSync("scripts/systemd/repo-doctor-heartbeat.service", "utf8");
const timer = readFileSync("scripts/systemd/repo-doctor-heartbeat.timer", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");

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
    /TIMERS=\("\$@"\)/,
    "installer should allow deploy to enable only the repo-doctor timer"
  );
  assert.match(installer, /Unsupported timer/);
  assert.match(installer, /systemctl list-timers "\$\{TIMERS\[@\]\}" --no-pager/);
  assert.match(
    deployWorkflow,
    /bash scripts\/server-deploy\.sh/,
    "main deploy must run the server deploy script that owns host timer verification"
  );
  assert.match(deploy, /verifying repo doctor heartbeat timer/);
  assert.match(deploy, /sudo WTF_APP_DIR="\$ROOT_DIR" bash scripts\/install-systemd-timers\.sh repo-doctor-heartbeat\.timer/);
  assert.match(deploy, /sudo systemctl is-enabled repo-doctor-heartbeat\.timer/);
  assert.match(deploy, /sudo systemctl is-active repo-doctor-heartbeat\.timer/);
  assert.match(deploy, /sudo systemctl start repo-doctor-heartbeat\.service/);
  assert.match(deploy, /sudo tail -n 5 \/var\/log\/wtf\/repo-doctor-heartbeat\.jsonl/);
  assert.match(deploy, /FROM sync_runs WHERE job_name='repo-doctor-heartbeat'/);
  assert.match(deploy, /FROM system_event_logs WHERE source='repo-doctor-heartbeat'/);

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
