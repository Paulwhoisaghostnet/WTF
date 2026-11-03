import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { commitment, clone } from "./funding";
import { createSponsorFundingService, type SponsorChainRoom,
  type SponsorConfig, type SponsorGame, type SponsorPlan,
  type SponsorRecord, type SponsorStore } from "./sponsor-funding";

const sponsorWallet = "tz1" + "1".repeat(33);
const entrantWallet = "tz1" + "2".repeat(33);
const treasuryWallet = "tz1" + "3".repeat(33);
const escrow = "KT1" + "4".repeat(33);
const token = "KT1" + "5".repeat(33);
const config: SponsorConfig = { enabled: true, network: "mainnet",
  chainId: "NetXdQprcVkpaWU", rpcUrl: "https://tezos-mainnet.octez.io/",
  escrowContract: escrow, scriptHash: "a".repeat(64), roomCreator: sponsorWallet,
  referee: sponsorWallet, walletId: "referee", treasury: treasuryWallet,
  wtfToken: { contract: token, tokenId: "0" }, houseFeeAtomic: "500000",
  rulesHash: "b".repeat(64) };
const freePlan: SponsorPlan = { mode: "fixed", minimumHumans: 2,
  entry: { currency: "FREE", entryAtomic: "0", poolNumerator: "0",
    poolDenominator: "1", designatedWallet: null },
  places: [{ place: 1, xtzAtomic: "1000000", wtfAtomic: "0", poolWeight: "0" }],
  tokens: [], deposit: { xtzAtomic: "1000000", wtfAtomic: "0" } };

function fixture(plan = freePlan, enabled = true, revealedSeed?: string) {
  const rows = new Map<string, SponsorRecord>();
  const submissions: string[] = [];
  let failures: Array<{ userId: string; action: string; operationHash: string; blockHash: string; level: number }> = [];
  let failureReadUnavailable = false;
  let unknownVoidSubmission = false;
  let auditResult: any = { ok: true, code: "healthy", evidence: {} };
  const saved: any = { roomCode: "sponsor-room", hostPlayerId: "p1",
    sponsorAccountId: "1", config: { roomType: "tournament", sponsorNetwork: "mainnet",
      sponsorCompetes: true, sponsor: clone(plan) }, phase: "lobby",
    players: [{ playerId: "p1", accountId: "1", name: "Sponsor", isAI: false }],
    lock: null };
  let chainRoom: SponsorChainRoom | null = null;
  const store: SponsorStore = {
    read: async code => clone(rows.get(code) || null),
    list: async () => [...rows.values()].map(clone),
    mutate: async (code, fn) => {
      const result = await fn(clone(rows.get(code) || null));
      rows.set(code, clone(result.record)); return result.value;
    },
    exclusive: async fn => { await fn(); return true; },
  };
  const game: SponsorGame = {
    inspect: () => clone(saved), list: () => [saved.roomCode],
    lock: (_code, binding) => {
      saved.lock = { ...binding, seedCommitment: revealedSeed
        ? createHash("sha256").update(revealedSeed).digest("hex") : "c".repeat(64) };
      return clone(saved);
    },
    audit: () => auditResult,
    markVoided: () => { saved.phase = "voided"; },
    start: () => { saved.phase = "preparation"; return clone(saved); },
    update: () => undefined,
    result: () => null,
    revealSeed: () => revealedSeed || "",
  };
  const lane = { ...config, enabled,
    ...(enabled ? {} : { reason: "Sponsor contract has not been deployed." }) };
  const service = createSponsorFundingService({ store, game,
    chain: { read: async () => clone(chainRoom),
      failedObservations: async (_record, _observed, pending) => {
        if (failureReadUnavailable) throw Error("Failed-operation proof RPC unavailable");
        return failures.filter(failure => pending.some(item => item.userId === failure.userId &&
          item.action === failure.action && item.operationHash === failure.operationHash));
      },
      submit: async (_record, intent) => {
        submissions.push(intent.kind);
        if (intent.kind === "void_room" && unknownVoidSubmission)
          throw new Error("Signer response was lost after submission.");
        return { operationHash: "o" + "1".repeat(50) };
      } },
    configs: { mainnet: lane, shadownet: { ...lane, network: "shadownet" } },
    linkedWallet: async (userId, wallet) =>
      (userId === "1" && wallet === sponsorWallet) ||
      (userId === "2" && wallet === entrantWallet),
    onWake: () => undefined,
  });
  const setChain = (room: SponsorChainRoom | null) => { chainRoom = clone(room); };
  const setFailures = (value: typeof failures) => { failures = clone(value); };
  const setFailureReadUnavailable = (value: boolean) => { failureReadUnavailable = value; };
  const setUnknownVoidSubmission = (value: boolean) => { unknownVoidSubmission = value; };
  const setAudit = (value: any) => { auditResult = value; };
  return { rows, store, game, saved, setChain, setFailures,
    setFailureReadUnavailable, setUnknownVoidSubmission, setAudit, submissions, service };
}

function observed(record: SponsorRecord): SponsorChainRoom {
  const p = record.plan;
  return { blockHash: "Bfinal", level: 20, status: "funding",
    termsHash: record.termsHash, rulesHash: record.lock.rulesHash,
    seedCommitment: record.lock.seedCommitment,
    sponsor: record.sponsor.walletAddress, referee: record.config.referee,
    entryCurrency: p.entry.currency === "FREE" ? 0 : p.entry.currency === "XTZ" ? 1 : 2,
    entryAtomic: p.entry.entryAtomic, minimumHumans: p.minimumHumans,
    mode: p.mode === "fixed" ? 0 : p.mode === "random" ? 1 : 2,
    poolNumerator: p.entry.poolNumerator, poolDenominator: p.entry.poolDenominator,
    designatedWallet: p.entry.designatedWallet || record.config.treasury,
    places: p.places.map(x => ({ xtz: x.xtzAtomic, wtf: x.wtfAtomic, poolWeight: x.poolWeight })),
    lots: p.tokens.map(x => ({ tokenAddress: x.contract, tokenId: x.tokenId,
      amount: x.amount, fixedPlace: x.place || 0 })), pickCounts: p.pickCounts || [],
    entrants: [], paid: [], sponsorXtzFunded: false, sponsorWtfFunded: false,
    fundedLots: [], verifiedLots: [], lotEvidence: {},
    prizeXtz: p.deposit.xtzAtomic, prizeWtf: p.deposit.wtfAtomic,
    houseFee: p.entry.currency === "XTZ" ? record.config.houseFeeAtomic : "0",
    heldXtz: "0", heldWtf: "0", matchId: null, resultHash: null,
    transcriptHash: null, voidReasonHash: null, voidEvidenceHash: null,
    cashClaims: {}, lotClaims: {} };
}

test("sponsor opens and funds free-prize escrow before another human joins", async () => {
  const f = fixture();
  assert.equal((await f.service.view("sponsor-room", "1")).self.canBind, true);
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1");
  assert.equal(f.rows.get("sponsor-room")?.lock?.roomId,
    f.rows.get("sponsor-room")?.roomId);
  await f.service.drain();
  assert.deepEqual(f.submissions, ["create_room"]);
  let chain = observed(f.rows.get("sponsor-room")!);
  f.setChain(chain);
  await f.service.drain();
  let view = await f.service.view("sponsor-room", "1");
  assert.equal(view.self.actions.sponsorXtz.amountMutez, "1000000");
  assert.equal(view.sponsorFunded, false);
  await assert.rejects(f.service.start("sponsor-room", "1"), /All prizes and human entries/);
  chain.sponsorXtzFunded = true; chain.heldXtz = "1000000"; f.setChain(chain);
  await f.service.drain();
  view = await f.service.view("sponsor-room", "1");
  assert.equal(view.sponsorFunded, true);
  assert.equal(view.self.canStart, false); // Minimum humans belongs to start.
  await f.service.close();
});

test("paid sponsor tournament verifies prize, house fee, and every entrant before start", async () => {
  const plan: SponsorPlan = { ...clone(freePlan),
    entry: { currency: "XTZ", entryAtomic: "1000000", poolNumerator: "0",
      poolDenominator: "1", designatedWallet: treasuryWallet } };
  const f = fixture(plan);
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1");
  await f.service.drain();
  let chain = observed(f.rows.get("sponsor-room")!); f.setChain(chain);
  await f.service.drain();
  let view = await f.service.view("sponsor-room", "1");
  assert.equal(view.self.actions.sponsorXtz.amountMutez, "1500000");
  assert.equal(view.houseFeeAtomic, "500000");
  chain.sponsorXtzFunded = true; chain.heldXtz = "1500000"; f.setChain(chain);
  await f.service.drain();
  f.saved.players.push({ playerId: "p2", accountId: "2", name: "Entrant", isAI: false });
  await f.service.bind("sponsor-room", "2", entrantWallet);
  await f.service.drain();
  assert.deepEqual(f.submissions, ["create_room", "register_entrant", "register_entrant"]);
  chain.entrants = [sponsorWallet, entrantWallet]; f.setChain(chain);
  await f.service.drain();
  view = await f.service.view("sponsor-room", "2");
  assert.equal(view.self.actions.entry.amountMutez, "1000000");
  assert.equal(view.self.canStart, false);
  chain.paid = [sponsorWallet, entrantWallet]; chain.heldXtz = "3500000";
  f.setChain(chain); await f.service.drain();
  assert.equal((await f.service.view("sponsor-room", "1")).self.canStart, true);
  await f.service.start("sponsor-room", "1"); await f.service.drain();
  assert.equal(f.submissions.at(-1), "start_room");
  chain.status = "active"; chain.matchId = f.rows.get("sponsor-room")!.lock.matchId;
  f.setChain(chain); await f.service.drain();
  assert.equal(f.saved.phase, "preparation");
  await f.service.close();
});

test("audited sponsor void freezes an active room and exposes exact cash, entry and FA2 refunds", async () => {
  const plan: SponsorPlan = { ...clone(freePlan),
    entry: { currency: "XTZ", entryAtomic: "1000000", poolNumerator: "0",
      poolDenominator: "1", designatedWallet: treasuryWallet },
    tokens: [{ contract: token, tokenId: "7", amount: "1", place: 1 }] };
  const f = fixture(plan);
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1");
  await f.service.drain();
  f.saved.players.push({ playerId: "p2", accountId: "2", name: "Entrant", isAI: false });
  await f.service.bind("sponsor-room", "2", entrantWallet);
  const record = f.rows.get("sponsor-room")!;
  const chain = observed(record);
  chain.status = "active"; chain.matchId = record.lock.matchId;
  chain.entrants = [sponsorWallet, entrantWallet];
  chain.paid = [sponsorWallet, entrantWallet];
  chain.sponsorXtzFunded = true; chain.heldXtz = "3500000";
  chain.fundedLots = [0]; chain.verifiedLots = [0];
  f.setChain(chain); f.saved.phase = "preparation";
  await f.service.drain();
  await assert.rejects(f.service.requestTechnicalVoid("sponsor-room", "operator"),
    /audit did not reproduce/);
  f.setAudit({ ok: false, code: "authoritative-game-failure",
    evidence: { roomCode: "sponsor-room", fileSha256: "a".repeat(64) } });
  await f.service.requestTechnicalVoid("sponsor-room", "operator");
  const intent = f.rows.get("sponsor-room")!.intents.find(item => item.kind === "void_room")!;
  assert.equal(f.rows.get("sponsor-room")!.status, "voiding");
  assert.equal(intent.params.reason_hash, f.rows.get("sponsor-room")!.technicalVoid!.reasonHash);
  assert.equal((await f.service.view("sponsor-room", "1")).self.canStart, false);
  f.setUnknownVoidSubmission(true);
  await f.service.drain();
  assert.equal(f.rows.get("sponsor-room")!.intents.find(item => item.kind === "void_room")!.status,
    "submission-unknown");
  await f.service.drain();
  assert.equal(f.submissions.filter(kind => kind === "void_room").length, 1);
  chain.status = "voided"; chain.voidReasonHash = "f".repeat(64);
  chain.voidEvidenceHash = intent.params.evidence_hash;
  f.setChain(chain); await f.service.drain();
  assert.equal(f.saved.phase, "preparation");
  assert.match(f.rows.get("sponsor-room")!.error!, /differs from the audited failure/);
  chain.voidReasonHash = intent.params.reason_hash;
  f.setChain(chain); await f.service.drain();
  assert.equal(f.saved.phase, "voided");
  assert.equal(f.rows.get("sponsor-room")!.intents.find(item => item.kind === "void_room")!.status,
    "applied");
  assert.equal(f.rows.get("sponsor-room")!.intents.find(item => item.kind === "void_room")!.appliedAtBlock,
    chain.blockHash);
  assert.equal(f.rows.get("sponsor-room")!.intents.find(item => item.kind === "void_room")!.appliedAtLevel,
    chain.level);
  const sponsor = await f.service.view("sponsor-room", "1");
  const entrant = await f.service.view("sponsor-room", "2");
  assert.equal(sponsor.self.actions.refundSponsorXtz.amountMutez, "0");
  assert.equal(sponsor.self.actions.refundSponsorLots[0].action.entrypoint,
    "refund_sponsor_lot");
  assert.equal(entrant.self.actions.refundEntry.entrypoint, "refund_entry");
  chain.paid = []; chain.sponsorXtzFunded = false;
  chain.fundedLots = []; chain.verifiedLots = []; chain.heldXtz = "0";
  f.setChain(chain); await f.service.drain();
  assert.equal((await f.service.view("sponsor-room", "1")).self.actions.refundSponsorXtz,
    undefined);
  assert.equal((await f.service.view("sponsor-room", "2")).self.actions.refundEntry,
    undefined);
  await f.service.close();
});

test("wallet observation stays pending until its entry or sponsor deposit is visible on chain", async () => {
  const plan: SponsorPlan = { ...clone(freePlan),
    entry: { currency: "XTZ", entryAtomic: "1000000", poolNumerator: "0",
      poolDenominator: "1", designatedWallet: treasuryWallet } };
  const f = fixture(plan);
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1");
  await f.service.drain();
  const chain = observed(f.rows.get("sponsor-room")!);
  f.setChain(chain); await f.service.drain();
  const sponsorHash = "o" + "2".repeat(50);
  await f.service.observe("sponsor-room", "1", { action: "sponsorXtz", operationHash: sponsorHash });
  let view = await f.service.view("sponsor-room", "1");
  assert.equal(view.self.pendingOperations[0].status, "pending");
  assert.equal(view.self.pendingOperations[0].operationHash, sponsorHash);
  chain.sponsorXtzFunded = true; chain.heldXtz = "1500000";
  f.setChain(chain); await f.service.drain();
  view = await f.service.view("sponsor-room", "1");
  assert.equal(view.self.pendingOperations[0].status, "applied");

  f.saved.players.push({ playerId: "p2", accountId: "2", name: "Entrant", isAI: false });
  await f.service.bind("sponsor-room", "2", entrantWallet);
  await f.service.drain();
  chain.entrants = [sponsorWallet, entrantWallet];
  f.setChain(chain); await f.service.drain();
  const entryHash = "o" + "3".repeat(50);
  await f.service.observe("sponsor-room", "2", { action: "entry", operationHash: entryHash });
  view = await f.service.view("sponsor-room", "2");
  assert.equal(view.self.pendingOperations[0].status, "pending");
  assert.equal(view.depositedCount, 0);
  chain.paid = [entrantWallet]; chain.heldXtz = "2500000";
  f.setChain(chain); await f.service.drain();
  view = await f.service.view("sponsor-room", "2");
  assert.equal(view.self.pendingOperations[0].status, "applied");
  assert.equal(view.depositedCount, 1);
  await f.service.close();
});

test("wallet retry is exposed only after a failed operation has finalized branch proof", async () => {
  const f = fixture();
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1");
  await f.service.drain();
  const chain = observed(f.rows.get("sponsor-room")!);
  f.setChain(chain); await f.service.drain();
  const operationHash = "o" + "4".repeat(50);
  await f.service.observe("sponsor-room", "1", { action: "sponsorXtz", operationHash });
  await f.service.drain();
  assert.equal((await f.service.view("sponsor-room", "1")).self.pendingOperations[0].status, "pending");
  f.setFailures([{ userId: "1", action: "sponsorXtz", operationHash,
    blockHash: "Bfailed", level: 19 }]);
  await f.service.drain();
  const observation = (await f.service.view("sponsor-room", "1")).self.pendingOperations[0];
  assert.equal(observation.status, "failed");
  assert.deepEqual(observation.proof, { kind: "finalized-failed-operation",
    blockHash: "Bfailed", level: 19 });
  assert.equal((await f.service.view("sponsor-room", "1")).self.actions.sponsorXtz.amountMutez,
    "1000000");
  await f.service.close();
});

test("unavailable optional failed-operation proof keeps the room usable and wallet checkpoint pending", async () => {
  const f = fixture();
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1");
  await f.service.drain();
  f.setChain(observed(f.rows.get("sponsor-room")!));
  await f.service.drain();
  const operationHash = "o" + "6".repeat(50);
  await f.service.observe("sponsor-room", "1", { action: "sponsorXtz", operationHash });
  f.setFailureReadUnavailable(true);
  await f.service.drain();
  const view = await f.service.view("sponsor-room", "1");
  assert.equal(view.self.pendingOperations[0].status, "pending");
  assert.equal(view.self.pendingOperations[0].operationHash, operationHash);
  assert.equal(view.self.actions.sponsorXtz.amountMutez, "1000000");
  assert.equal(view.error, null);
  assert.equal(f.service.health.error, null);
  await f.service.close();
});

test("disabled sponsor deployment gives a readable non-payment state", async () => {
  const f = fixture(freePlan, false);
  const view = await f.service.view("sponsor-room", "1");
  assert.equal(view.config.enabled, false);
  assert.match(view.config.reason!, /not been deployed/);
  assert.deepEqual(view.self.actions.sponsorLots, []);
  await assert.rejects(f.service.bind("sponsor-room", "1", sponsorWallet), /not been deployed/);
  await f.service.close();
});

test("settled sponsor prizes are claimed automatically and only once per recorded claim", async () => {
  const plan: SponsorPlan = { ...clone(freePlan),
    tokens: [{ contract: token, tokenId: "7", amount: "1", place: 1 }] };
  const f = fixture(plan);
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1");
  await f.service.drain();
  const record = f.rows.get("sponsor-room")!;
  const resultHash = "d".repeat(64), transcriptHash = "e".repeat(64);
  await f.store.mutate("sponsor-room", old => {
    assert(old);
    old.finalResult = { completion: { matchId: "party:sponsor-room" },
      params: { result_hash: resultHash, transcript_hash: transcriptHash },
      hash: "f".repeat(64) };
    return { record: old, value: undefined };
  });
  const chain = observed(record);
  chain.status = "settled";
  chain.resultHash = resultHash;
  chain.transcriptHash = transcriptHash;
  chain.sponsorXtzFunded = true;
  chain.heldXtz = "1000000";
  chain.fundedLots = [0];
  chain.verifiedLots = [0];
  chain.cashClaims[sponsorWallet + ":XTZ"] = { amount: "1000000", claimed: false };
  chain.lotClaims[0] = { recipient: sponsorWallet, claimed: false };
  f.setChain(chain);
  await f.service.drain();
  assert.equal(f.submissions.at(-1), "claim_cash");
  assert.equal(f.rows.get("sponsor-room")?.intents.filter(intent => intent.kind === "claim_cash").length, 1);

  const claimHash = "o" + "6".repeat(50);
  await f.service.observe("sponsor-room", "1", { action: "cashClaim:XTZ", operationHash: claimHash });
  assert.equal((await f.service.view("sponsor-room", "1")).self.pendingOperations[0].status, "pending");

  chain.cashClaims[sponsorWallet + ":XTZ"].claimed = true;
  f.setChain(chain);
  await f.service.drain();
  assert.equal((await f.service.view("sponsor-room", "1")).self.pendingOperations[0].status, "applied");
  assert.equal(f.submissions.at(-1), "claim_lot");

  chain.lotClaims[0].claimed = true;
  chain.fundedLots = [];
  chain.verifiedLots = [];
  f.setChain(chain);
  await f.service.drain();
  const count = f.submissions.length;
  await f.service.drain();
  assert.equal(f.submissions.length, count);
  assert(f.rows.get("sponsor-room")?.intents.filter(intent =>
    intent.kind === "claim_cash" || intent.kind === "claim_lot").every(intent => intent.status === "applied"));
  await f.service.close();
});

test("legacy currency-free cash and index-free lot observations wait for every relevant claim", async () => {
  const plan: SponsorPlan = { ...clone(freePlan),
    places: [{ place: 1, xtzAtomic: "1000000", wtfAtomic: "100000000", poolWeight: "0" }],
    deposit: { xtzAtomic: "1000000", wtfAtomic: "100000000" },
    tokens: [0, 1].map(index => ({ contract: token, tokenId: String(index), amount: "1", place: 1 })) };
  const f = fixture(plan);
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1");
  const chain = observed(f.rows.get("sponsor-room")!);
  chain.status = "settled";
  chain.cashClaims[sponsorWallet + ":XTZ"] = { amount: "1000000", claimed: true };
  chain.cashClaims[sponsorWallet + ":WTF"] = { amount: "100000000", claimed: false };
  chain.lotClaims[0] = { recipient: sponsorWallet, claimed: true };
  chain.lotClaims[1] = { recipient: sponsorWallet, claimed: false };
  await f.store.mutate("sponsor-room", old => {
    assert(old); old.chain = clone(chain); return { record: old, value: undefined };
  });
  await f.service.observe("sponsor-room", "1", { action: "cashClaim", operationHash: "o" + "7".repeat(50) });
  await f.service.observe("sponsor-room", "1", { action: "lotClaim", operationHash: "o" + "8".repeat(50) });
  let statuses = (await f.service.view("sponsor-room", "1")).self.pendingOperations.map(item => item.status);
  assert.deepEqual(statuses, ["pending", "pending"]);
  chain.cashClaims[sponsorWallet + ":WTF"].claimed = true;
  chain.lotClaims[1].claimed = true;
  await f.store.mutate("sponsor-room", old => {
    assert(old); old.chain = clone(chain); return { record: old, value: undefined };
  });
  statuses = (await f.service.view("sponsor-room", "1")).self.pendingOperations.map(item => item.status);
  assert.deepEqual(statuses, ["applied", "applied"]);
  chain.cashClaims[sponsorWallet + ":WTF"] = { amount: "0", claimed: false };
  await f.store.mutate("sponsor-room", old => {
    assert(old); old.chain = clone(chain); return { record: old, value: undefined };
  });
  assert.equal((await f.service.view("sponsor-room", "1")).self.pendingOperations[0].status, "applied");
  await f.service.close();
});

test("legacy index-free FA2 refund stays pending while any sponsor lot remains funded", async () => {
  const plan: SponsorPlan = { ...clone(freePlan),
    tokens: [0, 1].map(index => ({ contract: token, tokenId: String(index), amount: "1", place: 1 })) };
  const f = fixture(plan);
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1");
  const chain = observed(f.rows.get("sponsor-room")!);
  chain.status = "voided";
  chain.fundedLots = [0, 1];
  await f.store.mutate("sponsor-room", old => {
    assert(old); old.chain = clone(chain); return { record: old, value: undefined };
  });
  await f.service.observe("sponsor-room", "1", { action: "refundSponsorLot", operationHash: "o" + "9".repeat(50) });
  const status = async () => (await f.service.view("sponsor-room", "1")).self.pendingOperations[0].status;
  assert.equal(await status(), "pending");
  chain.fundedLots = [1];
  await f.store.mutate("sponsor-room", old => {
    assert(old); old.chain = clone(chain); return { record: old, value: undefined };
  });
  assert.equal(await status(), "pending");
  chain.fundedLots = [];
  await f.store.mutate("sponsor-room", old => {
    assert(old); old.chain = clone(chain); return { record: old, value: undefined };
  });
  assert.equal(await status(), "applied");
  await f.service.close();
});

test("finish-place FA2 picks are recorded in rank order before settlement", async () => {
  const plan: SponsorPlan = { ...clone(freePlan), mode: "pick",
    places: [
      { place: 1, xtzAtomic: "1000000", wtfAtomic: "0", poolWeight: "0" },
      { place: 2, xtzAtomic: "0", wtfAtomic: "0", poolWeight: "0" },
    ],
    tokens: [0, 1, 2].map(index => ({ contract: token, tokenId: String(index), amount: "1" })),
    pickCounts: [2, 1] };
  const f = fixture(plan);
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1");
  await f.service.drain();
  f.saved.players.push({ playerId: "p2", accountId: "2", name: "Entrant", isAI: false });
  await f.service.bind("sponsor-room", "2", entrantWallet);
  const record = f.rows.get("sponsor-room")!;
  const chain = observed(record);
  chain.status = "active"; chain.matchId = record.lock.matchId;
  chain.sponsorXtzFunded = true; chain.heldXtz = "1000000";
  chain.entrants = [sponsorWallet, entrantWallet];
  chain.paid = [sponsorWallet, entrantWallet];
  chain.fundedLots = [0, 1, 2]; chain.verifiedLots = [0, 1, 2];
  f.setChain(chain);
  f.saved.phase = "finished";
  (f.game as any).result = () => ({ matchId: "party:sponsor-room",
    receiptsHash: "d".repeat(64), groups: ["p1", "p2", "a1", "a2", "a3", "a4", "a5", "a6"]
      .map(playerId => ({ playerIds: [playerId] })) });
  (f.game as any).sponsorHumanRanks = () => ({ matchId: "party:sponsor-room",
    rankedPlayerIds: ["p1", "p2"], seedCommitment: record.lock.seedCommitment,
    tieBreaks: [] });
  await f.service.drain();
  assert.equal(f.rows.get("sponsor-room")?.status, "awaiting-prize-picks");
  assert.equal((await f.service.view("sponsor-room", "1")).self.canPick, true);
  await assert.rejects(f.service.pickLot("sponsor-room", "2", 1), /another finisher/);
  await f.service.pickLot("sponsor-room", "1", 2);
  await assert.rejects(f.service.pickLot("sponsor-room", "1", 2), /available FA2 prize/);
  await f.service.pickLot("sponsor-room", "1", 0);
  assert.equal((await f.service.view("sponsor-room", "2")).self.canPick, true);
  await assert.rejects(f.service.pickLot("sponsor-room", "1", 1), /another finisher/);
  await f.service.pickLot("sponsor-room", "2", 1);
  await f.service.drain();
  const final = f.rows.get("sponsor-room")?.finalResult;
  assert.deepEqual(final?.params.lot_places, [1, 2, 1]);
  assert.equal(f.submissions.at(-1), "finalize_room");
  assert.equal((await f.service.view("sponsor-room", "2")).prizeSelection?.nextPlace, null);
  await f.service.close();
});

test("random FA2 prizes derive their lot places from the committed room seed", async () => {
  const seed = "a".repeat(64);
  const plan: SponsorPlan = { ...clone(freePlan), mode: "random",
    places: [
      { place: 1, xtzAtomic: "1000000", wtfAtomic: "0", poolWeight: "0" },
      { place: 2, xtzAtomic: "0", wtfAtomic: "0", poolWeight: "0" },
    ],
    tokens: [
      { contract: token, tokenId: "7", amount: "1" },
      { contract: token, tokenId: "8", amount: "1" },
    ], pickCounts: [1, 1] };
  const f = fixture(plan, true, seed);
  await f.service.bind("sponsor-room", "1", sponsorWallet);
  await f.service.open("sponsor-room", "1"); await f.service.drain();
  f.saved.players.push({ playerId: "p2", accountId: "2", name: "Entrant", isAI: false });
  await f.service.bind("sponsor-room", "2", entrantWallet);
  const record = f.rows.get("sponsor-room")!;
  const chain = observed(record);
  chain.status = "active"; chain.matchId = record.lock.matchId;
  chain.sponsorXtzFunded = true; chain.heldXtz = "1000000";
  chain.entrants = [sponsorWallet, entrantWallet];
  chain.paid = [sponsorWallet, entrantWallet];
  chain.fundedLots = [0, 1]; chain.verifiedLots = [0, 1];
  f.setChain(chain); f.saved.phase = "finished";
  (f.game as any).result = () => ({ matchId: "party:sponsor-room",
    receiptsHash: "d".repeat(64), groups: ["p1", "p2", "a1", "a2", "a3", "a4", "a5", "a6"]
      .map(playerId => ({ playerIds: [playerId] })) });
  (f.game as any).sponsorHumanRanks = () => ({ matchId: "party:sponsor-room",
    rankedPlayerIds: ["p1", "p2"], seedCommitment: record.lock.seedCommitment,
    tieBreaks: [] });
  await f.service.drain();
  assert(f.rows.get("sponsor-room")!.finalResult,
    JSON.stringify({ record: f.rows.get("sponsor-room"), health: f.service.health }));
  assert.deepEqual(f.rows.get("sponsor-room")!.finalResult?.params.lot_places, [2, 1]);
  assert.equal(f.submissions.at(-1), "finalize_room");
  await f.service.close();
});
