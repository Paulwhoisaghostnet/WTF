import assert from "node:assert/strict";
import test from "node:test";
import { commitment, createFundingService, clone, type FundingConfig, type FundingRecord, type ChainRoom, type GameRoom, type FundingGame } from "./funding";
import type { FundingStore } from "./funding-store";

const addresses = Array.from({ length: 8 }, (_, i) => "tz1" + String(i + 1).repeat(33));
const opHash = "o" + "1".repeat(50);
const config: FundingConfig = { enabled: true, network: "shadownet", chainId: "NetXsqzbfFenSTS", rpcUrl: "https://tezos-shadownet.octez.io/",
  escrowContract: "KT1" + "1".repeat(33), scriptHash: "a".repeat(64), creatorAddress: addresses[0], refereeAddress: addresses[0], walletId: "test-referee",
  wtfToken: { contract: "KT1" + "2".repeat(33), tokenId: "0", decimals: 8 }, rulesHash: "b".repeat(64),
  currencyQuantaAtomic: { XTZ:"10000", WTF:"1000000" }, treasuryAddress: addresses[0], prizeRoundingPolicy:"floor-each-prize-to-quantum;remainder-to-wtf.tez-v1", feeQuantumAtomic: "10000", refundPolicy: "explicit-test-policy" };
function fixture(variant: { humans?: number; roomType?: "duel" | "tournament"; aiFill?: boolean } = {}) {
  const humans = variant.humans ?? 8;
  const roomType = variant.roomType ?? "tournament";
  const rows = new Map<string, FundingRecord>(); let queue = Promise.resolve(), workerLocked = false, failCommit = false, gameUnavailable = false;
  const extraLinks = new Set<string>(); let auditFails=false;
  const store: FundingStore = {
    async read(code) { return clone(rows.get(code) || null); }, async list() { return clone([...rows.values()]); },
    async mutate(code, fn) {
      const previous = queue; let release!: () => void;
      queue = new Promise<void>(resolve => { release = resolve; }); await previous;
      try { const result = await fn(clone(rows.get(code) || null)); if (failCommit) { failCommit = false; throw new Error("simulated DB commit failure"); } rows.set(code, clone(result.record)); return result.value; }
      finally { release(); }
    },
    async exclusive(fn) { if (workerLocked) return false; workerLocked = true; try { await fn(); return true; } finally { workerLocked = false; } },
  };
  const room: GameRoom = { roomCode: "test-room", hostPlayerId: "p0", phase: "lobby", lock: null,
    config: roomType === "duel" ? { roomType, duelWager: { currency: "XTZ", entryAtomic: "1000000", entryFee: "1", payoutPolicy: "winner-takes-pot" } }
      : { roomType, ...(variant.aiFill ? { allowAI: true } : {}), tournament: { currency: "XTZ", entryAtomic: "1000000", entryFee: "1", prizePercentages: ["50", "35", "15"] } },
    players: addresses.slice(0, humans).map((_, i) => ({ playerId: "p" + i, name: "Human " + i, isAI: false, accountId: String(i + 1) })) };
  let result: any = null, starts = 0, observed: ChainRoom | null = null, lostResponse = false;
  const submissions: any[] = [];
  const game: FundingGame = {
    inspect(code) { if (gameUnavailable) throw new Error("old engine unavailable"); assert.equal(code, room.roomCode); return clone(room); }, list() { return room.lock ? [room.roomCode] : []; },
    lock(code, binding) { assert.equal(code, room.roomCode); if (!room.lock && variant.aiFill) {
      while (room.players.length < 8) room.players.push({ playerId: "ai" + room.players.length, name: "AI " + room.players.length, isAI: true, accountId: null });
    } room.lock ||= { ...binding, seedCommitment: "c".repeat(64) }; return clone(room); },
    start(_code, binding) { assert.equal(binding.matchId, room.lock.matchId); if (room.phase === "lobby") { starts++; room.phase = "preparation"; } return clone(room); },
    audit() { return {ok:!auditFails,code:auditFails?"authoritative-game-failure":"healthy",evidence:{snapshotHash:"e".repeat(64),failure:auditFails?"fixture transition failure":null}}; },
    markVoided(){room.phase="voided";},
    update() { if (gameUnavailable) throw new Error("old engine unavailable"); }, result() { if (gameUnavailable) throw new Error("old engine unavailable"); return clone(result); },
  };
  const chain = {
    async read() { return clone(observed); },
    async submit(record: FundingRecord, intent: any) {
      assert.equal(rows.get(record.roomCode)!.intents.find(i => i.id === intent.id)!.status, "submission-unknown", "durable checkpoint must precede signer");
      submissions.push(clone(intent)); if (lostResponse) throw new Error("response lost after injection");
      return { operationHash: opHash };
    },
  };
  const service = (configs?: Partial<Record<"XTZ" | "WTF" | "XTZ_MAINNET", FundingConfig>>, baseConfig = config) => createFundingService({ config: baseConfig, configs, store, game, chain,
    linkedWallet: async (id, address) => addresses[Number(id) - 1] === address || extraLinks.has(id + ":" + address),
    onWake: () => {} }); // Explicit test driver advances the event-triggered worker.
  function observe(paid = 0, status: ChainRoom["status"] = "funding") {
    const record = rows.get(room.roomCode)!;
    const entrantAddresses = record.bindings.map(binding => binding.walletAddress);
    observed = { blockHash: "Bfinal", level: 10, termsHash: record.termsHash!, rulesHash: config.rulesHash,
      seedCommitment: room.lock.seedCommitment, referee: config.refereeAddress, currency: "0", entryAtomic: "1000000",
      payoutMode: roomType === "duel" ? "0" : "1", entrants: entrantAddresses, paid: entrantAddresses.slice(0, paid), held: String(paid * 1000000), paidOut: "0", status,
      deposited:String(paid*1000000),refunded:"0",quantum:"10000",treasuryAmount:"0",treasuryClaimed:false,voidReasonHash:null,voidEvidenceHash:null,
      matchId: status === "funding" ? null : room.lock.matchId, resultHash: null, transcriptHash: null, claims: {} };
  }
  return { store, rows, room, service, submissions, observe, failAudit(){auditFails=true;}, failCommit() { failCommit = true; },
    allowWallet(id: string, address: string) { extraLinks.add(id + ":" + address); }, loseGameAccess() { gameUnavailable = true; }, get observed() { return observed!; },
    setResult(v: any) { result = v; room.phase = "finished"; }, loseResponse() { lostResponse = true; }, get starts() { return starts; } };
}
async function open(f: ReturnType<typeof fixture>) {
  const s = f.service();
  for (let i = 0; i < 8; i++) await s.bind("test-room", String(i + 1), addresses[i]);
  await s.open("test-room", "1"); return s;
}

test("reconcile callers finish their pass while later wakes continue, and close waits without queuing another pass", async () => {
  const f = fixture(), s = f.service();
  const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
  const firstStarted = deferred(), secondStarted = deferred(), firstRelease = deferred(), secondRelease = deferred();
  let passes = 0, active = 0;
  f.store.exclusive = async fn => {
    assert.equal(active++, 0, "queued passes must not overlap");
    const pass = ++passes;
    try {
      (pass === 1 ? firstStarted : secondStarted).resolve();
      await (pass === 1 ? firstRelease : secondRelease).promise;
      await fn(); return true;
    } finally { active--; }
  };
  let firstFinished = false, joinedFinished = false;
  const first = s.drain().then(() => { firstFinished = true; });
  await firstStarted.promise;
  const joined = s.drain().then(() => { joinedFinished = true; });
  firstRelease.resolve();
  await secondStarted.promise;
  // An event-loop turn lets completed-pass waiters settle while the next RPC
  // pass remains deliberately unresolved; no wall-clock timeout is involved.
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(firstFinished, true);
  assert.equal(joinedFinished, true);
  const laterWake = s.drain();
  let closed = false;
  const closing = s.close().then(() => { closed = true; });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(closed, false, "shutdown must preserve the active pass");
  secondRelease.resolve();
  await Promise.all([first, joined, laterWake, closing]);
  assert.equal(passes, 2, "shutdown suppresses the queued follow-up");
  assert.equal(active, 0);
});

test("new WTF rooms pin Mainnet while XTZ and existing WTF rooms retain Shadownet", async () => {
  const mainnet: FundingConfig = { ...config, network: "mainnet", chainId: "NetXdQprcVkpaWU",
    rpcUrl: "https://tezos-mainnet.octez.io/", escrowContract: "KT1" + "3".repeat(33),
    wtfToken: { contract: "KT1" + "4".repeat(33), tokenId: "0", decimals: 8 } };
  const lanes = { XTZ: config, WTF: mainnet };
  const xtz = fixture();
  assert.equal((await xtz.service(lanes).view("test-room", "1")).network, "shadownet");
  await xtz.service(lanes).bind("test-room", "1", addresses[0]);
  assert.equal(xtz.rows.get("test-room")!.config.escrowContract, config.escrowContract);
  const wtf = fixture();
  wtf.room.config.tournament.currency = "WTF";
  const s = wtf.service(lanes);
  assert.equal((await s.view("test-room", "1")).network, "mainnet");
  await s.bind("test-room", "1", addresses[0]);
  assert.equal(wtf.rows.get("test-room")!.config.escrowContract, mainnet.escrowContract);
  const rotated = wtf.service({ XTZ: config, WTF: { ...mainnet, escrowContract: "KT1" + "5".repeat(33) } });
  assert.equal((await rotated.publicConfigForRoom("test-room")).enabled, false);
  assert.equal((await rotated.view("test-room", "1")).self.canBind, false);
  const legacy = fixture();
  legacy.room.config.tournament.currency = "WTF";
  await legacy.service().bind("test-room", "1", addresses[0]);
  assert.equal((await legacy.service(lanes).view("test-room", "1")).network, "shadownet");
  await legacy.service(lanes).bind("test-room", "2", addresses[1]);
  assert.equal(legacy.rows.get("test-room")!.config.escrowContract, config.escrowContract);
});

test("an unrelated room's reconciliation error does not warn healthy players", async () => {
  const f = fixture(), s = f.service();
  await s.bind("test-room", "1", addresses[0]);
  s.health.error = "Another room has an unresolved submission.";
  assert.equal((await s.view("test-room", "1")).health.error, null);
  f.rows.get("test-room")!.error = "This room needs reconciliation.";
  assert.equal((await s.view("test-room", "1")).health.error, "This room needs reconciliation.");
  assert.equal(s.health.error, "Another room has an unresolved submission.");
  await s.close();
});

test("funded rooms bind exact linked humans, freeze terms and do not mistake submitted hashes for deposits", async () => {
  const f = fixture(), s = f.service();
  await assert.rejects(s.bind("test-room", "1", addresses[1]), /Link and verify/);
  await assert.rejects(s.bind("test-room", "99", addresses[0]), /does not own/);
  await s.bind("test-room", "1", addresses[0]);
  await assert.rejects(s.open("test-room", "2"), /Only the room host/);
  await assert.rejects(s.open("test-room", "1"), /Every human entrant must link/);
  for (let i = 1; i < 8; i++) await s.bind("test-room", String(i + 1), addresses[i]);
  await s.open("test-room", "1"); await s.drain();
  assert.equal(f.submissions.length, 1);
  assert.equal(f.rows.get("test-room")!.intents[0].status, "submitted");
  await s.observe("test-room", "1", { action: "deposit", operationHash: opHash });
  assert.equal((await s.view("test-room", "1")).depositedCount, 0);
  await assert.rejects(s.start("test-room", "1"), /Every paying entrant must have a finalized deposit/);
  f.observe(7); await s.drain();
  assert.equal((await s.view("test-room", "1")).depositedCount, 7);
  await assert.rejects(s.start("test-room", "1"), /Every paying entrant must have a finalized deposit/);
  f.observe(8); await s.drain(); await s.start("test-room", "1"); await s.drain();
  assert.equal(f.submissions.length, 2); assert.equal(f.starts, 0, "submitted start is not an applied start");
  await s.drain(); assert.equal(f.submissions.length, 2, "do not repeat submitted start");
  f.observe(8, "active"); await s.drain(); assert.equal(f.starts, 1);
  await s.drain(); assert.equal(f.starts, 1, "reconciliation cannot restart a running match");
  const publicView = await s.view("test-room", null);
  assert(!JSON.stringify(publicView).includes("userId")); assert(!JSON.stringify(publicView).includes("walletId"));
  await s.close();
});

test("lost signer response survives restart as reconciliation-only; no fresh request ID can double-submit", async () => {
  const f = fixture(), s = await open(f); f.loseResponse(); await s.drain();
  assert.equal(f.rows.get("test-room")!.intents[0].status, "submission-unknown");
  assert.match((await s.view("test-room", "1")).health.error || "", /Submission outcome is unknown/);
  assert.equal(s.health.error, null, "a blocked room must not fail the entire worker");
  assert.equal(s.health.blockedRoomCount, 1, "operator health still counts blocked rooms");
  assert.equal(Object.hasOwn((await s.view("test-room", "1")).health, "blockedRoomCount"), false,
    "aggregate operator diagnostics must not leak into a room view");
  await s.close();
  const recovered = f.service(); await recovered.drain(); await recovered.drain();
  assert.equal(recovered.health.error, null);
  assert.equal(recovered.health.blockedRoomCount, 1);
  assert.match((await recovered.view("test-room", "1")).health.error || "", /Submission outcome is unknown/);
  assert.equal(f.submissions.length, 1);
  f.observe(1); await recovered.drain();
  assert.equal(f.rows.get("test-room")!.intents[0].status, "applied");
  assert.equal(recovered.health.blockedRoomCount, 0);
  assert.equal(f.submissions.length, 1); await recovered.close();
});

test("settlement is derived from the frozen authoritative result and exact tie ranks; mismatch cannot settle", async () => {
  const f = fixture(), s = await open(f); await s.drain(); f.observe(8); await s.drain();
  await s.start("test-room", "1"); await s.drain(); f.observe(8, "active"); await s.drain();
  f.setResult({ matchId: "party:test-room", receiptsHash: "d".repeat(64), groups: [
    { placeFrom: 1, playerIds: ["p0"] }, { placeFrom: 2, playerIds: ["p1", "p2"] },
    ...Array.from({ length: 5 }, (_, i) => ({ placeFrom: i + 4, playerIds: ["p" + (i + 3)] })) ] });
  await s.drain();
  const planned = f.submissions.at(-1);
  assert.equal(planned.kind, "finalize_room");
  assert.deepEqual(planned.params.ranks.map((r: any) => r.rank), ["1", "2", "2", "4", "5", "6", "7", "8"]);
  assert.equal(planned.params.transcript_hash, "d".repeat(64));
  assert.equal(planned.payloadHash, commitment(planned.params));
  f.observe(8, "settled"); f.observed.resultHash = "f".repeat(64); f.observed.transcriptHash = "d".repeat(64);
  await s.drain(); assert(s.health.error); assert.notEqual(f.rows.get("test-room")!.status, "settled");
  f.observed.resultHash = planned.params.result_hash;
  f.observed.claims[addresses[0]] = { amount: "4000000", claimed: false };
  await s.drain();
  const v = await s.view("test-room", "1"); assert.equal(v.status, "settled");
  assert.equal(v.self.actions.claim.entrypoint, "claim"); assert.equal(v.self.payout?.amount, "4000000");
  const n = f.submissions.length; await s.drain(); assert.equal(f.submissions.length, n);
  await s.close();
});

test("duel escrow opens only after both seated players request staking", async () => {
  const f = fixture({ humans: 2, roomType: "duel" }), s = f.service();
  await s.bind("test-room", "1", addresses[0]);
  await s.stakeIntent("test-room", "1");
  assert.equal(f.rows.get("test-room")?.lock, null);
  await s.bind("test-room", "2", addresses[1]);
  assert.equal(f.rows.get("test-room")?.lock, null);
  const guest = await s.stakeIntent("test-room", "2");
  assert.equal(guest.self.stakeRequested, true);
  assert.ok(f.rows.get("test-room")?.lock);
  assert.equal(f.rows.get("test-room")?.intents.filter(intent => intent.kind === "create_room").length, 1);
  await s.stakeIntent("test-room", "2");
  assert.equal(f.rows.get("test-room")?.intents.filter(intent => intent.kind === "create_room").length, 1);
  await s.close();
});

test("a paid duel freezes two wallets and settles the winner-takes-pot rank", async () => {
  const f = fixture({ humans: 2, roomType: "duel" }), s = f.service();
  await s.bind("test-room", "1", addresses[0]); await s.bind("test-room", "2", addresses[1]);
  await s.open("test-room", "1"); await s.drain();
  assert.equal(f.submissions[0].params.payout_mode, "0");
  assert.deepEqual(f.submissions[0].params.entrants, addresses.slice(0, 2));
  f.observe(2); await s.drain(); await s.start("test-room", "1"); await s.drain();
  f.observe(2, "active"); await s.drain();
  f.setResult({ matchId: "party:test-room", receiptsHash: "d".repeat(64), groups: [
    { placeFrom: 1, placeTo: 1, playerIds: ["p0"] }, { placeFrom: 2, placeTo: 2, playerIds: ["p1"] }] });
  await s.drain();
  assert.deepEqual(f.submissions.at(-1).params.ranks, [
    { player: addresses[0], rank: "1", group_size: "1" }, { player: addresses[1], rank: "2", group_size: "1" }]);
  await s.close();
});

test("Mainnet XTZ duel charges the room creator one house fee outside the two-entry pot", async () => {
  const mainnet: FundingConfig = { ...config, network: "mainnet", chainId: "NetXdQprcVkpaWU",
    escrowContract: "KT1" + "3".repeat(33), houseFeeAtomic: "500000" };
  const f = fixture({ humans: 2, roomType: "duel" });
  f.room.config.duelWager.network = "mainnet";
  const s = f.service({ XTZ: config, XTZ_MAINNET: mainnet });
  await s.bind("test-room", "1", addresses[0]);
  await s.bind("test-room", "2", addresses[1]);
  await s.open("test-room", "1");
  await s.drain();
  assert.equal(f.submissions[0].params.host, addresses[0]);
  f.observe(0);
  f.observed.host = addresses[0];
  await s.drain();
  const creator = await s.view("test-room", "1");
  const guest = await s.view("test-room", "2");
  assert.equal(creator.network, "mainnet");
  assert.equal(creator.self.actions.deposit.amountMutez, "1500000");
  assert.equal(guest.self.actions.deposit.amountMutez, "1000000");
  f.observed.host = addresses[1];
  await s.drain();
  assert.match(s.health.error || "", /could not be reconciled/);
  assert.equal(f.submissions.length, 1, "a mismatched on-chain host cannot advance escrow");
  await s.close();
});

test("the duel release resumes a frozen previous-release room without changing its terms or formation", async () => {
  const oldRules = "49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669";
  const currentRules = "81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd";
  const f = fixture({ humans: 2, roomType: "duel" });
  const old = f.service(undefined, { ...config, rulesHash: oldRules });
  await old.bind("test-room", "1", addresses[0]);
  await old.bind("test-room", "2", addresses[1]);
  await old.open("test-room", "1");
  const before = clone(f.room);
  const pinned = clone(f.rows.get("test-room"));
  await old.close();
  const resumed = f.service(undefined, { ...config, rulesHash: currentRules });
  const view = await resumed.open("test-room", "1");
  assert.equal(view.roomId, pinned!.roomId);
  assert.deepEqual(f.room, before);
  assert.deepEqual(f.rows.get("test-room")?.terms, pinned!.terms);
  await resumed.close();
  const future = f.service(undefined, { ...config, rulesHash: "c".repeat(64) });
  await assert.rejects(future.open("test-room", "1"), /pinned game rules/);
  await future.close();
});

test("pinned eight-human rooms keep their original rank DTO and result commitment", async () => {
  const f = fixture(), s = await open(f); await s.drain();
  const saved = f.rows.get("test-room")!; delete saved.payoutMode;
  f.observe(8); delete f.observed.payoutMode; await s.drain();
  await s.start("test-room", "1"); await s.drain();
  f.observe(8, "active"); delete f.observed.payoutMode; await s.drain();
  f.setResult({ matchId: "party:test-room", receiptsHash: "d".repeat(64), groups:
    addresses.map((_, i) => ({ placeFrom: i + 1, playerIds: ["p" + i] })) });
  await s.drain();
  const planned = f.submissions.at(-1);
  assert.equal(planned.kind, "finalize_room");
  assert.deepEqual(planned.params.ranks, addresses.map((player, i) => ({ player, rank: String(i + 1) })));
  assert.equal(planned.params.result_hash, commitment({ version: "wtfiap-result-v1", roomId: saved.roomId,
    matchId: saved.lock!.matchId, termsHash: saved.termsHash, transcriptHash: "d".repeat(64), ranks: planned.params.ranks }));
  await s.close();
});

test("AI-filled tournament pays only two human entrants while preserving all eight finish places", async () => {
  const f = fixture({ humans: 2, aiFill: true }), s = f.service();
  await s.bind("test-room", "1", addresses[0]); await s.bind("test-room", "2", addresses[1]);
  await s.open("test-room", "1"); await s.drain();
  assert.equal(f.room.players.length, 8);
  assert.equal(f.room.players.filter(player => player.isAI).length, 6);
  assert.deepEqual(f.submissions[0].params.entrants, addresses.slice(0, 2));
  assert.equal(f.submissions[0].params.payout_mode, "1");
  const fundingView = await s.view("test-room", "1");
  assert.equal(fundingView.payingEntrants, 2); assert.equal(fundingView.roster.length, 2);
  f.observe(2); await s.drain(); await s.start("test-room", "1"); await s.drain();
  f.observe(2, "active"); await s.drain();
  f.setResult({ matchId: "party:test-room", receiptsHash: "d".repeat(64), groups: [
    { placeFrom: 1, placeTo: 1, playerIds: ["ai2"] },
    { placeFrom: 2, placeTo: 3, playerIds: ["p0", "ai3"] },
    { placeFrom: 4, placeTo: 4, playerIds: ["ai4"] },
    { placeFrom: 5, placeTo: 5, playerIds: ["p1"] },
    { placeFrom: 6, placeTo: 6, playerIds: ["ai5"] },
    { placeFrom: 7, placeTo: 7, playerIds: ["ai6"] },
    { placeFrom: 8, placeTo: 8, playerIds: ["ai7"] }] });
  await s.drain();
  assert.deepEqual(f.submissions.at(-1).params.ranks, [
    { player: addresses[0], rank: "2", group_size: "2" }, { player: addresses[1], rank: "5", group_size: "1" }]);
  assert.equal(f.submissions.at(-1).params.transcript_hash, "d".repeat(64));
  await s.close();
});

test("wrong escrow terms, incomplete policy and altered persisted intents fail closed", async () => {
  const f = fixture(), s = await open(f); await s.drain(); f.observe(8); f.observed.termsHash = "0".repeat(64);
  await s.drain(); assert(s.health.error); assert.equal(f.rows.get("test-room")!.chain, null);
  f.rows.get("test-room")!.intents[0].params.entry_amount = "2";
  await s.drain(); assert.equal(f.submissions.length, 1);
  await s.close();
  const g = fixture(); config.refundPolicy = null;
  try { await assert.rejects(open(g), /refund policy/); } finally { config.refundPolicy = "explicit-test-policy"; }
});


test("orphan game funding lock after database commit failure freezes bindings and recovers exactly", async () => {
  const f = fixture(), s = f.service();
  for (let i = 0; i < 8; i++) await s.bind("test-room", String(i + 1), addresses[i]);
  f.failCommit(); await assert.rejects(s.open("test-room", "1"), /DB commit failure/);
  assert(f.room.lock); assert.equal(f.rows.get("test-room")!.lock, null);
  const frozen = clone(f.room.lock), otherWallet = "tz1" + "9".repeat(33);
  f.allowWallet("1", otherWallet);
  await assert.rejects(s.bind("test-room", "1", otherWallet), /bindings are frozen/);
  await s.open("test-room", "1");
  assert.deepEqual(f.rows.get("test-room")!.lock, frozen);
  await s.drain(); assert.equal(f.submissions.length, 1); await s.close();
});

test("terminal claims recover from immutable final result without the old game engine", async () => {
  const f = fixture(), s = await open(f); await s.drain(); f.observe(8); await s.drain();
  await s.start("test-room", "1"); await s.drain(); f.observe(8, "active"); await s.drain();
  f.setResult({ matchId: "party:test-room", receiptsHash: "d".repeat(64), groups: addresses.map((_, i) => ({ placeFrom: i + 1, playerIds: ["p" + i] })) });
  await s.drain(); const params = f.submissions.at(-1).params;
  f.observe(8, "settled"); f.observed.resultHash = params.result_hash; f.observed.transcriptHash = params.transcript_hash;
  f.observed.claims[addresses[0]] = { amount: "4000000", claimed: false }; await s.drain(); await s.close();
  f.loseGameAccess(); const old = config.rulesHash; config.rulesHash = "f".repeat(64); config.enabled = false;
  f.rows.get("test-room")!.error = "Prior RPC outage";
  try {
    const recovered = f.service(); await recovered.drain(); assert.equal(recovered.health.error, null);
    assert.equal((await recovered.view("test-room", "1")).self.payout?.amount, "4000000");
    await recovered.observe("test-room", "1", { action: "claim", operationHash: opHash });
    f.observed.claims[addresses[0]].claimed = true;
    f.observed.held = "4000000"; f.observed.paidOut = "4000000";
    await recovered.drain();
    const view = await recovered.view("test-room", "1");
    assert.equal(view.self.pendingOperations[0].status, "applied"); assert.equal(view.self.payout!.claimed, true);
    assert.equal(view.error, null); assert.equal(f.submissions.filter(i => i.kind === "finalize_room").length, 1); await recovered.close();
  } finally { config.rulesHash = old; config.enabled = true; }
});

test("disabled admissions reconcile frozen deposits without submitting planned create or start", async () => {
  const f = fixture(), s = await open(f); await s.close(); config.enabled = false;
  try {
    const recovered = f.service(); await recovered.drain(); assert.equal(f.submissions.length, 0);
    await assert.rejects(recovered.open("test-room", "1"), /not configured/);
    f.observe(8); await recovered.drain();
    assert.equal((await recovered.view("test-room", "1")).depositedCount, 8);
    await assert.rejects(recovered.start("test-room", "1"), /not configured/);
    f.rows.get("test-room")!.startRequested = true; await recovered.drain();
    assert.equal(f.submissions.length, 0); assert.equal(f.starts, 0); await recovered.close();
  } finally { config.enabled = true; }
});

test("pre-start withdrawal returns full entry, permits rejoin and conserves cumulative transfers", async () => {
  const f=fixture(),s=await open(f);await s.drain();f.observe(1);await s.drain();
  let v=await s.view("test-room","1");assert.equal(v.self.actions.refund.entrypoint,"refund");assert.equal(v.self.actions.refund.params,f.rows.get("test-room")!.roomId);
  await s.observe("test-room","1",{action:"refund",operationHash:opHash});
  f.observed.paid=[];f.observed.held="0";f.observed.refunded="1000000";await s.drain();
  v=await s.view("test-room","1");assert.equal(v.self.pendingOperations[0].status,"applied");assert.equal(v.self.actions.refund,undefined);assert(v.self.actions.deposit);
  f.observed.paid=[addresses[0]];f.observed.held="1000000";f.observed.deposited="2000000";await s.drain();
  assert.equal((await s.view("test-room","1")).depositedCount,1);assert.equal(s.health.error,null);
  f.observed.refunded="0";await s.drain();assert(s.health.error);await s.close();
});

test("technical void requires reproduced game failure, binds evidence and preserves full refunds after restart",async()=>{
  const f=fixture(),s=await open(f);await s.drain();f.observe(8);await s.drain();await s.start("test-room","1");await s.drain();f.observe(8,"active");await s.drain();
  await assert.rejects(s.requestTechnicalVoid("test-room","operator-test"),/did not reproduce/);
  assert.equal((await s.view("test-room","1")).self.actions.refund,undefined);
  f.failAudit();await s.requestTechnicalVoid("test-room","operator-test");await s.drain();
  const planned=f.submissions.at(-1);assert.equal(planned.kind,"void_room");assert.equal(planned.params.evidence_hash,f.rows.get("test-room")!.technicalVoid!.evidenceHash);
  assert.equal((await s.view("test-room","1")).self.actions.refund,undefined,"submission is not a finalized void");
  f.observed.status="voided";f.observed.voidReasonHash=planned.params.reason_hash;f.observed.voidEvidenceHash=planned.params.evidence_hash;await s.drain();
  assert.equal(f.room.phase,"voided");assert.equal((await s.view("test-room","1")).self.actions.refund.entrypoint,"refund");await s.close();
  f.loseGameAccess();const old=config.rulesHash;config.rulesHash="f".repeat(64);config.enabled=false;
  try{const recovered=f.service();await recovered.observe("test-room","1",{action:"refund",operationHash:opHash});
    f.observed.paid=addresses.slice(1);f.observed.held="7000000";f.observed.refunded="1000000";await recovered.drain();
    const v=await recovered.view("test-room","1");assert.equal(v.status,"voided");assert.equal(v.self.pendingOperations[0].status,"applied");assert.equal(recovered.health.error,null);
    assert.equal(f.submissions.filter(i=>i.kind==="void_room").length,1);await recovered.close();
  }finally{config.rulesHash=old;config.enabled=true;}
});

test("finalized floored prizes expose exact liability and automate only the fixed treasury remainder",async()=>{
  const f=fixture(),s=await open(f);await s.drain();f.observe(8);await s.drain();await s.start("test-room","1");await s.drain();f.observe(8,"active");await s.drain();
  f.setResult({matchId:"party:test-room",receiptsHash:"d".repeat(64),groups:[{placeFrom:1,playerIds:["p0"]},{placeFrom:2,playerIds:addresses.slice(1).map((_,i)=>"p"+(i+1))}]});await s.drain();
  const params=f.submissions.at(-1).params;await assert.rejects(s.requestTechnicalVoid("test-room","operator-test"),/completed game/);
  f.observe(8,"settled");Object.assign(f.observed,{resultHash:params.result_hash,transcriptHash:params.transcript_hash,treasuryAmount:"10000",claims:Object.fromEntries(addresses.map((a,i)=>[a,{amount:i?"570000":"4000000",claimed:false}]))});
  await s.drain();const v=await s.view("test-room","2");assert.equal(v.self.payout!.amount,"570000");assert.deepEqual(v.prizeSummary,{quantumAtomic:"10000",allocatedPlayerPrizesAtomic:"7990000",treasuryRemainderAtomic:"10000",treasuryClaimed:false});
  const treasury=f.submissions.at(-1);assert.equal(treasury.kind,"claim_treasury");assert.equal(treasury.params,f.rows.get("test-room")!.roomId);
  f.observed.treasuryClaimed=true;f.observed.held="7990000";f.observed.paidOut="10000";await s.drain();await s.drain();
  assert.equal(f.submissions.filter(i=>i.kind==="claim_treasury").length,1);assert.equal((await s.view("test-room","1")).prizeSummary!.treasuryClaimed,true);await s.close();
});

test("WTF rooms pin their own approved entry quantum before and after wallet binding",async()=>{
  const f=fixture();f.room.config.tournament={...f.room.config.tournament,currency:"WTF",entryFee:"0.01",entryAtomic:"1000000"};const s=f.service();
  assert.equal((await s.view("test-room","1")).feeQuantumAtomic,"1000000");
  for(let i=0;i<8;i++)await s.bind("test-room",String(i+1),addresses[i]);await s.open("test-room","1");
  assert.equal(f.rows.get("test-room")!.config.feeQuantumAtomic,"1000000");await s.drain();assert.equal(f.submissions[0].params.currency,"1");await s.close();
});
