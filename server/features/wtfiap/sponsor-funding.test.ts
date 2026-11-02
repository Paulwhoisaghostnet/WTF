import test from "node:test";
import assert from "node:assert/strict";
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

function fixture(plan = freePlan, enabled = true) {
  const rows = new Map<string, SponsorRecord>();
  const submissions: string[] = [];
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
      saved.lock = { ...binding, seedCommitment: "c".repeat(64) };
      return clone(saved);
    },
    audit: () => ({ ok: true, code: "healthy", evidence: {} }),
    markVoided: () => { saved.phase = "voided"; },
    start: () => { saved.phase = "preparation"; return clone(saved); },
    update: () => undefined,
    result: () => null,
  };
  const lane = { ...config, enabled,
    ...(enabled ? {} : { reason: "Sponsor contract has not been deployed." }) };
  const service = createSponsorFundingService({ store, game,
    chain: { read: async () => clone(chainRoom),
      submit: async (_record, intent) => {
        submissions.push(intent.kind);
        return { operationHash: "o" + "1".repeat(50) };
      } },
    configs: { mainnet: lane, shadownet: { ...lane, network: "shadownet" } },
    linkedWallet: async (userId, wallet) =>
      (userId === "1" && wallet === sponsorWallet) ||
      (userId === "2" && wallet === entrantWallet),
    onWake: () => undefined,
  });
  const setChain = (room: SponsorChainRoom | null) => { chainRoom = clone(room); };
  return { rows, store, game, saved, setChain, submissions, service };
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

test("disabled sponsor deployment gives a readable non-payment state", async () => {
  const f = fixture(freePlan, false);
  const view = await f.service.view("sponsor-room", "1");
  assert.equal(view.config.enabled, false);
  assert.match(view.config.reason!, /not been deployed/);
  assert.deepEqual(view.self.actions.sponsorLots, []);
  await assert.rejects(f.service.bind("sponsor-room", "1", sponsorWallet), /not been deployed/);
  await f.service.close();
});
