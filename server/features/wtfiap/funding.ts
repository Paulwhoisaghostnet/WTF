import { createHash } from "node:crypto";
import type { FundingStore } from "./funding-store";

export const stable = (value: any): string => Array.isArray(value) ? `[${value.map(stable).join(",")}]`
  : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",")}}` : JSON.stringify(value);
export const commitment = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");
export function demand(value: unknown, message: string, status = 409): asserts value {
  if (!value) throw Object.assign(new Error(message), { status });
}
export const clone = <T>(value: T): T => structuredClone(value);
export type FundingConfig = {
  enabled: boolean; reason?: string; network: "mainnet" | "shadownet"; chainId: string; rpcUrl: string;
  escrowContract: string; scriptHash: string; refereeAddress: string; creatorAddress: string; walletId: string;
  wtfToken: { contract: string; tokenId: string; decimals: 8 }; rulesHash: string;
  feeQuantumAtomic: string | null; refundPolicy: string | null;
  currencyQuantaAtomic: { XTZ: string; WTF: string }; treasuryAddress: string; prizeRoundingPolicy: string;
  minimalBlockDelaySeconds?: number | null;
  indexerUrl?: string;
};
export type Binding = { playerId: string; userId: string; walletAddress: string };
export type Intent = {
  id: string; kind: "create_room" | "start_room" | "finalize_room" | "void_room" | "claim_treasury"; params: any; payloadHash: string;
  status: "planned" | "submission-unknown" | "submitted" | "applied";
  operationHash?: string; checkpointAt?: string; appliedAtBlock?: string; error?: string;
};
export type ChainRoom = {
  blockHash: string; level: number; termsHash: string; rulesHash: string; seedCommitment: string;
  referee: string; currency: string; entryAtomic: string; entrants: string[]; paid: string[];
  held: string; paidOut: string; deposited: string; refunded: string; quantum: string;
  treasuryAmount: string; treasuryClaimed: boolean; voidReasonHash: string | null; voidEvidenceHash: string | null; status: "funding" | "active" | "settled" | "voided";
  matchId: string | null; resultHash: string | null; transcriptHash: string | null;
  claims: Record<string, { amount: string; claimed: boolean }>;
};
export type FundingRecord = {
  schemaVersion: 1; roomCode: string; config: FundingConfig; terms: any; bindings: Binding[];
  roomId: string; termsHash: string | null; lock: any | null; startRequested: boolean;
  status: "binding" | "opening" | "funding" | "starting" | "active" | "settling" | "settled" | "voiding" | "voided";
  chain: ChainRoom | null; intents: Intent[];
  observations: Array<{ playerId: string; action: "deposit" | "claim" | "refund"; operationHash: string; observedAt: string;
    status: "pending" | "applied" | "failed"; proof?: { kind: "finalized-action-state" | "finalized-failed-operation"; blockHash: string; level: number } }>;
  lastReconciledAt: string | null; error: string | null;
  roomSnapshot: GameRoom;
  technicalVoid: null | { operatorId: string; requestedAt: string; reason: string; evidence: any; reasonHash: string; evidenceHash: string };
  finalResult: { completion: any; params: any; hash: string } | null;
};
export type GameRoom = { roomCode: string; hostPlayerId: string; config: any; phase: string;
  players: Array<{ playerId: string; name: string; isAI: boolean; accountId: string | null }>; lock: any | null };
export type FundingGame = {
  inspect(code: string): GameRoom; list(): string[]; lock(code: string, binding: any): GameRoom;
  audit(code: string): { ok: boolean; code: string; evidence: any };
  markVoided(code: string, binding: any): void;
  start(code: string, binding: any): GameRoom; update(code: string, summary: any): void; result(code: string): any | null;
};
export interface FundingChain {
  read(record: FundingRecord): Promise<ChainRoom | null>;
  submit(record: FundingRecord, intent: Intent): Promise<{ operationHash: string }>;
  failedObservations?(record: FundingRecord, observed: ChainRoom | null): Promise<Array<{ operationHash: string; playerId: string; action: string; blockHash: string; level: number }>>;
}
export function observationApplied(record: FundingRecord, observed: ChainRoom | null, observation: FundingRecord["observations"][number]) {
  const binding = record.bindings.find(b => b.playerId === observation.playerId);
  return Boolean(binding && observed && (observation.action === "deposit" ? observed.paid.includes(binding.walletAddress) :
    observation.action === "claim" ? observed.claims[binding.walletAddress]?.claimed === true :
    observation.action === "refund" && !observed.paid.includes(binding.walletAddress)));
}
export type WalletAction = { entrypoint: string; params: unknown; amountMutez: string; expectedWallet: string;
  contract: string; network: string; chainId: string;
  fa2Operator?: { contract: string; tokenId: string; owner: string; operator: string } };

export function createFundingService({ config, store, game, chain, linkedWallet, clock = () => new Date(), onWake }: {
  config: FundingConfig; store: FundingStore; game: FundingGame; chain: FundingChain;
  linkedWallet: (userId: string, address: string) => Promise<boolean>; clock?: () => Date; onWake?: () => void;
}) {
  let running: Promise<void> | null = null, rerun = false, closed = false;
  const health = { lastAttemptAt: null as string | null, lastSuccessAt: null as string | null,
    error: null as string | null, headStreamConnected: false };
  function enabled() { demand(config.enabled, config.reason || "Funded rooms are not configured.", 503); }
  async function seat(code: string, userId: string | null) {
    demand(userId, "Sign in to the account that owns this commander.", 401);
    const saved = await store.read(code);
    const room = (saved?.finalResult || saved?.technicalVoid) ? saved.roomSnapshot : game.inspect(code);
    demand(room.config.roomType === "tournament", "Only tournament rooms can open prize escrow.");
    const player = room.players.find(p => p.accountId === userId && !p.isAI);
    demand(player, "This account does not own a human seat in this room.", 403);
    return { room, player };
  }
  function fresh(room: GameRoom): FundingRecord {
    demand(room.phase === "lobby", "This tournament has already started.");
    return { schemaVersion: 1, roomCode: room.roomCode, config: { ...clone(config), feeQuantumAtomic: config.currencyQuantaAtomic[room.config.tournament.currency as "XTZ" | "WTF"] }, terms: clone(room.config.tournament), bindings: [],
      roomId: commitment({ version: "wtfiap-room-v1", network: config.network, contract: config.escrowContract, roomCode: room.roomCode }),
      termsHash: null, lock: null, startRequested: false, status: "binding", chain: null, intents: [], observations: [], lastReconciledAt: null, error: null,
      roomSnapshot: clone(room), finalResult: null, technicalVoid: null };
  }
  function verifyLocal(record: FundingRecord, room: GameRoom) {
    demand(record.schemaVersion === 1 && record.roomCode === room.roomCode, "Invalid durable funding identity.");
    demand(stable(record.terms) === stable(room.config.tournament), "Tournament terms changed.");
    demand(record.finalResult || record.chain?.status === "voided" || record.config.rulesHash === config.rulesHash, "This tournament requires its pinned game rules.");
    if (record.technicalVoid) demand(record.technicalVoid.reasonHash === commitment(record.technicalVoid.reason) &&
      record.technicalVoid.evidenceHash === commitment(record.technicalVoid.evidence), "Technical-void evidence was altered.");
    if (record.finalResult) demand(record.finalResult.hash === commitment({ completion: record.finalResult.completion, params: record.finalResult.params }), "Frozen terminal result was altered.");
    demand(new Set(record.bindings.map(b => b.playerId)).size === record.bindings.length &&
      new Set(record.bindings.map(b => b.walletAddress)).size === record.bindings.length, "Duplicate funded entrant.");
    for (const binding of record.bindings) demand(room.players.some(p => !p.isAI && p.playerId === binding.playerId && p.accountId === binding.userId), "Funded seat identity changed.");
    if (record.lock) {
      demand(record.bindings.length === 8 && room.players.length === 8 && room.lock, "Frozen funding requires eight original human seats.");
      for (const key of ["roomId", "termsHash", "rulesHash", "matchId", "seedCommitment", "network", "escrowContract"])
        demand(record.lock[key] === room.lock[key], "Game and escrow commitments differ.");
    }
    for (const intent of record.intents) demand(intent.payloadHash === commitment(intent.params) &&
      intent.id === commitment({ roomId: record.roomId, kind: intent.kind, payloadHash: intent.payloadHash }), "Funding intent was altered.");
  }
  function intent(record: FundingRecord, kind: Intent["kind"], params: any) {
    const payloadHash = commitment(params), existing = record.intents.find(i => i.kind === kind);
    if (existing) { demand(existing.payloadHash === payloadHash, "An escrow operation cannot change after planning."); return existing; }
    const value: Intent = { id: commitment({ roomId: record.roomId, kind, payloadHash }), kind, params: clone(params), payloadHash, status: "planned" };
    record.intents.push(value); return value;
  }
  async function bind(code: string, userId: string, walletAddress: string) {
    enabled(); const { room, player } = await seat(code, userId);
    demand(/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(walletAddress), "Use the exact linked Tezos wallet address.", 400);
    demand(await linkedWallet(userId, walletAddress), "Link and verify this wallet with your account before entering.", 403);
    await store.mutate(code, old => {
      // No escrow intent or lock means no payment is possible. Rebinding is
      // an explicit safe restart after a compatible UI/config release.
      const record = old && (old.lock || room.lock || old.config.rulesHash === config.rulesHash) ? old : fresh(room); verifyLocal(record, room);
      demand(room.phase === "lobby", "This tournament has already started.");
      const prior = record.bindings.find(b => b.playerId === player.playerId);
      demand(!(record.lock || room.lock) || prior?.walletAddress === walletAddress, "Funded wallet bindings are frozen.");
      demand(!record.bindings.some(b => b.playerId !== player.playerId && b.walletAddress === walletAddress), "Each tournament entrant must use a distinct wallet.");
      record.bindings = record.bindings.filter(b => b.playerId !== player.playerId);
      record.bindings.push({ playerId: player.playerId, userId, walletAddress });
      record.bindings.sort((a, b) => room.players.findIndex(p => p.playerId === a.playerId) - room.players.findIndex(p => p.playerId === b.playerId));
      return { record, value: undefined };
    });
    return view(code, userId);
  }
  async function open(code: string, userId: string) {
    enabled(); const { room, player } = await seat(code, userId);
    demand(room.hostPlayerId === player.playerId, "Only the room host can open escrow.", 403);
    await store.mutate(code, async old => {
      demand(old, "Bind all entrant wallets first."); const record = old; verifyLocal(record, room);
      demand(record.bindings.length === 8 && room.players.length === 8, "Eight linked human wallets are required before funding opens.");
      for (const binding of record.bindings) demand(await linkedWallet(binding.userId, binding.walletAddress), "An entrant wallet is no longer linked to its account.", 403);
      demand(record.config.feeQuantumAtomic && BigInt(record.terms.entryAtomic) % BigInt(record.config.feeQuantumAtomic) === 0n,
        "The entry fee must meet the exact equal-prize granularity shown in the room terms.", 400);
      demand(record.config.refundPolicy, "The refund policy is not configured.", 503);
      const termsHash = commitment({ version: "wtfiap-terms-v1", roomId: record.roomId, terms: record.terms,
        entrants: record.bindings.map(b => ({ playerId: b.playerId, wallet: b.walletAddress })),
        refundPolicy: record.config.refundPolicy, feeQuantumAtomic: record.config.feeQuantumAtomic, treasuryAddress: record.config.treasuryAddress, prizeRoundingPolicy: record.config.prizeRoundingPolicy });
      record.termsHash = termsHash;
      record.lock = game.lock(code, { roomId: record.roomId, termsHash, rulesHash: record.config.rulesHash,
        matchId: commitment({ version: "wtfiap-match-v1", roomId: record.roomId, gameMatchId: "party:" + code }),
        network: record.config.network, escrowContract: record.config.escrowContract }).lock;
      record.roomSnapshot = game.inspect(code);
      intent(record, "create_room", { room_id: record.roomId, terms_hash: termsHash, rules_hash: record.lock.rulesHash,
        seed_commitment: record.lock.seedCommitment, referee: record.config.refereeAddress,
        currency: record.terms.currency === "XTZ" ? "0" : "1", entry_amount: record.terms.entryAtomic,
        entrants: record.bindings.map(b => b.walletAddress) });
      if (record.status === "binding") record.status = "opening";
      return { record, value: undefined };
    });
    kick(); return view(code, userId);
  }
  async function start(code: string, userId: string) {
    enabled(); const { room, player } = await seat(code, userId);
    demand(player.playerId === room.hostPlayerId, "Only the host can request the funded match start.", 403);
    await store.mutate(code, old => {
      demand(old?.lock, "Open and fund the escrow first."); verifyLocal(old, room);
      demand(old.chain?.paid.length === 8, "Eight finalized deposits are required.");
      old.startRequested = true; return { record: old, value: undefined };
    });
    kick(); return view(code, userId);
  }
  async function observe(code: string, userId: string, input: { action: "deposit" | "claim" | "refund"; operationHash: string }) {
    const { player } = await seat(code, userId);
    demand(["deposit", "claim", "refund"].includes(input.action) && /^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(input.operationHash), "Provide the submitted operation hash and action.", 400);
    await store.mutate(code, old => {
      demand(old?.lock && old.bindings.some(b => b.playerId === player.playerId), "This seat has no funded wallet binding.");
      if (!old.observations.some(o => o.playerId === player.playerId && o.action === input.action && o.operationHash === input.operationHash))
        old.observations.push({ ...input, playerId: player.playerId, observedAt: clock().toISOString(), status: "pending" });
      return { record: old, value: undefined };
    });
    kick(); return view(code, userId);
  }
  function verifyChain(record: FundingRecord, observed: ChainRoom) {
    demand(record.lock && record.termsHash, "Missing frozen room commitments.");
    demand(observed.termsHash === record.termsHash && observed.rulesHash === record.lock.rulesHash &&
      observed.seedCommitment === record.lock.seedCommitment && observed.referee === record.config.refereeAddress,
      "Finalized escrow commitments do not match the game.");
    demand(observed.currency === (record.terms.currency === "XTZ" ? "0" : "1") && observed.entryAtomic === record.terms.entryAtomic &&
      stable(observed.entrants) === stable(record.bindings.map(b => b.walletAddress)), "Finalized escrow terms or roster differ.");
    demand(new Set(observed.paid).size === observed.paid.length && observed.paid.every(p => observed.entrants.includes(p)), "Invalid finalized deposit roster.");
    demand(observed.quantum === record.config.feeQuantumAtomic, "Escrow precision differs from the agreed currency terms.");
    demand(BigInt(observed.held) + BigInt(observed.paidOut) + BigInt(observed.refunded) === BigInt(observed.deposited) &&
      BigInt(observed.deposited) - BigInt(observed.refunded) === BigInt(record.terms.entryAtomic) * BigInt(observed.paid.length),
      "Escrow accounting does not conserve cumulative deposits, refunds and prizes.");
    if (observed.status === "voided") demand(record.technicalVoid && observed.voidReasonHash === record.technicalVoid.reasonHash &&
      observed.voidEvidenceHash === record.technicalVoid.evidenceHash, "Voided escrow is not bound to this verified technical failure.");
    if (observed.status !== "funding" && observed.status !== "voided") demand(observed.paid.length === 8 && observed.matchId === record.lock.matchId, "The escrow start does not match the game.");
  }
  function resultParams(record: FundingRecord) {
    if (record.technicalVoid) return null;
    if (record.finalResult) return clone(record.finalResult.params);
    const result = game.result(record.roomCode); if (!result) return null;
    demand(result.matchId === "party:" + record.roomCode, "Match result belongs to another room.");
    const ranks = result.groups.flatMap((group: any) => group.playerIds.map((id: string) => {
      const binding = record.bindings.find(b => b.playerId === id); demand(binding, "Result contains an unknown entrant.");
      return { player: binding.walletAddress, rank: String(group.placeFrom) };
    }));
    demand(ranks.length === 8 && new Set(ranks.map((r: any) => r.player)).size === 8, "Results require all eight funded entrants.");
    return { room_id: record.roomId, match_id: record.lock.matchId, transcript_hash: result.receiptsHash,
      result_hash: commitment({ version: "wtfiap-result-v1", roomId: record.roomId, matchId: record.lock.matchId,
        termsHash: record.termsHash, transcriptHash: result.receiptsHash, ranks }), ranks };
  }
  async function reconcileRecord(code: string) {
    let record = await store.read(code); if (!record?.lock) return;
    verifyLocal(record, (record.finalResult || record.technicalVoid) ? record.roomSnapshot : game.inspect(code));
    // read() pins every field and big-map lookup to one two-successor-finalized
    // block and verifies the chain, contract script and immutable asset first.
    const observed = await chain.read(record);
    if (observed) verifyChain(record, observed);
    const failed = await chain.failedObservations?.(record, observed) || [];
    let result = resultParams(record);
    await store.mutate(code, old => {
      demand(old, "Durable funding room missing."); verifyLocal(old, (old.finalResult || old.technicalVoid) ? old.roomSnapshot : game.inspect(code));
      if (old.technicalVoid) result = null;
      if (result && !old.finalResult) {
        const completion = game.result(code);
        old.finalResult = { completion: clone(completion), params: clone(result), hash: commitment({ completion, params: result }) };
        old.roomSnapshot = game.inspect(code);
      }
      old.chain = observed; old.lastReconciledAt = clock().toISOString(); old.error = null;
      for (const observation of old.observations) {
        const applied = observationApplied(old, observed, observation);
        const failure = failed.find(item => item.operationHash === observation.operationHash && item.playerId === observation.playerId && item.action === observation.action);
        if (applied) { observation.status = "applied"; observation.proof = { kind: "finalized-action-state", blockHash: observed!.blockHash, level: observed!.level }; }
        else if (failure) { observation.status = "failed"; observation.proof = { kind: "finalized-failed-operation", blockHash: failure.blockHash, level: failure.level }; }
      }
      for (const op of old.intents) {
        const applied = observed && (op.kind === "create_room" || op.kind === "start_room" && ["active", "settled"].includes(observed.status) ||
          op.kind === "finalize_room" && observed.status === "settled" && observed.resultHash === op.params.result_hash && observed.transcriptHash === op.params.transcript_hash ||
          op.kind === "void_room" && observed.status === "voided" && observed.voidReasonHash === op.params.reason_hash && observed.voidEvidenceHash === op.params.evidence_hash ||
          op.kind === "claim_treasury" && observed.status === "settled" && observed.treasuryClaimed);
        if (applied) { op.status = "applied"; op.appliedAtBlock = observed!.blockHash; delete op.error; }
      }
      if (observed?.status === "settled") {
        demand(result && observed.resultHash === result.result_hash && observed.transcriptHash === result.transcript_hash,
          "Finalized prizes are not bound to this authoritative result.");
        old.status = "settled";
        if (!observed.treasuryClaimed && BigInt(observed.treasuryAmount) > 0n) intent(old, "claim_treasury", old.roomId);
      } else if (observed?.status === "voided") old.status = "voided";
      else if (old.technicalVoid) old.status = "voiding";
      else if (observed?.status === "active") {
        old.status = result ? "settling" : "active";
        if (result) intent(old, "finalize_room", result);
      }
      else if (observed) {
        old.status = old.startRequested ? "starting" : "funding";
        if (old.startRequested && observed.paid.length === 8) intent(old, "start_room", {
          room_id: old.roomId, expected_terms_hash: old.termsHash, match_id: old.lock.matchId });
      }
      return { record: old, value: undefined };
    });
    record = (await store.read(code))!;
    if (record.chain?.status === "active" && !record.finalResult && !record.technicalVoid) game.start(code, record.lock);
    if (record.chain?.status === "voided" && record.config.rulesHash === config.rulesHash) game.markVoided(code, record.lock);
    if (record.config.rulesHash === config.rulesHash) game.update(code, { status: record.status, collectedAtomic: record.chain?.deposited || "0",
      feeQuantumAtomic: record.config.feeQuantumAtomic, treasuryAddress: record.config.treasuryAddress,
      refundPolicy: record.config.refundPolicy, prizeRoundingPolicy: record.config.prizeRoundingPolicy,
      prizeSummary: prizeSummary(record), payouts: record.chain?.status === "settled" ? record.bindings.flatMap(b => {
        const payout = record.chain!.claims[b.walletAddress]; return payout ? [{ playerId: b.playerId, amountAtomic: payout.amount, claimed: payout.claimed }] : []; }) : [] });
    // Checkpoint BEFORE invoking any external signing side effect. A crash,
    // timeout, refused response or lost opHash leaves reconciliation-only state.
    // Nothing turns submission-unknown back into planned automatically.
    const next = record.intents.find(i => i.status === "planned" && (!record!.technicalVoid || i.kind === "void_room"));
    if (!next) {
      const unresolved = record.intents.find(op => op.status === "submission-unknown");
      if (unresolved) {
        const message = unresolved.error || "An escrow submission needs reconciliation before it can continue.";
        await store.mutate(code, old => { demand(old, "Funding room missing."); old.error = message; return { record: old, value: undefined }; });
        health.error = message;
      }
      return;
    }
    // Disabling admissions pauses creation and starts. Existing settlement,
    // audited voids and treasury liabilities retain their pinned obligations.
    if (!config.enabled && ["create_room", "start_room"].includes(next.kind)) return;
    await store.mutate(code, old => {
      demand(old, "Durable funding room missing.");
      const op = old.intents.find(i => i.id === next.id); demand(op?.status === "planned", "Operation already checkpointed.");
      op.status = "submission-unknown"; op.checkpointAt = clock().toISOString();
      return { record: old, value: undefined };
    });
    try {
      const submitted = await chain.submit(record, next);
      demand(/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(submitted.operationHash), "Signer did not return a valid operation hash.");
      await store.mutate(code, old => {
        demand(old, "Durable funding room missing."); const op = old.intents.find(i => i.id === next.id)!;
        op.operationHash = submitted.operationHash; if (op.status !== "applied") op.status = "submitted";
        return { record: old, value: undefined };
      });
    } catch {
      await store.mutate(code, old => {
        demand(old, "Durable funding room missing."); const op = old.intents.find(i => i.id === next.id)!;
        op.error = "Submission outcome is unknown. Reconciliation is required before any further action.";
        old.error = op.error; health.error = op.error; return { record: old, value: undefined };
      });
    }
  }
  // This method is intentionally host-internal. The HTTP router never exposes
  // it: an operator must obtain a reproducible authoritative failure first.
  async function requestTechnicalVoid(code: string, operatorId: string) {
    demand(typeof operatorId === "string" && operatorId.trim(), "Record the private operator identity.", 400);
    await store.mutate(code, async old => {
      demand(old?.lock && !old.finalResult, "A completed game cannot be technically voided.");
      verifyLocal(old, old.roomSnapshot);
      if (old.technicalVoid) return { record: old, value: undefined };
      const observed = await chain.read(old); demand(observed && ["funding", "active"].includes(observed.status), "Only an unsettled escrow can be technically voided.");
      verifyChain(old, observed);
      demand(old.config.rulesHash === config.rulesHash, "Run the audit with the room's pinned game rules.");
      const audit = game.audit(code); demand(audit.ok === false && audit.code === "authoritative-game-failure", "The authoritative game audit did not reproduce a technical failure.");
      const reason = "authoritative-game-failure";
      const evidence = { version: "wtfiap-technical-void-v1", roomId: old.roomId, termsHash: old.termsHash,
        rulesHash: old.config.rulesHash, finalizedBlock: { hash: observed.blockHash, level: observed.level }, audit: audit.evidence };
      old.technicalVoid = { operatorId: operatorId.trim(), requestedAt: clock().toISOString(), reason, evidence,
        reasonHash: commitment(reason), evidenceHash: commitment(evidence) };
      old.status = "voiding";
      intent(old, "void_room", { room_id: old.roomId, reason_hash: old.technicalVoid.reasonHash, evidence_hash: old.technicalVoid.evidenceHash });
      return { record: old, value: undefined };
    });
    kick(); return { roomCode: code, status: "voiding" };
  }
  function prizeSummary(record: FundingRecord | null) {
    return record?.chain?.status === "settled" ? { quantumAtomic: record.chain.quantum,
      allocatedPlayerPrizesAtomic: Object.values(record.chain.claims).reduce((sum, claim) => sum + BigInt(claim.amount), 0n).toString(),
      treasuryRemainderAtomic: record.chain.treasuryAmount, treasuryClaimed: record.chain.treasuryClaimed } : null;
  }
  async function drain() {
    if (closed) return;
    if (running) { rerun = true; return running; }
    running = (async () => {
      do {
        rerun = false; health.lastAttemptAt = clock().toISOString(); health.error = null;
        try {
          await store.exclusive(async () => {
            for (const record of await store.list()) {
              if (!record.lock) continue;
              try { await reconcileRecord(record.roomCode); }
              catch {
                health.error = "A funded room could not be reconciled. No unverified payment or result was accepted.";
                await store.mutate(record.roomCode, old => { demand(old, "Funding room missing."); old.error = health.error; return { record: old, value: undefined }; });
              }
            }
          });
          if (!health.error) health.lastSuccessAt = clock().toISOString();
        } catch { health.error = "Funding storage or chain reconciliation is unavailable."; }
      } while (rerun && !closed);
    })().finally(() => { running = null; });
    return running;
  }
  function kick() { if (!closed) { if (onWake) onWake(); else void drain(); } }
  async function view(code: string, userId: string | null) {
    const record = await store.read(code);
    const room = (record?.finalResult || record?.technicalVoid) ? record.roomSnapshot : game.inspect(code), player = userId ? room.players.find(p => p.accountId === userId) : undefined;
    demand(room.config.roomType === "tournament", "Only tournament rooms have funding terms.");
    const binding = record?.bindings.find(b => b.playerId === player?.playerId);
    const actions: Record<string, WalletAction> = {};
    if (binding && record?.chain && !record.error) {
      const base = { expectedWallet: binding.walletAddress, contract: record.config.escrowContract,
        network: record.config.network, chainId: record.config.chainId };
      if (config.enabled && !record.technicalVoid && record.chain.status === "funding" && !record.chain.paid.includes(binding.walletAddress)) actions.deposit = {
        ...base, entrypoint: "join_room", params: { room_id: record.roomId, expected_terms_hash: record.termsHash },
        amountMutez: record.terms.currency === "XTZ" ? record.terms.entryAtomic : "0",
        ...(record.terms.currency === "WTF" ? { fa2Operator: { contract: record.config.wtfToken.contract,
          tokenId: record.config.wtfToken.tokenId, owner: binding.walletAddress, operator: record.config.escrowContract } } : {}) };
      if (["funding", "voided"].includes(record.chain.status) && record.chain.paid.includes(binding.walletAddress))
        actions.refund = { ...base, entrypoint: "refund", params: record.roomId, amountMutez: "0" };
      const claim = record.chain.claims[binding.walletAddress];
      if (record.chain.status === "settled" && claim && !claim.claimed && BigInt(claim.amount) > 0n)
        actions.claim = { ...base, entrypoint: "claim", params: record.roomId, amountMutez: "0" };
    }
    const c = record?.config || { ...config, feeQuantumAtomic: config.currencyQuantaAtomic[room.config.tournament.currency as "XTZ" | "WTF"] };
    return { roomCode: code, status: record?.status || "binding", terms: record?.terms || room.config.tournament,
      roomId: record?.roomId || null, termsHash: record?.termsHash || null,
      network: c.network, chainId: c.chainId, escrowContract: c.escrowContract, wtfToken: c.wtfToken,
      refundPolicy: c.refundPolicy, feeQuantumAtomic: c.feeQuantumAtomic, treasuryAddress: c.treasuryAddress,
      prizeRoundingPolicy: c.prizeRoundingPolicy, prizeSummary: prizeSummary(record),
      roster: room.players.map(p => { const b = record?.bindings.find(b => b.playerId === p.playerId);
        return { playerId: p.playerId, name: p.name, walletAddress: b?.walletAddress || null, deposited: Boolean(b && record?.chain?.paid.includes(b.walletAddress)) }; }),
      depositedCount: record?.chain?.paid.length || 0,
      potAtomic: (BigInt(record?.terms.entryAtomic || room.config.tournament.entryAtomic) * BigInt(record?.chain?.paid.length || 0)).toString(),
      chainStatus: record?.chain?.status || null, lastReconciledAt: record?.lastReconciledAt || null,
      finalizedBlock: record?.chain ? { hash: record.chain.blockHash, level: record.chain.level } : null,
      operations: (record?.intents || []).map(i => ({ kind: i.kind, status: i.status, operationHash: i.operationHash || null })),
      self: { playerId: player?.playerId || null, walletAddress: binding?.walletAddress || null,
        canBind: Boolean(player && config.enabled && room.phase === "lobby" && !record?.lock && !room.lock),
        canOpen: Boolean(config.enabled && player?.playerId === room.hostPlayerId && record?.bindings.length === 8 && !record.lock),
        canStart: Boolean(config.enabled && !record?.technicalVoid && player?.playerId === room.hostPlayerId && record?.chain?.status === "funding" && record.chain.paid.length === 8),
        actions, payout: binding && record?.chain?.claims[binding.walletAddress] || null,
        pendingOperations: (record?.observations || []).filter(o => o.playerId === player?.playerId) },
      error: record?.error || null, health: { ...health } };
  }
  return { bind, open, start, observe, view, drain, kick, health, requestTechnicalVoid,
    inspectSeat: seat, publicConfig: () => ({ enabled: config.enabled, ...(config.reason ? { reason: config.reason } : {}),
      network: config.network, chainId: config.chainId, rpcUrl: config.rpcUrl, escrowContract: config.escrowContract,
      wtfToken: config.wtfToken, currencyDecimals: { XTZ: 6, WTF: 8 }, feeQuantumAtomic: config.feeQuantumAtomic, refundPolicy: config.refundPolicy,
      currencyQuantaAtomic: config.currencyQuantaAtomic, treasuryAddress: config.treasuryAddress, prizeRoundingPolicy: config.prizeRoundingPolicy }),
    close: async () => { closed = true; if (running) await running; },
  };
}
