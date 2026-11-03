import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { demand } from "./funding";
import { createSponsorFundingService, type SponsorConfig,
  type SponsorGame, type SponsorRecord } from "./sponsor-funding";
import { sponsorFundingConfig, tezosSponsorChain } from "./sponsor-funding-chain";
import { postgresSponsorStore } from "./sponsor-funding-store";
import { auditSavedRoom, preserveFailedRoom } from "./technical-void-cli";

// Like ordinary funded-room voids, maintenance cannot start a second game
// authority or submit a transaction. The normal worker signs the frozen,
// replay-audited intent after the saved failure has been preserved.
export async function recordSponsorTechnicalVoid({ pool, code, operatorId,
  stoppedContainerId, dataDir,
  configs = { mainnet: sponsorFundingConfig("mainnet"),
    shadownet: sponsorFundingConfig("shadownet") },
  chain = tezosSponsorChain(), audit = auditSavedRoom }: {
  pool: pg.Pool; code: string; operatorId: string; stoppedContainerId: string;
  dataDir: string; configs?: { mainnet: SponsorConfig; shadownet: SponsorConfig };
  chain?: ReturnType<typeof tezosSponsorChain>; audit?: typeof auditSavedRoom;
}) {
  demand(/^[a-f0-9]{64}$/.test(stoppedContainerId),
    "Use the stopped-app maintenance wrapper; a verified container identity is required.");
  demand(path.basename(code) === code && ![".", ".."].includes(code),
    "Invalid sponsor room file identity.");
  const connection = await pool.connect();
  try {
    await connection.query("SELECT pg_advisory_lock(hashtextextended('wtfiap-deployment-gate',0))");
    const store = postgresSponsorStore(pool, connection), record = await store.read(code);
    demand(record?.lock, "No durable sponsored room exists for this code.");
    const diagnostic = await audit(dataDir, record, Date.now());
    const raw = await readFile(path.join(dataDir, code + ".json"), "utf8");
    const saved = JSON.parse(raw);
    demand(saved.roomCode === code && saved.fundingLock?.version === 4,
      "Saved sponsored room identity is invalid.");
    const sponsorAccountId = saved.config?.sponsorCompetes
      ? (Object.values(saved.sessions || {}) as Array<{ playerId: string; accountId?: string }>).find(session =>
        session.playerId === saved.hostPlayerId)?.accountId
      : (Object.values(saved.watcherSessions || {}) as Array<{ watcherId: string; accountId?: string }>).find(session =>
        session.watcherId === saved.hostWatcherId)?.accountId;
    const inspection = { ...saved, lock: saved.fundingLock,
      sponsorAccountId,
      phase: saved.voidArchive ? "voided" : saved.match?.phase || "lobby" };
    const forbidden = () => { throw new Error("Maintenance cannot mutate or run the game authority."); };
    const game: SponsorGame = { inspect: () => inspection as any,
      list: () => [code], audit: () => diagnostic, lock: forbidden, start: forbidden,
      update: forbidden, result: forbidden, markVoided: forbidden,
      revealSeed: forbidden, sponsorHumanRanks: forbidden };
    const service = createSponsorFundingService({ store, game,
      chain: { ...chain, submit: async () => { throw new Error("Maintenance must never sign."); } },
      configs, linkedWallet: async () => false, onWake: () => {} });
    try {
      await service.requestTechnicalVoid(code, operatorId);
      const frozen = await store.read(code) as SponsorRecord;
      await preserveFailedRoom(dataDir, frozen);
      return { ok: true, roomCode: code, roomId: frozen.roomId, status: frozen.status,
        stoppedContainerId, reasonHash: frozen.technicalVoid!.reasonHash,
        evidenceHash: frozen.technicalVoid!.evidenceHash, signed: false,
        message: "Audited sponsor void intent recorded. The normal worker reconciles and signs after restart." };
    } finally { await service.close(); }
  } finally {
    await connection.query("SELECT pg_advisory_unlock(hashtextextended('wtfiap-deployment-gate',0))");
    connection.release();
  }
}

async function main() {
  const [code, operatorId, stoppedContainerId] = process.argv.slice(2);
  demand(code && operatorId && stoppedContainerId && process.argv.length === 5,
    "Use scripts/wtfiap/request-sponsor-technical-void.mjs <room-code> <operator-identity>.");
  demand(process.env.DATABASE_URL && process.env.WTFIAP_DATA_DIR,
    "Private database and room volume are required.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log(JSON.stringify(await recordSponsorTechnicalVoid({ pool, code, operatorId,
      stoppedContainerId, dataDir: process.env.WTFIAP_DATA_DIR }), null, 2));
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "Sponsor technical-void audit failed.");
    process.exitCode = 1;
  });
