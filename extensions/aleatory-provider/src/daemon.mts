import dotenv from "dotenv";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { readConfig, verifyNetwork, readChainConfiguration } from "./config.mts";
import { agentWallet } from "./custody.mts";

dotenv.config({ path: process.env.WTF_ALEATORY_ENV_FILE, quiet: true });
if (process.argv.includes("--dry-run")) throw new Error("The daemon publishes metadata. Use src/check.mts for a read-only check.");
for (const variable of ["ALEA_AGENT_SK", "WTF_ALEATORY_OPERATOR_KEYRING", "WTF_ALEATORY_OPERATOR_MASTER_KEY_FILE"]) {
  if (process.env[variable]) throw new Error(`${variable} must not be available to the render service`);
}
const config = await verifyNetwork(readConfig());
if (!config.provider || !config.agentAddress) throw new Error("A confirmed provider and its dedicated agent are required");
const chain = await readChainConfiguration(config);
const { signer, wallet } = await agentWallet(config);
const provider = await import("../vendor/provider/provider.mts");
provider.configureRuntimeAdapters({ signer });
const { configureHeartbeatObserver } = await import("../vendor/provider/heartbeat.ts");
mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
const healthPath = join(config.stateDir, "health.json");
const writeHealth = (beat: { status?: string; msg?: string; ping?: number }) => {
  const failures = [...(beat.msg ?? "").matchAll(/(\d+) (?:scan failed|failed|stuck)/g)].some((match) => Number(match[1]) > 0);
  const record = {
    updatedAt: new Date().toISOString(),
    processId: process.pid,
    network: config.network,
    provider: config.provider,
    agent: wallet.address,
    registeredAtStartup: chain.registered,
    status: beat.status === "down" || failures ? "degraded" : "running",
    message: beat.msg,
    durationMs: beat.ping,
  };
  writeFileSync(`${healthPath}.tmp`, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${healthPath}.tmp`, healthPath);
};
configureHeartbeatObserver(writeHealth);
writeHealth({ status: "up", msg: "Configured; waiting for first chain scan" });
await import("../vendor/provider/daemon.mts");
