import assert from "node:assert/strict";
import test from "node:test";
import { deriveRecoveryModeStatus } from "./recovery-mode-model";

test("recovery mode marks degraded health and disk cache as high-priority incidents", () => {
  const status = deriveRecoveryModeStatus({
    health: {
      ok: false,
      status: "degraded",
      db: { ok: true },
      chain: { ok: false, missing: ["TEZOS_RPC_URL"] },
      jobs: { ok: true },
    },
    disk: {
      ok: false,
      status: "crit",
      tvCache: { utilization: 1.02, files: 42 },
    },
    tezosWalletConnected: true,
    etherlinkWalletConnected: false,
    tezosNetwork: "mainnet",
    etherlinkNetwork: "mainnet",
    windowSessionPresent: false,
    role: "contestant",
  });

  assert.equal(status.severity, "critical");
  assert(status.incidents.some((incident) => incident.id === "system-health"));
  assert(status.incidents.some((incident) => incident.id === "disk-cache"));
});

test("recovery mode exposes local repair actions without enabling operator controls for users", () => {
  const status = deriveRecoveryModeStatus({
    health: { ok: true },
    disk: { ok: true, status: "ok" },
    tezosWalletConnected: true,
    etherlinkWalletConnected: false,
    tezosNetwork: "ghostnet",
    etherlinkNetwork: "mainnet",
    windowSessionPresent: true,
    role: "contestant",
  });

  assert(status.incidents.some((incident) => incident.id === "tezos-network-override"));
  assert.equal(status.actions.find((action) => action.id === "disconnect-wallets")?.enabled, true);
  assert.equal(status.actions.find((action) => action.id === "reset-networks")?.enabled, true);
  assert.equal(status.actions.find((action) => action.id === "clear-window-session")?.enabled, true);
  assert.equal(
    status.operatorActions.every((action) => action.operatorOnly && !action.enabled),
    true
  );
});

test("recovery mode enables operator-only repair links for admins", () => {
  const status = deriveRecoveryModeStatus({
    health: { ok: true },
    disk: { ok: true, status: "ok" },
    tezosWalletConnected: false,
    etherlinkWalletConnected: false,
    tezosNetwork: "mainnet",
    etherlinkNetwork: "mainnet",
    windowSessionPresent: false,
    role: "admin",
  });

  assert.equal(
    status.operatorActions.every((action) => action.operatorOnly && action.enabled),
    true
  );
  assert(status.incidents.some((incident) => incident.id === "wallet-disconnected"));
});
