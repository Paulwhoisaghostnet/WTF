import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { acknowledgeFundingCheckpoint, submitFundingAction } from "./funding-submit";
import { createFundingActionLatch, loadFundingCheckpoint, type FundingCheckpointStore, type FundingCheckpoint } from "./funding-checkpoint";
import { fundingCalls, sendFundingAction, type FundingWalletGateway } from "./funding-wallet";
import { formatFundingAmount, fundingEntryError, type FundingConfig, type FundingRoom, type FundingWalletAction } from "./funding-types";
import { readWtfIapRoomMessage, wtfIapFundingRecoveryRoom } from "./room-bridge";

const config: FundingConfig = { enabled: true, network: "shadownet", chainId: "NetXsqzbfFenSTS", rpcUrl: "https://tezos-shadownet.octez.io/", escrowContract: "KT1Escrow", wtfToken: { contract: "KT1WTF", tokenId: "0", decimals: 8 }, currencyDecimals: { XTZ: 6, WTF: 8 }, currencyQuantaAtomic: { XTZ: "10000", WTF: "1000000" }, treasuryAddress: "tz1TreasuryFixture", prizeRoundingPolicy: "floor-each-prize-to-quantum;remainder-to-wtf.tez-v1" };
function roomFixture(): FundingRoom {
  const room: FundingRoom = {
    roomCode: "11111111-1111-4111-8111-111111111111", roomType: "tournament", aiFill: false, battlefieldSeats: 8, payingEntrants: 8, roomId: "a".repeat(64), termsHash: "b".repeat(64), status: "funding", feeQuantumAtomic: "10000", refundPolicy: "prestart-withdrawal;technical-void-full-refund-v1", treasuryAddress: config.treasuryAddress, prizeRoundingPolicy: config.prizeRoundingPolicy, prizeSummary: null,
    network: config.network, chainId: config.chainId, escrowContract: config.escrowContract, wtfToken: config.wtfToken,
    terms: { currency: "XTZ", entryFee: "1", entryAtomic: "1000000", decimals: 6, prizePercentages: ["50", "35", "15"] },
    roster: [{ playerId: "seat1", name: "Test entrant", walletAddress: "tz1Bound", deposited: false }],
    depositedCount: 0, potAtomic: "0", chainStatus: "funding", finalizedBlock: { hash: "finalized", level: 42 }, lastReconciledAt: null, operations: [],
    self: { playerId: "seat1", walletAddress: "tz1Bound", canBind: false, canOpen: false, canStart: false, actions: {}, payout: null, pendingOperations: [] },
    health: { lastAttemptAt: null, lastSuccessAt: null, error: null, headStreamConnected: true },
  };
  room.self.actions.deposit = { entrypoint: "join_room", params: { room_id: room.roomId, expected_terms_hash: room.termsHash }, amountMutez: room.terms.entryAtomic, expectedWallet: "tz1Bound", contract: config.escrowContract, network: config.network, chainId: config.chainId };
  return room;
}
function gatewayFixture(): FundingWalletGateway & { calls: string[] } {
  const calls: string[] = [];
  return { calls, network: () => config.network, async assertOwnership(address) { calls.push(`ownership:${address}`); }, async assertReady(address) { calls.push(`ready:${address}`); }, async chainId() { calls.push("chain"); return config.chainId; }, async send() { calls.push("send"); return { opHash: "ooSubmittedHash" }; } };
}
function storeFixture(): FundingCheckpointStore {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}

test("funded wallet actions pin the exact room, case-sensitive signer, asset, atomic amount and chain before sending", async () => {
  const room = roomFixture(), action = room.self.actions.deposit!;
  for (const changed of [
    { expectedWallet: "tz1bound" }, { network: "mainnet" }, { chainId: "anotherChain" }, { contract: "KT1Another" },
    { amountMutez: "1000001" }, { amountMutez: "1e6" }, { entrypoint: "create_room" },
    { params: { room_id: room.roomId, expected_terms_hash: "wrong" } },
    { params: { ...action.params as object, extra: "unapproved" } },
    { fa2Operator: { owner: "tz1Bound", contract: "KT1WTF", tokenId: "0", operator: "KT1Escrow" } },
  ]) {
    const gateway = gatewayFixture();
    await assert.rejects(sendFundingAction(gateway, config, room, "deposit", { ...action, ...changed }, "tz1Bound"));
    assert.deepEqual(gateway.calls, []);
  }
  const gateway = gatewayFixture();
  await assert.rejects(sendFundingAction({ ...gateway, network: () => "mainnet" }, config, room, "deposit", action, "tz1Bound"), /fixed to Tezos shadownet/);
  assert.equal(gateway.calls.length, 0);
  await assert.rejects(sendFundingAction({ ...gateway, chainId: async () => "NetXdQprcVkpaWU" }, config, room, "deposit", action, "tz1Bound"), /RPC/);
  assert.equal(gateway.calls.includes("send"), false);
  await sendFundingAction(gatewayFixture(), config, room, "deposit", action, "tz1Bound");
});

test("WTF deposits use one scoped permission/deposit/removal batch and reject asset substitution", () => {
  const room = roomFixture(); room.terms.currency = "WTF"; room.terms.decimals = 8; room.feeQuantumAtomic = "1000000";
  const action: FundingWalletAction = { ...room.self.actions.deposit!, amountMutez: "0", fa2Operator: { owner: "tz1Bound", contract: "KT1WTF", tokenId: "0", operator: "KT1Escrow" } };
  const calls = fundingCalls(config, room, "deposit", action, "tz1Bound");
  assert.deepEqual(calls.map(call => [call.contract, call.entrypoint, call.amountMutez]), [["KT1WTF", "update_operators", "0"], ["KT1Escrow", "join_room", "0"], ["KT1WTF", "update_operators", "0"]]);
  assert.deepEqual(calls[0].params, [{ add_operator: { owner: "tz1Bound", operator: "KT1Escrow", token_id: "0" } }]);
  assert.deepEqual(calls[2].params, [{ remove_operator: { owner: "tz1Bound", operator: "KT1Escrow", token_id: "0" } }]);
  for (const operator of [{ ...action.fa2Operator!, owner: "tz1Other" }, { ...action.fa2Operator!, tokenId: "1" }, { ...action.fa2Operator!, operator: "KT1Other" }]) assert.throws(() => fundingCalls(config, room, "deposit", { ...action, fa2Operator: operator }, "tz1Bound"));
});

test("Mainnet WTF deposit pins the real asset and sends zero attached XTZ from the entrant wallet", async () => {
  const mainnet: FundingConfig = { ...config, network: "mainnet", chainId: "NetXdQprcVkpaWU",
    rpcUrl: "https://tezos-mainnet.octez.io/", escrowContract: "KT1MainnetEscrow",
    wtfToken: { contract: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD", tokenId: "0", decimals: 8 } };
  const room = roomFixture(); room.network = mainnet.network; room.chainId = mainnet.chainId;
  room.escrowContract = mainnet.escrowContract; room.wtfToken = mainnet.wtfToken;
  room.terms = { ...room.terms, currency: "WTF", decimals: 8, entryFee: "0.01", entryAtomic: "1000000" };
  room.feeQuantumAtomic = "1000000";
  const action: FundingWalletAction = { ...room.self.actions.deposit!, contract: mainnet.escrowContract,
    network: mainnet.network, chainId: mainnet.chainId, amountMutez: "0",
    fa2Operator: { owner: "tz1Bound", contract: mainnet.wtfToken.contract, tokenId: "0", operator: mainnet.escrowContract } };
  const calls = fundingCalls(mainnet, room, "deposit", action, "tz1Bound");
  assert.deepEqual(calls.map(c => c.amountMutez), ["0", "0", "0"]);
  assert.deepEqual(calls.map(c => c.contract), [mainnet.wtfToken.contract, mainnet.escrowContract, mainnet.wtfToken.contract]);
  assert.throws(() => fundingCalls(config, room, "deposit", action, "tz1Bound"), /configuration does not match/);
  const gateway: FundingWalletGateway = { network: () => "mainnet", async assertOwnership() {}, async assertReady() {},
    async chainId() { return "NetXdQprcVkpaWU"; }, async send(batch) {
      assert.deepEqual(batch, calls); return { opHash: "ooMainnetWtfSubmitted" };
    } };
  await sendFundingAction(gateway, mainnet, room, "deposit", action, "tz1Bound");
});

test("XTZ atomic strings retain their value through the installed Taquito transfer preparation", async () => {
  const atomic = "9007199254740993000001";
  const require = createRequire(import.meta.url);
  const { createTransferOperation } = require("@taquito/taquito/dist/lib/contract/prepare.js");
  const prepared = await createTransferOperation({ to: config.escrowContract, amount: atomic, mutez: true });
  assert.equal(prepared.amount, atomic);
  assert.equal(formatFundingAmount(atomic, 6), "9007199254740993.000001");
});

test("submitted hash survives a lost observe response and recovery never submits again", async () => {
  const room = roomFixture(), store = storeFixture(), gateway = gatewayFixture();
  let checkpointSeen = false;
  await assert.rejects(submitFundingAction({ store, gateway,
    onSubmitted(checkpoint) { checkpointSeen = true; assert.equal(checkpoint.operationHash, "ooSubmittedHash"); },
    async observe(checkpoint) { assert.equal(checkpointSeen, true); assert.deepEqual(loadFundingCheckpoint(store, "account1", room.roomCode), checkpoint); throw new Error("response lost"); },
  }, "account1", config, room, "deposit", "tz1Bound"), /response lost/);
  const saved = loadFundingCheckpoint(store, "account1", room.roomCode)!;
  assert.equal(saved.operationHash, "ooSubmittedHash");
  await assert.rejects(submitFundingAction({ store, gateway, onSubmitted() {}, async observe() { return room; } }, "account1", config, room, "deposit", "tz1Bound"), /awaiting verification/);
  assert.equal(gateway.calls.filter(call => call === "send").length, 1);
  assert.equal(acknowledgeFundingCheckpoint(store, "account1", room, saved), false);
  room.roster[0].deposited = true;
  assert.equal(acknowledgeFundingCheckpoint(store, "account1", room, saved), true);
  assert.equal(loadFundingCheckpoint(store, "account1", room.roomCode), null);
  assert.equal(gateway.calls.filter(call => call === "send").length, 1);
});

test("account scopes, finalized state and server observations protect recovery from another room or browser storage loss", async () => {
  const room = roomFixture(), gateway = gatewayFixture(), store = storeFixture();
  room.self.pendingOperations = [{ action: "deposit", operationHash: "ooAlreadySubmitted", playerId: "seat1", observedAt: "2026-10-19" }];
  await assert.rejects(submitFundingAction({ store, gateway, onSubmitted() {}, async observe() { return room; } }, "account1", config, room, "deposit", "tz1Bound"), /server is tracking/);
  assert.deepEqual(gateway.calls, []);
  const checkpoint = { accountId: "account1", roomCode: room.roomCode, walletAddress: "tz1Bound", network: config.network, contract: config.escrowContract, action: "deposit" as const, operationHash: "ooAlreadySubmitted" };
  room.roster[0].deposited = true;
  assert.equal(acknowledgeFundingCheckpoint(store, "differentAccount", room, checkpoint), false);
  assert.equal(acknowledgeFundingCheckpoint(store, "account1", { ...room, network: "mainnet" }, checkpoint), false);
  assert.equal(acknowledgeFundingCheckpoint(store, "account1", { ...room, finalizedBlock: null }, checkpoint), false);
});

test("a same-tick double click and a remounted panel share one account action latch", async () => {
  let finish!: () => void;
  const latch = createFundingActionLatch("test-account"), remounted = createFundingActionLatch("test-account");
  const first = latch.run(() => new Promise<void>(resolve => { finish = resolve; }));
  assert.equal(latch.active, true);
  await assert.rejects(remounted.run(async () => {}), /already in progress/);
  finish(); await first;
  assert.equal(latch.active, false);
  await remounted.run(async () => {});
});

test("verified failed observations permit recovery, while disabling new funding does not trap a verified prize claim", async () => {
  const room = roomFixture(), store = storeFixture();
  const checkpoint = { accountId: "account1", roomCode: room.roomCode, walletAddress: "tz1Bound", network: config.network, contract: config.escrowContract, action: "deposit" as const, operationHash: "ooFailedOnChain" };
  room.self.pendingOperations = [{ playerId: "seat1", action: "deposit", operationHash: checkpoint.operationHash, observedAt: "2026-10-19", status: "failed" }];
  assert.equal(acknowledgeFundingCheckpoint(store, "account1", room, checkpoint), true);
  room.self.payout = { amount: "4000000", claimed: false };
  const claim = { ...room.self.actions.deposit!, entrypoint: "claim", params: room.roomId, amountMutez: "0" };
  assert.deepEqual(fundingCalls({ ...config, enabled: false }, room, "claim", claim, "tz1Bound"), [{ contract: config.escrowContract, entrypoint: "claim", params: room.roomId, amountMutez: "0" }]);
  assert.throws(() => fundingCalls({ ...config, enabled: false }, room, "deposit", room.self.actions.deposit!, "tz1Bound"), /unavailable/);
  assert.throws(() => fundingCalls(config, room, "claim", { ...claim, params: "anotherRoom" }, "tz1Bound"), /withdrawal/);
});

test("native room bridge accepts only its same-origin iframe and public room/reset identity", () => {
  const source = {} as Window, other = {} as Window, origin = "https://wtfos.app";
  const data = { type: "wtfiap:room", roomCode: roomFixture().roomCode, roomType: "tournament", sessionToken: "must-not-cross", walletRequest: "ignored" };
  assert.deepEqual(readWtfIapRoomMessage({ source, origin, data }, source, origin), { type: "wtfiap:room", roomCode: data.roomCode, roomType: "tournament", wagered: true });
  assert.deepEqual(readWtfIapRoomMessage({ source, origin, data: { ...data, roomType: "duel", wagered: true } }, source, origin),
    { type: "wtfiap:room", roomCode: data.roomCode, roomType: "duel", wagered: true });
  assert.deepEqual(readWtfIapRoomMessage({ source, origin, data: { ...data, roomType: "duel", wagered: false } }, source, origin),
    { type: "wtfiap:room", roomCode: data.roomCode, roomType: "duel", wagered: false });
  assert.equal(readWtfIapRoomMessage({ source: other, origin, data }, source, origin), null);
  assert.equal(readWtfIapRoomMessage({ source, origin: "https://other.example", data }, source, origin), null);
  assert.equal(readWtfIapRoomMessage({ source, origin, data: { ...data, roomCode: "https://evil.example" } }, source, origin), null);
  assert.deepEqual(readWtfIapRoomMessage({ source, origin, data: { type: "wtfiap:room", roomCode: null, roomType: null } }, source, origin), { type: "wtfiap:room", roomCode: null, roomType: null, wagered: false });
  assert.equal(wtfIapFundingRecoveryRoom(`/wtfiap?room=${data.roomCode}&funding=1`), data.roomCode);
  assert.equal(wtfIapFundingRecoveryRoom(`/wtfiap?room=${data.roomCode}`), null);
  assert.equal(wtfIapFundingRecoveryRoom("/wtfiap?room=malformed&funding=1"), null);
  assert.equal(wtfIapFundingRecoveryRoom(`/another-app?room=${data.roomCode}&funding=1`), null);
});


test("approved currency increments reject invalid entry before wallet work while preserving exact atomic math", async () => {
  for (const [currency, decimals, quantum] of [["XTZ", 6, "10000"], ["WTF", 8, "1000000"]] as const) {
    const room = roomFixture(); room.terms.currency = currency; room.terms.decimals = decimals; room.feeQuantumAtomic = quantum;
    for (const atomic of ["0", "1", (BigInt(quantum) + 1n).toString(), "1e6", "-1"]) {
      room.terms.entryAtomic = atomic;
      assert.match(fundingEntryError(room)!, /positive multiple of 0.01/);
      const gateway = gatewayFixture();
      await assert.rejects(sendFundingAction(gateway, config, room, "deposit", room.self.actions.deposit!, "tz1Bound"));
      assert.deepEqual(gateway.calls, []);
    }
    room.terms.entryAtomic = (BigInt(quantum) * 9007199254740993n).toString();
    assert.equal(fundingEntryError(room), null);
    room.feeQuantumAtomic = null;
    assert.match(fundingEntryError(room)!, /no approved entry increment/);
  }
});

test("full refunds remain available with admissions disabled and require exact finalized observation before redeposit", async () => {
  const room = roomFixture(), store = storeFixture(), gateway = gatewayFixture();
  room.roster[0].deposited = true;
  const refund: FundingWalletAction = { ...room.self.actions.deposit!, entrypoint: "refund", params: room.roomId, amountMutez: "0" };
  room.self.actions.refund = refund;
  let submitted: FundingCheckpoint | undefined;
  await assert.rejects(submitFundingAction({ store, gateway, onSubmitted(value) { submitted = value; }, async observe() { throw new Error("refund response lost"); } }, "account1", { ...config, enabled: false }, room, "refund", "tz1Bound"), /refund response lost/);
  const saved = loadFundingCheckpoint(store, "account1", room.roomCode)!;
  assert.equal(saved.action, "refund"); assert.deepEqual({ ...saved }, submitted);
  room.roster[0].deposited = false;
  assert.equal(acknowledgeFundingCheckpoint(store, "account1", room, saved), false, "An absent deposit alone is not an exact refund receipt");
  await assert.rejects(submitFundingAction({ store, gateway, onSubmitted() {}, async observe() { return room; } }, "account1", config, room, "deposit", "tz1Bound"), /awaiting verification/);
  room.self.pendingOperations = [{ playerId: "seat1", action: "refund", operationHash: saved.operationHash, observedAt: "2026-10-22", status: "applied" }];
  assert.equal(acknowledgeFundingCheckpoint(store, "account1", room, saved), true);
  await submitFundingAction({ store, gateway, onSubmitted() {}, async observe() { room.roster[0].deposited = true; return room; } }, "account1", config, room, "deposit", "tz1Bound");
  assert.equal(gateway.calls.filter(call => call === "send").length, 2);
  room.chainStatus = "voided";
  assert.equal(fundingCalls({ ...config, enabled: false }, room, "refund", refund, "tz1Bound")[0].entrypoint, "refund");
  assert.throws(() => fundingCalls(config, room, "refund", { ...refund, params: "another-room" }, "tz1Bound"), /withdrawal/);
});
