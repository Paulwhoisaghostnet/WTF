import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { clone, commitment, demand, type FundingGame, type WalletAction } from "./funding";

type Network = "mainnet" | "shadownet";
type Currency = "FREE" | "XTZ" | "WTF";
export type SponsorConfig = {
  enabled: boolean; reason?: string; network: Network; chainId: string; rpcUrl: string;
  escrowContract: string; scriptHash: string; roomCreator: string; referee: string;
  walletId: string; treasury: string; wtfToken: { contract: string; tokenId: string };
  houseFeeAtomic: string; rulesHash: string;
};
export type SponsorPlan = {
  mode: "fixed" | "random" | "pick"; minimumHumans: number;
  entry: { currency: Currency; entryAtomic: string; poolNumerator: string;
    poolDenominator: string; designatedWallet: string | null };
  places: Array<{ place: number; xtzAtomic: string; wtfAtomic: string; poolWeight: string }>;
  tokens: Array<{ contract: string; tokenId: string; amount: string; place?: number }>;
  pickCounts?: number[]; deposit: { xtzAtomic: string; wtfAtomic: string };
};
export type SponsorGameRoom = ReturnType<FundingGame["inspect"]> & {
  sponsorAccountId?: string | null; hostWatcherId?: string | null;
};
export type SponsorGame = FundingGame & {
  inspect(code: string): SponsorGameRoom;
  revealSeed?(code: string): string;
  sponsorHumanRanks?(code: string): {
    matchId: string; rankedPlayerIds: string[]; seedCommitment: string;
    tieBreaks: Array<{ placeFrom: number; playerIds: string[];
      resolvedPlayerIds: string[]; draws: Array<{ factor: string;
        scores: Array<{ playerId: string; value: number }> }> }>;
  };
  admitFundedSeat?(code: string, accountId: string, name: string, binding: unknown): { playerId: string };
};
type Binding = { userId: string; playerId: string; walletAddress: string; name: string };
export type SponsorIntent = { id: string; kind: "create_room" | "register_entrant" | "start_room" |
  "finalize_room" | "void_room"; key: string; params: any; status: "planned" | "submission-unknown" | "submitted" | "applied";
  operationHash?: string; error?: string };
export type SponsorChainRoom = {
  blockHash: string; level: number; status: "funding" | "active" | "settled" | "voided";
  termsHash: string; rulesHash: string; seedCommitment: string; sponsor: string; referee: string;
  entryCurrency: number; entryAtomic: string; minimumHumans: number; mode: number;
  poolNumerator: string; poolDenominator: string; designatedWallet: string;
  places: Array<{ xtz: string; wtf: string; poolWeight: string }>;
  lots: Array<{ tokenAddress: string; tokenId: string; amount: string; fixedPlace: number }>;
  pickCounts: number[];
  entrants: string[]; paid: string[]; sponsorXtzFunded: boolean; sponsorWtfFunded: boolean;
  fundedLots: number[]; verifiedLots: number[];
  lotEvidence: Record<number, { operationHash: string; operationLevel: number;
    tokenTransactionId: number; escrowBalance: string }>;
  prizeXtz: string; prizeWtf: string; houseFee: string;
  heldXtz: string; heldWtf: string; matchId: string | null; resultHash: string | null; transcriptHash: string | null;
  voidReasonHash: string | null; voidEvidenceHash: string | null;
  cashClaims: Record<string, { amount: string; claimed: boolean }>;
  lotClaims: Record<number, { recipient: string; claimed: boolean }>;
};
export type SponsorRecord = {
  schemaVersion: 1; roomCode: string; roomId: string; config: SponsorConfig; plan: SponsorPlan;
  sponsor: { userId: string; walletAddress: string }; bindings: Binding[];
  lock: any | null; termsHash: string; startRequested: boolean;
  status: string; chain: SponsorChainRoom | null; intents: SponsorIntent[];
  observations: Array<{ userId: string; action: string; operationHash: string; observedAt: string }>;
  finalResult: null | { completion: any; params: any; hash: string };
  technicalVoid: null | { operatorId: string; reasonHash: string; evidenceHash: string };
  error: string | null; lastReconciledAt: string | null;
};
export type SponsorStore = {
  read(code: string): Promise<SponsorRecord | null>;
  list(): Promise<SponsorRecord[]>;
  mutate<T>(code: string, fn: (old: SponsorRecord | null) => Promise<{ record: SponsorRecord; value: T }> |
    { record: SponsorRecord; value: T }): Promise<T>;
  exclusive(fn: () => Promise<void>): Promise<boolean>;
};
export type SponsorChain = {
  read(record: SponsorRecord): Promise<SponsorChainRoom | null>;
  submit(record: SponsorRecord, intent: SponsorIntent): Promise<{ operationHash: string }>;
};

const isWallet = (value: unknown): value is string =>
  typeof value === "string" && /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
const isOperation = (value: unknown): value is string =>
  typeof value === "string" && /^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(value);
const contractMode = { fixed: 0, random: 1, pick: 2 } as const;
const contractCurrency = { FREE: 0, XTZ: 1, WTF: 2 } as const;
const cashKey = (address: string, currency: "XTZ" | "WTF") => address + ":" + currency;
const action = (record: SponsorRecord, wallet: string, entrypoint: string, params: unknown,
  amountMutez = "0", fa2Operator?: WalletAction["fa2Operator"]): WalletAction => ({
  entrypoint, params, amountMutez, expectedWallet: wallet, contract: record.config.escrowContract,
  network: record.config.network, chainId: record.config.chainId, ...(fa2Operator ? { fa2Operator } : {}),
});

export function createSponsorFundingService({ store, game, chain, configs, linkedWallet,
  clock = () => new Date(), onWake }: {
  store: SponsorStore; game: SponsorGame; chain: SponsorChain;
  configs: Record<Network, SponsorConfig>;
  linkedWallet: (userId: string, address: string) => Promise<boolean>;
  clock?: () => Date; onWake?: () => void;
}) {
  let running: Promise<void> | null = null, rerun = false, closed = false;
  const health = { lastAttemptAt: null as string | null, lastSuccessAt: null as string | null,
    error: null as string | null, headStreamConnected: false };
  function room(code: string): SponsorGameRoom {
    const value = game.inspect(code);
    demand(value.config?.sponsor && ["party", "tournament"].includes(value.config.roomType),
      "This room has no sponsor prize terms.", 400);
    return value;
  }
  function selected(value: SponsorGameRoom, record?: SponsorRecord | null): SponsorConfig {
    const network = value.config.sponsorNetwork as Network;
    demand(network === "mainnet" || network === "shadownet",
      "Sponsored room network is missing.", 400);
    const active = configs[network];
    if (!record) return active;
    const same = active.chainId === record.config.chainId &&
      active.escrowContract === record.config.escrowContract &&
      active.scriptHash === record.config.scriptHash &&
      active.roomCreator === record.config.roomCreator &&
      active.referee === record.config.referee &&
      active.treasury === record.config.treasury &&
      active.wtfToken.contract === record.config.wtfToken.contract &&
      active.wtfToken.tokenId === record.config.wtfToken.tokenId;
    return same ? active : { ...record.config, enabled: false,
      reason: "This room's pinned sponsor escrow no longer accepts new deposits. Verified refunds and claims remain available." };
  }
  function sponsorAccount(value: SponsorGameRoom): string | null {
    return value.sponsorAccountId || value.players.find(p => p.playerId === value.hostPlayerId)?.accountId || null;
  }
  function plan(value: SponsorGameRoom): SponsorPlan { return value.config.sponsor as SponsorPlan; }
  function verifyLocal(record: SponsorRecord, value: SponsorGameRoom) {
    demand(record.schemaVersion === 1 && record.roomCode === value.roomCode,
      "Invalid sponsor funding identity.");
    demand(commitment(record.plan) === commitment(plan(value)),
      "Sponsor prize terms changed.");
    demand(record.sponsor.userId === sponsorAccount(value),
      "Sponsor account changed.");
    demand(new Set(record.bindings.map(b => b.walletAddress)).size === record.bindings.length,
      "Entrant wallet is bound twice.");
    demand(record.bindings.every(b => b.userId !== record.sponsor.userId || value.config.sponsorCompetes === true),
      "A noncompeting sponsor cannot claim an entrant seat.");
    if (record.lock) for (const key of ["roomId", "termsHash", "rulesHash", "matchId", "seedCommitment"])
      demand(record.lock[key] === value.lock?.[key], "Game and sponsor escrow commitments differ.");
  }
  function planIntent(record: SponsorRecord, kind: SponsorIntent["kind"], key: string, params: any) {
    const prior = record.intents.find(item => item.key === key);
    if (prior) {
      demand(prior.kind === kind && commitment(prior.params) === commitment(params),
        "Sponsor escrow operation changed after planning.");
      return prior;
    }
    const item: SponsorIntent = { id: commitment({ roomId: record.roomId, kind, key, params }),
      kind, key, params: clone(params), status: "planned" };
    record.intents.push(item); return item;
  }
  function createParams(record: SponsorRecord) {
    const p = record.plan, designated = p.entry.designatedWallet || record.config.treasury;
    return {
      room_id: record.roomId, terms_hash: record.termsHash, rules_hash: record.lock.rulesHash,
      seed_commitment: record.lock.seedCommitment, referee: record.config.referee,
      sponsor: record.sponsor.walletAddress, mode: contractMode[p.mode],
      minimum_humans: p.minimumHumans, entry_currency: contractCurrency[p.entry.currency],
      entry_amount: p.entry.entryAtomic, pool_numerator: p.entry.poolNumerator,
      pool_denominator: p.entry.poolDenominator, designated_wallet: designated,
      places: p.places.map(award => ({ xtz: award.xtzAtomic, wtf: award.wtfAtomic,
        pool_weight: award.poolWeight })),
      lots: p.tokens.map(lot => ({ token_address: lot.contract, token_id: lot.tokenId,
        amount: lot.amount, fixed_place: lot.place || 0 })),
      pick_counts: p.pickCounts || [],
    };
  }
  async function bind(code: string, userId: string, walletAddress: string) {
    const value = room(code), account = sponsorAccount(value);
    demand(value.phase === "lobby", "This room has already started.");
    demand(isWallet(walletAddress), "Use a Tezos wallet address.", 400);
    demand(await linkedWallet(userId, walletAddress),
      "Link and verify this wallet with your wtfOS account.", 403);
    const isSponsor = userId === account;
    const player = value.players.find(p => p.accountId === userId && !p.isAI);
    demand(isSponsor || player, "Join this room before binding an entrant wallet.", 403);
    const config = selected(value, await store.read(code));
    demand(config.enabled, config.reason || "Sponsor escrow is not deployed and verified.", 503);
    await store.mutate(code, old => {
      if (!old) {
        demand(isSponsor, "The sponsor must establish the prize escrow first.", 403);
        const p = clone(plan(value));
        const roomId = commitment({ version: "wtfiap-sponsor-room-v1", network: config.network,
          contract: config.escrowContract, roomCode: code });
        const termsHash = commitment({ version: "wtfiap-sponsor-terms-v1", roomId,
          plan: p, sponsor: walletAddress, network: config.network, treasury: config.treasury,
          wtfToken: config.wtfToken, houseFeeAtomic: config.houseFeeAtomic });
        old = { schemaVersion: 1, roomCode: code, roomId, config: clone(config), plan: p,
          sponsor: { userId, walletAddress }, bindings: [], lock: null, termsHash,
          startRequested: false, status: "binding", chain: null, intents: [],
          observations: [], finalResult: null, technicalVoid: null, error: null,
          lastReconciledAt: null };
      } else verifyLocal(old, value);
      if (isSponsor) demand(old.sponsor.walletAddress === walletAddress,
        "The sponsor wallet is fixed for this room.");
      if (player) {
        demand(!old.lock || !old.bindings.some(b => b.playerId === player.playerId && b.walletAddress !== walletAddress),
          "A funded entrant wallet cannot change.");
        demand(!old.bindings.some(b => b.playerId !== player.playerId && b.walletAddress === walletAddress),
          "Each entrant needs a distinct wallet.");
        old.bindings = old.bindings.filter(b => b.playerId !== player.playerId);
        old.bindings.push({ userId, playerId: player.playerId, walletAddress, name: player.name });
      }
      return { record: old, value: undefined };
    });
    kick(); return view(code, userId);
  }
  async function open(code: string, userId: string) {
    const value = room(code), record = await store.read(code);
    demand(record && record.sponsor.userId === userId,
      "Bind the sponsor wallet before opening escrow.", 403);
    verifyLocal(record, value);
    const config = selected(value, record);
    demand(config.enabled, config.reason || "Sponsor escrow is not deployed and verified.", 503);
    demand(value.phase === "lobby", "This room has already started.");
    if (!record.lock) demand(await chain.read(record) === null,
      "This sponsor room identity already exists on-chain.");
    await store.mutate(code, old => {
      demand(old, "Sponsor funding record disappeared.");
      verifyLocal(old, value);
      old.lock = game.lock(code, { roomId: old.roomId, termsHash: old.termsHash,
        rulesHash: old.config.rulesHash, matchId: commitment({ version: "wtfiap-sponsor-match-v1",
          roomId: old.roomId, gameMatchId: "party:" + code }),
        network: old.config.network, escrowContract: old.config.escrowContract }).lock;
      planIntent(old, "create_room", "create", createParams(old));
      old.status = "opening";
      return { record: old, value: undefined };
    });
    kick(); return view(code, userId);
  }
  async function start(code: string, userId: string) {
    const value = room(code), record = await store.read(code);
    demand(record && record.sponsor.userId === userId,
      "Only the sponsor can request the match start.", 403);
    verifyLocal(record, value);
    demand(record.lock && record.chain?.status === "funding",
      "Prize escrow must open before starting.");
    demand(fullyFunded(record, value), "All prizes and human entries must be verified on-chain.");
    await store.mutate(code, old => {
      demand(old, "Sponsor funding record disappeared.");
      old.startRequested = true; return { record: old, value: undefined };
    });
    kick(); return view(code, userId);
  }
  function fullyFunded(record: SponsorRecord, value: SponsorGameRoom) {
    const chainRoom = record.chain;
    if (!chainRoom || chainRoom.status !== "funding" || !record.lock) return false;
    const human = value.players.filter(p => !p.isAI);
    if (human.length < record.plan.minimumHumans || human.length !== record.bindings.length ||
      chainRoom.entrants.length !== human.length || chainRoom.paid.length !== human.length) return false;
    if (!human.every(p => record.bindings.some(b => b.playerId === p.playerId &&
      chainRoom.entrants.includes(b.walletAddress) && chainRoom.paid.includes(b.walletAddress)))) return false;
    const xtzNeeded = BigInt(record.plan.deposit.xtzAtomic) + BigInt(
      record.plan.entry.currency === "XTZ" ? record.config.houseFeeAtomic : "0");
    return (xtzNeeded === 0n || chainRoom.sponsorXtzFunded) &&
      (BigInt(record.plan.deposit.wtfAtomic) === 0n || chainRoom.sponsorWtfFunded) &&
      record.plan.tokens.every((_, index) => chainRoom.verifiedLots.includes(index));
  }
  async function observe(code: string, userId: string, input: { action: string; operationHash: string }) {
    const value = room(code), record = await store.read(code);
    demand(record && (record.sponsor.userId === userId || value.players.some(p => p.accountId === userId)),
      "This account cannot observe this room's wallet operations.", 403);
    demand(isOperation(input.operationHash) && /^[a-zA-Z0-9:-]+$/.test(input.action),
      "Provide a submitted operation hash and action.", 400);
    await store.mutate(code, old => {
      demand(old, "Sponsor funding record disappeared.");
      if (!old.observations.some(o => o.operationHash === input.operationHash))
        old.observations.push({ userId, action: input.action, operationHash: input.operationHash,
          observedAt: clock().toISOString() });
      return { record: old, value: undefined };
    });
    kick(); return view(code, userId);
  }
  function verifyChain(record: SponsorRecord, chainRoom: SponsorChainRoom) {
    demand(chainRoom.termsHash === record.termsHash && chainRoom.rulesHash === record.lock?.rulesHash &&
      chainRoom.seedCommitment === record.lock?.seedCommitment &&
      chainRoom.sponsor === record.sponsor.walletAddress &&
      chainRoom.referee === record.config.referee &&
      chainRoom.minimumHumans === record.plan.minimumHumans &&
      chainRoom.entryCurrency === contractCurrency[record.plan.entry.currency] &&
      chainRoom.entryAtomic === record.plan.entry.entryAtomic &&
      chainRoom.mode === contractMode[record.plan.mode] &&
      chainRoom.prizeXtz === record.plan.deposit.xtzAtomic &&
      chainRoom.prizeWtf === record.plan.deposit.wtfAtomic &&
      chainRoom.poolNumerator === record.plan.entry.poolNumerator &&
      chainRoom.poolDenominator === record.plan.entry.poolDenominator &&
      chainRoom.designatedWallet === (record.plan.entry.designatedWallet || record.config.treasury) &&
      chainRoom.houseFee === (record.plan.entry.currency === "XTZ" ? record.config.houseFeeAtomic : "0") &&
      commitment(chainRoom.places) === commitment(record.plan.places.map(p => ({
        xtz: p.xtzAtomic, wtf: p.wtfAtomic, poolWeight: p.poolWeight
      }))) &&
      commitment(chainRoom.lots) === commitment(record.plan.tokens.map(lot => ({
        tokenAddress: lot.contract, tokenId: lot.tokenId, amount: lot.amount,
        fixedPlace: lot.place || 0
      }))) &&
      commitment(chainRoom.pickCounts) === commitment(record.plan.pickCounts || []),
      "On-chain sponsor escrow differs from the room's fixed prize terms.");
  }
  function resultParams(record: SponsorRecord, value: SponsorGameRoom) {
    if (record.finalResult) return { completion: record.finalResult.completion,
      params: record.finalResult.params };
    const result = game.result(record.roomCode);
    if (!result) return null;
    demand(result.matchId === "party:" + record.roomCode,
      "Sponsor result belongs to another room.");
    const orderedIds = result.groups.flatMap((group: any) => group.playerIds);
    demand(orderedIds.length === 8 && new Set(orderedIds).size === 8,
      "The authoritative result must rank all eight battlefield commanders.");
    const resolution = game.sponsorHumanRanks?.(record.roomCode);
    demand(resolution && resolution.matchId === result.matchId &&
      resolution.seedCommitment === record.lock.seedCommitment,
    "Sponsored prizes require a replay-backed, committed-seed ranking for human finishers.");
    const humanIds = resolution.rankedPlayerIds;
    demand(humanIds.length === record.bindings.length &&
      new Set(humanIds).size === humanIds.length &&
      humanIds.every(id => record.bindings.some(b => b.playerId === id)),
    "The resolved human ranking must contain every funded entrant exactly once.");
    const humanRanks = humanIds.flatMap((id: string) => {
      const binding = record.bindings.find(b => b.playerId === id);
      return binding ? [binding.walletAddress] : [];
    });
    demand(humanRanks.length === record.bindings.length,
      "Every funded human must appear exactly once in the final result.");
    let lotPlaces: number[];
    if (record.plan.mode === "fixed") lotPlaces = record.plan.tokens.map(lot => lot.place!);
    else if (record.plan.mode === "random") {
      const seed = game.revealSeed?.(record.roomCode);
      demand(seed && /^[a-f0-9]{64}$/.test(seed) &&
        createHash("sha256").update(seed).digest("hex") === record.lock.seedCommitment,
      "The finished room seed is not available for verified random prizes.");
      const require = createRequire(path.resolve("package.json"));
      const prizeModule = require(path.resolve("server/features/wtfiap/runtime/game/core/sponsored-prizes.cjs"));
      lotPlaces = prizeModule.randomAllocation(record.plan, seed).sort((a: any, b: any) => a.index - b.index).map((lot: any) => lot.place);
    } else {
      // Place-order picks need each winning human's recorded choice. Never
      // invent an allocation or send an NFT to an unintended winner.
      return null;
    }
    const params = { room_id: record.roomId, match_id: record.lock.matchId,
      transcript_hash: result.receiptsHash,
      result_hash: commitment({ version: "wtfiap-sponsor-result-v1", roomId: record.roomId,
        matchId: record.lock.matchId, termsHash: record.termsHash,
        transcriptHash: result.receiptsHash, groups: result.groups,
        humanRanking: resolution, humanRanks, lotPlaces }),
      human_ranks: humanRanks, lot_places: lotPlaces };
    return { completion: { ...result, humanRanking: resolution }, params };
  }
  async function reconcileRecord(code: string) {
    let record = await store.read(code);
    if (!record?.lock) return;
    const value = room(code);
    verifyLocal(record, value);
    const chainRoom = await chain.read(record);
    if (chainRoom) verifyChain(record, chainRoom);
    const finished = chainRoom?.status === "active" ? resultParams(record, value) : null;
    await store.mutate(code, old => {
      demand(old, "Sponsor funding record disappeared.");
      old.chain = chainRoom; old.error = null; old.lastReconciledAt = clock().toISOString();
      for (const item of old.intents) {
        const applied = item.kind === "create_room" && Boolean(chainRoom) ||
          item.kind === "register_entrant" && chainRoom?.entrants.includes(item.params.player) ||
          item.kind === "start_room" && ["active", "settled"].includes(chainRoom?.status || "") ||
          item.kind === "finalize_room" && chainRoom?.status === "settled" &&
            chainRoom.resultHash === item.params.result_hash ||
          item.kind === "void_room" && chainRoom?.status === "voided" &&
            chainRoom.voidReasonHash === item.params.reason_hash;
        if (applied) item.status = "applied";
      }
      if (!chainRoom) old.status = "opening";
      else if (chainRoom.status === "voided") old.status = "voided";
      else if (chainRoom.status === "settled") {
        demand(old.finalResult && chainRoom.resultHash === old.finalResult.params.result_hash &&
          chainRoom.transcriptHash === old.finalResult.params.transcript_hash,
          "The settled on-chain result differs from authoritative combat.");
        old.status = "settled";
      } else if (chainRoom.status === "active") {
        old.status = finished ? "settling" : "active";
        if (finished && !old.finalResult) {
          old.finalResult = { completion: clone(finished.completion), params: clone(finished.params),
            hash: commitment(finished) };
          planIntent(old, "finalize_room", "finalize", finished.params);
        }
      } else {
        old.status = old.startRequested ? "starting" : "funding";
        for (const binding of old.bindings)
          if (!chainRoom.entrants.includes(binding.walletAddress))
            planIntent(old, "register_entrant", "register:" + binding.walletAddress,
              { room_id: old.roomId, player: binding.walletAddress });
        if (old.startRequested && fullyFunded({ ...old, chain: chainRoom }, value))
          planIntent(old, "start_room", "start", { room_id: old.roomId,
            expected_terms_hash: old.termsHash, match_id: old.lock.matchId });
      }
      return { record: old, value: undefined };
    });
    record = (await store.read(code))!;
    if (chainRoom?.status === "active" && value.phase === "lobby")
      game.start(code, record.lock);
    if (chainRoom?.status === "voided" && value.phase !== "voided")
      game.markVoided(code, record.lock);
    if (chainRoom)
      game.update(code, { status: record.status,
        collectedAtomic: chainRoom.heldXtz,
        prizeSummary: { xtzAtomic: chainRoom.prizeXtz, wtfAtomic: chainRoom.prizeWtf,
          fundedLots: chainRoom.fundedLots.length, totalLots: record.plan.tokens.length } });
    const next = record.intents.find(i => i.status === "planned");
    if (!next) return;
    // A changed deployment must never admit new funds. Pinned rooms still
    // need their referee to settle or void existing liabilities.
    if (!selected(value, record).enabled &&
      ["create_room", "register_entrant", "start_room"].includes(next.kind)) return;
    await store.mutate(code, old => {
      demand(old, "Sponsor funding record disappeared.");
      const item = old.intents.find(i => i.id === next.id);
      demand(item?.status === "planned", "Escrow intent already checkpointed.");
      item.status = "submission-unknown"; return { record: old, value: undefined };
    });
    try {
      const submitted = await chain.submit(record, next);
      demand(isOperation(submitted.operationHash), "Signer did not return an operation hash.");
      await store.mutate(code, old => {
        demand(old, "Sponsor funding record disappeared.");
        const item = old.intents.find(i => i.id === next.id)!;
        item.operationHash = submitted.operationHash;
        if (item.status !== "applied") item.status = "submitted";
        return { record: old, value: undefined };
      });
    } catch {
      await store.mutate(code, old => {
        demand(old, "Sponsor funding record disappeared.");
        const item = old.intents.find(i => i.id === next.id)!;
        item.error = "Sponsor escrow submission outcome is unknown; reconcile on-chain before retrying.";
        old.error = item.error;
        return { record: old, value: undefined };
      });
    }
  }
  async function drain() {
    if (closed) return;
    if (running) { rerun = true; return running; }
    running = (async () => {
      rerun = false; health.lastAttemptAt = clock().toISOString(); health.error = null;
      try {
        await store.exclusive(async () => {
          for (const saved of await store.list()) if (saved.lock) {
            try { await reconcileRecord(saved.roomCode); }
            catch (cause) {
              health.error = "A sponsor escrow room could not be reconciled.";
              await store.mutate(saved.roomCode, old => {
                demand(old, "Sponsor room disappeared.");
                old.error = cause instanceof Error ? cause.message : String(cause);
                return { record: old, value: undefined };
              });
            }
          }
        });
        if (!health.error) health.lastSuccessAt = clock().toISOString();
      } catch { health.error = "Sponsor funding storage or chain reconciliation is unavailable."; }
    })().finally(() => { running = null; if (rerun && !closed) void drain(); });
    return running;
  }
  function kick() { if (!closed) { if (onWake) onWake(); else void drain(); } }
  async function view(code: string, userId: string | null) {
    const value = room(code), record = await store.read(code), c = selected(value, record);
    if (record) verifyLocal(record, value);
    const p = plan(value), chainRoom = record?.chain;
    const sponsor = Boolean(userId && userId === sponsorAccount(value));
    const player = userId ? value.players.find(row => !row.isAI && row.accountId === userId) : null;
    const binding = record?.bindings.find(row => row.playerId === player?.playerId);
    const wallet = sponsor ? record?.sponsor.walletAddress : binding?.walletAddress;
    const base = record && wallet ? { record, wallet } : null;
    const actions: any = { sponsorLots: [], refundSponsorLots: [], cashClaims: [], lotClaims: [] };
    if (base && chainRoom && !record?.error) {
      const hash = { room_id: record.roomId, expected_terms_hash: record.termsHash };
      if (sponsor && chainRoom.status === "funding") {
        const xtzRequired = BigInt(p.deposit.xtzAtomic) +
          BigInt(p.entry.currency === "XTZ" ? record.config.houseFeeAtomic : "0");
        if (xtzRequired > 0n && !chainRoom.sponsorXtzFunded)
          actions.sponsorXtz = action(record, wallet!, "fund_sponsor_xtz", hash, xtzRequired.toString());
        if (BigInt(p.deposit.wtfAtomic) > 0n && !chainRoom.sponsorWtfFunded)
          actions.sponsorWtf = action(record, wallet!, "fund_sponsor_wtf", hash, "0",
            { contract: record.config.wtfToken.contract, tokenId: record.config.wtfToken.tokenId,
              owner: wallet!, operator: record.config.escrowContract });
        for (const [index, lot] of p.tokens.entries())
          if (!chainRoom.fundedLots.includes(index))
            actions.sponsorLots.push({ index, action: action(record, wallet!, "fund_sponsor_lot",
              { ...hash, index }, "0", { contract: lot.contract, tokenId: lot.tokenId,
                owner: wallet!, operator: record.config.escrowContract }) });
        actions.cancel = action(record, wallet!, "cancel_room", record.roomId);
      }
      if (binding && chainRoom.status === "funding" &&
        chainRoom.entrants.includes(wallet!) && !chainRoom.paid.includes(wallet!))
        actions.entry = action(record, wallet!, "join_room", hash,
          p.entry.currency === "XTZ" ? p.entry.entryAtomic : "0",
          p.entry.currency === "WTF" ? { contract: record.config.wtfToken.contract,
            tokenId: record.config.wtfToken.tokenId, owner: wallet!,
            operator: record.config.escrowContract } : undefined);
      if ((chainRoom.status === "funding" || chainRoom.status === "voided") && binding &&
        chainRoom.paid.includes(wallet!))
        actions.refundEntry = action(record, wallet!, "refund_entry",
          { room_id: record.roomId, player: wallet! });
      if (sponsor && (chainRoom.status === "funding" || chainRoom.status === "voided")) {
        if (chainRoom.sponsorXtzFunded)
          actions.refundSponsorXtz = action(record, wallet!, "refund_sponsor_xtz", record.roomId);
        if (chainRoom.sponsorWtfFunded)
          actions.refundSponsorWtf = action(record, wallet!, "refund_sponsor_wtf", record.roomId);
        for (const index of chainRoom.fundedLots)
          actions.refundSponsorLots.push({ index, action: action(record, wallet!, "refund_sponsor_lot",
            { room_id: record.roomId, index }) });
      }
      if (chainRoom.status === "settled") {
        for (const currency of ["XTZ", "WTF"] as const) {
          const claim = chainRoom.cashClaims[cashKey(wallet!, currency)];
          if (claim && !claim.claimed && BigInt(claim.amount) > 0n)
            actions.cashClaims.push({ currency, amountAtomic: claim.amount,
              action: action(record, wallet!, "claim_cash", { room_id: record.roomId,
                recipient: wallet!, currency: currency === "XTZ" ? 0 : 1 }) });
        }
        for (const [index, claim] of Object.entries(chainRoom.lotClaims)) {
          const lot = p.tokens[Number(index)];
          if (lot && claim.recipient === wallet && !claim.claimed)
            actions.lotClaims.push({ index: Number(index), contract: lot.contract,
              tokenId: lot.tokenId, amount: lot.amount,
              action: action(record, wallet!, "claim_lot", { room_id: record.roomId,
                index: Number(index) }) });
        }
      }
    }
    return { roomCode: code, roomType: value.config.roomType, terms: record?.plan || p,
      status: record?.status || "unfunded", network: c.network, chainId: c.chainId,
      escrowContract: c.escrowContract, roomId: record?.roomId || null,
      termsHash: record?.termsHash || null,
      wtfToken: record?.config.wtfToken || c.wtfToken,
      houseFeeAtomic: record?.config.houseFeeAtomic || c.houseFeeAtomic,
      config: { enabled: c.enabled,
        reason: c.reason || null, rpcUrl: c.rpcUrl, network: c.network,
        chainId: c.chainId, escrowContract: c.escrowContract },
      sponsorFunded: Boolean(record && chainRoom &&
        (BigInt(p.deposit.xtzAtomic) + BigInt(p.entry.currency === "XTZ" ? record.config.houseFeeAtomic : "0") === 0n ||
          chainRoom.sponsorXtzFunded) &&
        (BigInt(p.deposit.wtfAtomic) === 0n || chainRoom.sponsorWtfFunded) &&
        p.tokens.every((_, index) => chainRoom.verifiedLots.includes(index))),
      lotVerification: { funded: chainRoom?.fundedLots.length || 0,
        verified: chainRoom?.verifiedLots.length || 0, required: p.tokens.length,
        pending: Boolean(chainRoom && p.tokens.some((_, index) =>
          chainRoom.fundedLots.includes(index) && !chainRoom.verifiedLots.includes(index))) },
      depositedCount: chainRoom?.paid.length || 0,
      roster: value.players.filter(row => !row.isAI).map(row => {
        const bound = record?.bindings.find(b => b.playerId === row.playerId);
        return { playerId: row.playerId, name: row.name,
          walletAddress: bound?.walletAddress || null,
          deposited: Boolean(bound && chainRoom?.paid.includes(bound.walletAddress)) };
      }),
      chainStatus: chainRoom?.status || null,
      lastReconciledAt: record?.lastReconciledAt || null,
      operations: record?.intents.map(i => ({ kind: i.kind, status: i.status,
        operationHash: i.operationHash || null })) || [],
      self: { role: sponsor ? "sponsor" : player ? "entrant" : "watcher",
        playerId: player?.playerId || null, walletAddress: wallet || null,
        canBind: Boolean(userId && c.enabled && value.phase === "lobby" &&
          (sponsor || player) && (!record?.lock || Boolean(player))),
        canOpen: Boolean(sponsor && c.enabled && record && !record.lock),
        canStart: Boolean(sponsor && c.enabled && record && fullyFunded(record, value)),
        actions, pendingOperations: record?.observations.filter(o => o.userId === userId) || [] },
      prizeSelectionPending: record?.chain?.status === "active" &&
        p.mode === "pick" && Boolean(game.result(code)),
      error: record?.error || null, health: { ...health, error: record?.error || null } };
  }
  return { bind, open, start, observe, view, drain, kick, health,
    config: (network: Network) => configs[network],
    close: async () => { closed = true; if (running) await running; } };
}
