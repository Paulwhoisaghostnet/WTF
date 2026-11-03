import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { clone, commitment, demand, type FundingGame, type WalletAction } from "./funding";

type Network = "mainnet" | "shadownet";
type Currency = "FREE" | "XTZ" | "WTF";
export type SponsorConfig = {
  enabled: boolean; reason?: string; network: Network; chainId: string; rpcUrl: string; indexerUrl?: string;
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
  "finalize_room" | "void_room" | "claim_cash" | "claim_lot"; key: string; params: any; status: "planned" | "submission-unknown" | "submitted" | "applied";
  operationHash?: string; error?: string; appliedAtBlock?: string; appliedAtLevel?: number };
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
  observations: Array<{ userId: string; action: string; operationHash: string; observedAt: string;
    status?: "pending" | "applied" | "failed";
    proof?: { kind: "finalized-action-state" | "finalized-failed-operation"; blockHash: string; level: number } }>;
  prizePicks?: Array<{ index: number; place: number; playerId: string; walletAddress: string }>;
  finalResult: null | { completion: any; params: any; hash: string };
  technicalVoid: null | { operatorId: string; requestedAt: string; reason: string;
    evidence: any; reasonHash: string; evidenceHash: string };
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
  failedObservations?(record: SponsorRecord, observed: SponsorChainRoom | null,
    pending: SponsorRecord["observations"]): Promise<Array<{
      userId: string; action: string; operationHash: string; blockHash: string; level: number }>>;
};

const isWallet = (value: unknown): value is string =>
  typeof value === "string" && /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
const isOperation = (value: unknown): value is string =>
  typeof value === "string" && /^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(value);
const contractMode = { fixed: 0, random: 1, pick: 2 } as const;
const contractCurrency = { FREE: 0, XTZ: 1, WTF: 2 } as const;
const cashKey = (address: string, currency: "XTZ" | "WTF") => address + ":" + currency;
function observationWallet(record: SponsorRecord, userId: string): string | undefined {
  return userId === record.sponsor.userId ? record.sponsor.walletAddress :
    record.bindings.find(binding => binding.userId === userId)?.walletAddress;
}
function observedWalletActionApplied(actionName: string, wallet: string | undefined,
  chainRoom: SponsorChainRoom | null): boolean {
  if (!wallet || !chainRoom) return false;
  const { status } = chainRoom;
  if (actionName === "sponsorXtz")
    return chainRoom.sponsorXtzFunded || status === "active" || status === "settled";
  if (actionName === "sponsorWtf")
    return chainRoom.sponsorWtfFunded || status === "active" || status === "settled";
  if (actionName === "entry")
    return chainRoom.paid.includes(wallet) || status === "active" || status === "settled";
  if (actionName === "cancel") return status === "voided";
  if (actionName === "refundEntry") return !chainRoom.paid.includes(wallet);
  if (actionName === "refundSponsorXtz") return !chainRoom.sponsorXtzFunded;
  if (actionName === "refundSponsorWtf") return !chainRoom.sponsorWtfFunded;
  const lot = actionName.match(/^(sponsorToken|refundSponsorLot|lotClaim):(\d+)$/);
  if (lot) {
    const index = Number(lot[2]);
    if (!Number.isSafeInteger(index)) return false;
    if (lot[1] === "sponsorToken")
      return chainRoom.verifiedLots.includes(index) || status === "active" || status === "settled";
    if (lot[1] === "refundSponsorLot") return !chainRoom.fundedLots.includes(index);
    return chainRoom.lotClaims[index]?.claimed === true;
  }
  const cash = actionName.match(/^cashClaim:(XTZ|WTF)$/);
  if (cash) return chainRoom.cashClaims[cashKey(wallet, cash[1] as "XTZ" | "WTF")]?.claimed === true;
  // Earlier clients recorded these actions without their currency or lot index.
  // Resolve only after every possible matching effect for this wallet is complete.
  if (actionName === "cashClaim") {
    const claims = (["XTZ", "WTF"] as const)
      .map(currency => chainRoom.cashClaims[cashKey(wallet, currency)])
      .filter((claim): claim is { amount: string; claimed: boolean } =>
        Boolean(claim && BigInt(claim.amount) > 0n));
    return claims.length > 0 && claims.every(claim => claim.claimed);
  }
  if (actionName === "lotClaim") {
    const claims = Object.values(chainRoom.lotClaims).filter(claim => claim.recipient === wallet);
    return claims.length > 0 && claims.every(claim => claim.claimed);
  }
  if (actionName === "refundSponsorLot")
    return wallet === chainRoom.sponsor && chainRoom.lots.length > 0 &&
      (status === "funding" || status === "voided") && chainRoom.fundedLots.length === 0;
  return false;
}
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
    if (record.technicalVoid) demand(!record.finalResult &&
      record.technicalVoid.reasonHash === commitment(record.technicalVoid.reason) &&
      record.technicalVoid.evidenceHash === commitment(record.technicalVoid.evidence),
      "Sponsor technical-void evidence was altered.");
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
  function prizePickState(record: SponsorRecord) {
    demand(record.plan.mode === "pick", "This room uses another prize assignment mode.", 400);
    const result = game.result(record.roomCode);
    demand(result && record.lock && result.matchId === "party:" + record.roomCode,
      "Prize picks open when the match finishes.", 409);
    const resolution = game.sponsorHumanRanks?.(record.roomCode);
    demand(resolution && resolution.matchId === result.matchId &&
      resolution.seedCommitment === record.lock.seedCommitment,
      "A verified human finish order is required for prize picks.");
    const ranked = resolution.rankedPlayerIds;
    demand(ranked.length === record.bindings.length &&
      new Set(ranked).size === ranked.length &&
      ranked.every(id => record.bindings.some(binding => binding.playerId === id)),
      "Prize picks require every funded human in the finish order.");
    const picks = record.prizePicks || [];
    const used = new Set<number>();
    let cursor = 0;
    for (let place = 1; place <= record.plan.places.length; place++) {
      const expected = record.plan.pickCounts?.[place - 1] || 0;
      const binding = record.bindings.find(row => row.playerId === ranked[place - 1]);
      demand(binding, "Prize place has no funded human.");
      for (let count = 0; count < expected && cursor < picks.length; count++) {
        const pick = picks[cursor++];
        demand(Number.isSafeInteger(pick.index) && pick.index >= 0 &&
          pick.index < record.plan.tokens.length && !used.has(pick.index) &&
          pick.place === place && pick.playerId === binding.playerId &&
          pick.walletAddress === binding.walletAddress,
          "Recorded prize picks do not match the verified finish order.");
        used.add(pick.index);
      }
      const alreadyPickedHere = picks.filter(pick => pick.place === place).length;
      if (cursor === picks.length && alreadyPickedHere < expected)
        return { resolution, picks, used, nextPlace: place, nextBinding: binding,
          remainingForPlace: expected - alreadyPickedHere };
    }
    demand(cursor === picks.length && picks.length === record.plan.tokens.length,
      "Recorded prize picks do not allocate every FA2 lot exactly once.");
    return { resolution, picks, used, nextPlace: null, nextBinding: null, remainingForPlace: 0 };
  }
  async function pickLot(code: string, userId: string, index: number) {
    demand(Number.isSafeInteger(index) && index >= 0, "Choose an available FA2 prize.", 400);
    const value = room(code);
    await store.mutate(code, old => {
      demand(old, "Prize escrow has not opened.", 409);
      verifyLocal(old, value);
      demand(old.chain?.status === "active" && value.phase === "finished",
        "Prize picks open after the funded match finishes.", 409);
      const state = prizePickState(old);
      demand(state.nextBinding?.userId === userId,
        "The next prize choice belongs to another finisher.", 403);
      demand(index < old.plan.tokens.length && !state.used.has(index),
        "Choose an available FA2 prize.", 409);
      old.prizePicks ||= [];
      old.prizePicks.push({ index, place: state.nextPlace!,
        playerId: state.nextBinding.playerId, walletAddress: state.nextBinding.walletAddress });
      return { record: old, value: undefined };
    });
    kick();
    return view(code, userId);
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
    demand(!record.technicalVoid, "This room is paused for an audited technical void.");
    demand(record.lock && record.chain?.status === "funding",
      "Prize escrow must open before starting.");
    demand(fullyFunded(record, value), "All prizes and human entries must be verified on-chain.");
    await store.mutate(code, old => {
      demand(old, "Sponsor funding record disappeared.");
      old.startRequested = true; return { record: old, value: undefined };
    });
    kick(); return view(code, userId);
  }
  // Operator-only maintenance. The HTTP router never exposes this method.
  // A stopped authority and a reproducible saved-room failure are required by
  // the maintenance CLI before this durable intent can reach the signer.
  async function requestTechnicalVoid(code: string, operatorId: string) {
    demand(typeof operatorId === "string" && operatorId.trim(),
      "Record the private operator identity.", 400);
    const value = room(code);
    await store.mutate(code, async old => {
      demand(old?.lock && !old.finalResult,
        "A completed sponsor game cannot be technically voided.");
      verifyLocal(old, value);
      if (old.technicalVoid) return { record: old, value: undefined };
      const observed = await chain.read(old);
      demand(observed && ["funding", "active"].includes(observed.status),
        "Only an unsettled sponsor escrow can be technically voided.");
      verifyChain(old, observed);
      demand(configs[old.config.network].rulesHash === old.config.rulesHash,
        "Run the audit with the room's pinned game rules.");
      const audit = game.audit(code);
      demand(audit.ok === false && audit.code === "authoritative-game-failure",
        "The authoritative game audit did not reproduce a technical failure.");
      const reason = "authoritative-game-failure";
      const evidence = { version: "wtfiap-sponsor-technical-void-v1", roomId: old.roomId,
        termsHash: old.termsHash, rulesHash: old.config.rulesHash,
        finalizedBlock: { hash: observed.blockHash, level: observed.level }, audit: audit.evidence };
      old.technicalVoid = { operatorId: operatorId.trim(), requestedAt: clock().toISOString(),
        reason, evidence, reasonHash: commitment(reason), evidenceHash: commitment(evidence) };
      old.status = "voiding";
      planIntent(old, "void_room", "void", { room_id: old.roomId,
        reason_hash: old.technicalVoid.reasonHash,
        evidence_hash: old.technicalVoid.evidenceHash });
      return { record: old, value: undefined };
    });
    kick(); return { roomCode: code, status: "voiding" };
  }
  function fullyFunded(record: SponsorRecord, value: SponsorGameRoom) {
    if (record.technicalVoid) return false;
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
    if (record.technicalVoid) return null;
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
      lotPlaces = [...prizeModule.randomAllocation(record.plan, seed)]
        .sort((a: any, b: any) => a.index - b.index).map((lot: any) => lot.place);
    } else {
      const picks = prizePickState(record);
      if (picks.nextPlace !== null) return null;
      lotPlaces = record.plan.tokens.map((_, index) => {
        const chosen = picks.picks.find(pick => pick.index === index);
        demand(chosen, "An FA2 prize is missing its winner.");
        return chosen.place;
      });
    }
    const params = { room_id: record.roomId, match_id: record.lock.matchId,
      transcript_hash: result.receiptsHash,
      result_hash: commitment({ version: "wtfiap-sponsor-result-v1", roomId: record.roomId,
        matchId: record.lock.matchId, termsHash: record.termsHash,
        transcriptHash: result.receiptsHash, groups: result.groups,
        humanRanking: resolution, humanRanks, lotPlaces,
        ...(record.plan.mode === "pick" ? { prizePicks: record.prizePicks || [] } : {}) }),
      human_ranks: humanRanks, lot_places: lotPlaces };
    return { completion: { ...result, humanRanking: resolution,
      ...(record.plan.mode === "pick" ? { prizePicks: record.prizePicks || [] } : {}) }, params };
  }
  async function reconcileRecord(code: string) {
    let record = await store.read(code);
    if (!record?.lock) return;
    const value = room(code);
    verifyLocal(record, value);
    const chainRoom = await chain.read(record);
    if (chainRoom) verifyChain(record, chainRoom);
    const observedRecord = record;
    const pending = record.observations.filter(observation =>
      observation.status !== "failed" && observation.status !== "applied" &&
      !observedWalletActionApplied(observation.action,
        observationWallet(observedRecord, observation.userId), chainRoom));
    // Failed-operation proof is optional. If its reader is unavailable, keep
    // the wallet checkpoint pending without hiding otherwise verified actions.
    let failures: Awaited<ReturnType<NonNullable<SponsorChain["failedObservations"]>>> = [];
    if (pending.length && chain.failedObservations) {
      try { failures = await chain.failedObservations(record, chainRoom, pending); }
      catch { /* No exact finalized failure proof means no retry. */ }
    }
    const finished = chainRoom?.status === "active" && !record.technicalVoid
      ? resultParams(record, value) : null;
    const prizePicksPending = chainRoom?.status === "active" &&
      record.plan.mode === "pick" && !finished && Boolean(game.result(code));
    await store.mutate(code, old => {
      demand(old, "Sponsor funding record disappeared.");
      old.chain = chainRoom; old.error = null; old.lastReconciledAt = clock().toISOString();
      for (const observation of old.observations) {
        if (observation.status === "failed") continue;
        const applied = observedWalletActionApplied(observation.action,
          observationWallet(old, observation.userId), chainRoom);
        const failure = failures.find(item => item.userId === observation.userId &&
          item.action === observation.action && item.operationHash === observation.operationHash);
        if (applied && chainRoom) {
          observation.status = "applied";
          observation.proof = { kind: "finalized-action-state",
            blockHash: chainRoom.blockHash, level: chainRoom.level };
        } else if (failure) {
          observation.status = "failed";
          observation.proof = { kind: "finalized-failed-operation",
            blockHash: failure.blockHash, level: failure.level };
        }
      }
      for (const item of old.intents) {
        const applied = item.kind === "create_room" && Boolean(chainRoom) ||
          item.kind === "register_entrant" && chainRoom?.entrants.includes(item.params.player) ||
          item.kind === "start_room" && ["active", "settled"].includes(chainRoom?.status || "") ||
          item.kind === "finalize_room" && chainRoom?.status === "settled" &&
            chainRoom.resultHash === item.params.result_hash ||
          item.kind === "void_room" && chainRoom?.status === "voided" &&
            chainRoom.voidReasonHash === item.params.reason_hash &&
            chainRoom.voidEvidenceHash === item.params.evidence_hash ||
          item.kind === "claim_cash" && chainRoom?.status === "settled" &&
            chainRoom.cashClaims[cashKey(item.params.recipient,
              item.params.currency === 0 ? "XTZ" : "WTF")]?.claimed === true ||
          item.kind === "claim_lot" && chainRoom?.status === "settled" &&
            chainRoom.lotClaims[item.params.index]?.claimed === true;
        if (applied) {
          item.status = "applied";
          if (item.kind === "void_room" && chainRoom) {
            item.appliedAtBlock = chainRoom.blockHash;
            item.appliedAtLevel = chainRoom.level;
          }
        }
      }
      if (!chainRoom) old.status = "opening";
      else if (chainRoom.status === "voided") {
        if (old.technicalVoid) demand(
          chainRoom.voidReasonHash === old.technicalVoid.reasonHash &&
          chainRoom.voidEvidenceHash === old.technicalVoid.evidenceHash,
          "Voided sponsor escrow differs from the audited failure.");
        old.status = "voided";
      }
      else if (chainRoom.status === "settled") {
        demand(!old.technicalVoid, "An audited sponsor void cannot settle prizes.");
        demand(old.finalResult && chainRoom.resultHash === old.finalResult.params.result_hash &&
          chainRoom.transcriptHash === old.finalResult.params.transcript_hash,
          "The settled on-chain result differs from authoritative combat.");
        old.status = "settled";
        // Claims are permissionless, but the contract pays only its recorded
        // recipient. Check the finalized room before requesting each payout.
        const recipients = new Set([old.sponsor.walletAddress, old.config.treasury,
          old.plan.entry.designatedWallet || old.config.treasury,
          ...old.bindings.map(binding => binding.walletAddress)]);
        for (const [key, claim] of Object.entries(chainRoom.cashClaims)) {
          if (claim.claimed || BigInt(claim.amount) === 0n) continue;
          const separator = key.lastIndexOf(":");
          const recipient = key.slice(0, separator);
          const currency = key.slice(separator + 1);
          demand(recipients.has(recipient) && (currency === "XTZ" || currency === "WTF"),
            "Sponsor cash claim has an unexpected recipient or currency.");
          planIntent(old, "claim_cash", "claim-cash:" + key,
            { room_id: old.roomId, recipient, currency: currency === "XTZ" ? 0 : 1 });
        }
        for (const [textIndex, claim] of Object.entries(chainRoom.lotClaims)) {
          if (claim.claimed) continue;
          const index = Number(textIndex);
          demand(Number.isSafeInteger(index) && index >= 0 && index < old.plan.tokens.length &&
            recipients.has(claim.recipient), "Sponsor token claim has an unexpected recipient or lot.");
          planIntent(old, "claim_lot", "claim-lot:" + index,
            { room_id: old.roomId, index });
        }
      } else if (old.technicalVoid) old.status = "voiding";
      else if (chainRoom.status === "active") {
        old.status = finished ? "settling" : prizePicksPending ? "awaiting-prize-picks" : "active";
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
    const next = record.intents.find(i => i.status === "planned" &&
      (!record.technicalVoid || i.kind === "void_room"));
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
    const selection = p.mode === "pick" && record && value.phase === "finished" &&
      (chainRoom?.status === "active" || chainRoom?.status === "settled")
      ? prizePickState(record) : null;
    if (base && chainRoom && !record?.error) {
      const hash = { room_id: record.roomId, expected_terms_hash: record.termsHash };
      if (sponsor && chainRoom.status === "funding" && !record.technicalVoid) {
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
      if (binding && chainRoom.status === "funding" && !record.technicalVoid &&
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
        canPick: Boolean(selection?.nextBinding?.userId === userId &&
          chainRoom?.status === "active"),
        canBind: Boolean(userId && c.enabled && !record?.technicalVoid && value.phase === "lobby" &&
          (sponsor || player) && (!record?.lock || Boolean(player))),
        canOpen: Boolean(sponsor && c.enabled && record && !record.lock && !record.technicalVoid),
        canStart: Boolean(sponsor && c.enabled && record && fullyFunded(record, value)),
        actions, pendingOperations: record?.observations.filter(o => o.userId === userId).map(o => ({
          ...o, status: o.status === "failed" ? "failed" :
            o.status === "applied" || observedWalletActionApplied(o.action,
              observationWallet(record, o.userId), chainRoom || null) ? "applied" : "pending",
        })) || [] },
      prizeSelectionPending: Boolean(selection?.nextPlace),
      prizeSelection: selection ? {
        nextPlace: selection.nextPlace,
        nextPlayerId: selection.nextBinding?.playerId || null,
        nextPlayerName: value.players.find(row =>
          row.playerId === selection.nextBinding?.playerId)?.name || null,
        remainingForPlace: selection.remainingForPlace,
        chosen: selection.picks.map(pick => ({ index: pick.index, place: pick.place,
          playerId: pick.playerId })),
        availableLots: p.tokens.map((lot, index) => ({ index,
          contract: lot.contract, tokenId: lot.tokenId, amount: lot.amount }))
          .filter(lot => !selection.used.has(lot.index)),
      } : null,
      error: record?.error || null, health: { ...health, error: record?.error || null } };
  }
  return { bind, open, start, requestTechnicalVoid, pickLot, observe, view, drain, kick, health,
    config: (network: Network) => configs[network],
    close: async () => { closed = true; if (running) await running; } };
}
