import { readFile, writeFile, rename, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { createFundingService, commitment, demand, type FundingGame, type FundingRecord } from "./funding";
import { fundingConfig, tezosFundingChain } from "./funding-contract";
import { postgresFundingStore } from "./funding-store";

// A maintenance audit reads one immutable-on-disk checkpoint without creating
// an authority, listening socket, clock timer or signer. The deployed worker
// submits the durable intent only after normal service resumes.
export async function auditSavedRoom(dataDir: string, record: FundingRecord, atMs: number) {
  demand(path.basename(record.roomCode) === record.roomCode && ![".", ".."].includes(record.roomCode), "Invalid room file identity.");
  const require = createRequire(path.resolve("package.json"));
  const Party = require(path.resolve("server/features/wtfiap/runtime/game/core/party.cjs"));
  const Accounting = require(path.resolve("server/features/wtfiap/runtime/game/core/tournament-accounting.cjs"));
  const filename = path.join(dataDir, record.roomCode + ".json");
  const raw = await readFile(filename, "utf8");
  const evidence = { roomCode: record.roomCode, roomId: record.roomId, checkedAtMs: atMs,
    fileSha256: createHash("sha256").update(raw).digest("hex") };
  const saved = JSON.parse(raw);
  demand(saved.roomCode === record.roomCode && saved.version === 1 && saved.fundingLock, "Saved room identity is invalid.");
  for (const key of ["roomId", "termsHash", "rulesHash", "matchId", "seedCommitment"]) demand(saved.fundingLock[key] === record.lock[key], "Saved game commitments differ.");
  if (saved.fundingFaultArchive) {
    demand(record.technicalVoid && saved.fundingFaultArchive.snapshotHash === commitment(saved.fundingFaultArchive.snapshot) &&
      saved.fundingFaultArchive.reasonHash === record.technicalVoid.reasonHash && saved.fundingFaultArchive.evidenceHash === record.technicalVoid.evidenceHash,
    "Saved technical-failure archive differs from its durable intent.");
    return { ok: false, code: "authoritative-game-failure", evidence: record.technicalVoid.evidence.audit };
  }
  try {
    if (saved.terminalArchive || saved.voidArchive) return { ok: true, code: "terminal-room", evidence };
    if (saved.match) {
      const state = Party.restore(saved.match);
      if (state.phase === "finished") return { ok: true, code: "terminal-room", evidence };
      Accounting.validate(saved.tournamentAccounting, state);
      const advanced = Party.advance(state, atMs);
      demand(advanced.ok, "Saved game cannot complete its due transition.");
      Party.validate(state);
    }
    return { ok: true, code: "healthy", evidence };
  } catch {
    // Private credentials and source state never enter the audit/log output.
    return { ok: false, code: "authoritative-game-failure", evidence: { ...evidence, failure: "saved-state-validation-or-transition-failed" } };
  }
}

async function preserveFailedRoom(dataDir: string, record: FundingRecord) {
  const filename = path.join(dataDir, record.roomCode + ".json"), raw = await readFile(filename, "utf8"), saved = JSON.parse(raw);
  const failure = record.technicalVoid!;
  if (saved.fundingFaultArchive) {
    demand(saved.fundingFaultArchive.snapshotHash === commitment(saved.fundingFaultArchive.snapshot) &&
      saved.fundingFaultArchive.reasonHash === failure.reasonHash && saved.fundingFaultArchive.evidenceHash === failure.evidenceHash,
    "A different technical failure already owns this archive.");
    return;
  }
  demand(createHash("sha256").update(raw).digest("hex") === failure.evidence.audit.fileSha256,
    "The stopped game checkpoint changed after its audit; preserve it and retry reconciliation.");
  const snapshot = JSON.parse(raw);
  saved.fundingFaultArchive = { version: 1, snapshot, snapshotHash: commitment(snapshot), reasonHash: failure.reasonHash, evidenceHash: failure.evidenceHash };
  saved.match = null;
  delete saved.serverError;
  saved.revision++;
  const temporary = filename + ".technical-void.tmp";
  await writeFile(temporary, JSON.stringify(saved), { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, filename);
}

export async function recordTechnicalVoid({ pool, code, operatorId, stoppedContainerId, dataDir, config = fundingConfig(), chain = tezosFundingChain(), audit = auditSavedRoom }: {
  pool: pg.Pool; code: string; operatorId: string; stoppedContainerId: string; dataDir: string;
  config?: ReturnType<typeof fundingConfig>; chain?: ReturnType<typeof tezosFundingChain>; audit?: typeof auditSavedRoom;
}) {
  demand(/^[a-f0-9]{64}$/.test(stoppedContainerId), "Use the stopped-app maintenance wrapper; a verified container identity is required.");
  const connection = await pool.connect();
  try {
    await connection.query("SELECT pg_advisory_lock(hashtextextended('wtfiap-deployment-gate',0))");
    const store = postgresFundingStore(pool, connection), saved = await store.read(code);
    demand(saved?.lock, "No durable funded room exists for this code.");
    const diagnostic = await audit(dataDir, saved, Date.now());
    const forbidden = () => { throw new Error("Maintenance cannot mutate or run the game authority."); };
    const game: FundingGame = { inspect: () => saved.roomSnapshot, list: () => [code], audit: () => diagnostic,
      lock: forbidden, start: forbidden, update: forbidden, result: forbidden, markVoided: forbidden };
    const service = createFundingService({ config, store, game, chain: { ...chain, submit: async () => { throw new Error("Maintenance must never sign."); } },
      linkedWallet: async () => false, onWake: () => {} });
    try {
      await service.requestTechnicalVoid(code, operatorId);
      const result = await store.read(code);
      await preserveFailedRoom(dataDir, result!);
      return { ok: true, roomCode: code, roomId: result!.roomId, status: result!.status,
        stoppedContainerId, reasonHash: result!.technicalVoid!.reasonHash, evidenceHash: result!.technicalVoid!.evidenceHash,
        signed: false, message: "Audited void intent recorded. The normal worker reconciles and signs after restart." };
    } finally { await service.close(); }
  } finally {
    await connection.query("SELECT pg_advisory_unlock(hashtextextended('wtfiap-deployment-gate',0))");
    connection.release();
  }
}
async function main() {
  const [code, operatorId, stoppedContainerId] = process.argv.slice(2);
  demand(code && operatorId && stoppedContainerId && process.argv.length === 5, "Use scripts/wtfiap/request-technical-void.mjs <room-code> <operator-identity>.");
  demand(process.env.DATABASE_URL && process.env.WTFIAP_DATA_DIR, "Private database and room volume are required.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { console.log(JSON.stringify(await recordTechnicalVoid({ pool, code, operatorId, stoppedContainerId, dataDir: process.env.WTFIAP_DATA_DIR }), null, 2)); }
  finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(error instanceof Error ? error.message : "Technical-void audit failed."); process.exitCode = 1;
});
