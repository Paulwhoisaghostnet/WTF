import { createRequire } from "node:module";
import path from "node:path";
import { TezosToolkit } from "@taquito/taquito";
import { ParameterSchema } from "@taquito/michelson-encoder";
import { WTF_TOKEN } from "@shared/types";
import { hashTypedScript } from "../../../contracts/wtfiap-escrow/script-identity";
import { callSigner } from "../operator-signer/client";
import { commitment, demand, observationApplied, type FundingChain, type FundingConfig, type FundingRecord, type ChainRoom } from "./funding";

export const NETWORKS = {
  mainnet: { chainId: "NetXdQprcVkpaWU", rpc: "https://tezos-mainnet.octez.io/", fallback: "https://tcinfra.net/rpc/tezos/mainnet" },
  shadownet: { chainId: "NetXsqzbfFenSTS", rpc: "https://tezos-shadownet.octez.io/", fallback: "https://tcinfra.net/rpc/tezos/shadownet" },
} as const;
export function fundingConfig(env: NodeJS.ProcessEnv = process.env): FundingConfig {
  const named = env.WTFIAP_ESCROW_NETWORK || env.TEZOS_NETWORK;
  const network = named === "shadownet" ? "shadownet" : "mainnet";
  const token = { contract: (env.WTFIAP_WTF_TOKEN_CONTRACT || (network === "mainnet" ? WTF_TOKEN.contract : "")).trim(),
    tokenId: (env.WTFIAP_WTF_TOKEN_ID || "0").trim() };
  let rulesHash = "";
  try { rulesHash = createRequire(path.resolve("package.json"))(path.resolve("server/features/wtfiap/rules.cjs")).getRuntimeRulesHash(); } catch { /* disabled until packaged */ }
  const config: FundingConfig = {
    enabled: false, network, chainId: NETWORKS[network].chainId,
    rpcUrl: env.WTFIAP_ESCROW_RPC_URL || (env.TEZOS_NETWORK === network ? env.TEZOS_RPC_URL : undefined) || NETWORKS[network].rpc,
    escrowContract: env.WTFIAP_ESCROW_CONTRACT || "", scriptHash: env.WTFIAP_ESCROW_SCRIPT_HASH || "",
    refereeAddress: env.WTFIAP_REFEREE_ADDRESS || "", creatorAddress: env.WTFIAP_ROOM_CREATOR_ADDRESS || "",
    walletId: env.WTFIAP_REFEREE_WALLET_ID || "",
    wtfToken: { contract: token.contract, tokenId: String(token.tokenId), decimals: 8 }, rulesHash,
    // Owner-approved room-currency precision and refund policy, also pinned
    // in the immutable deployed script and every room terms commitment.
    feeQuantumAtomic: "10000", currencyQuantaAtomic: { XTZ: "10000", WTF: "1000000" },
    refundPolicy: "prestart-withdrawal;technical-void-full-refund-v1",
    prizeRoundingPolicy: "floor-each-prize-to-quantum;remainder-to-wtf.tez-v1",
    treasuryAddress: env.WTFIAP_TREASURY_ADDRESS || "",
    minimalBlockDelaySeconds: Number(env.WTFIAP_CHAIN_MIN_BLOCK_DELAY_SECONDS) || null,
    indexerUrl: (env.TEZOS_NETWORK === network ? env.TZKT_API_URL : undefined) || (network === "mainnet" ? "https://api.tzkt.io/v1" : "https://api.shadownet.tzkt.io/v1"),
  };
  const validAddress = (s: string) => /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(s);
  const configured = ["mainnet", "shadownet"].includes(named || "") && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.escrowContract) &&
    /^[a-f0-9]{64}$/.test(config.scriptHash) && /^[a-f0-9]{64}$/.test(rulesHash) && validAddress(config.refereeAddress) &&
    validAddress(config.creatorAddress) && /^(?:tz[1-4]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.treasuryAddress) && config.refereeAddress === config.creatorAddress && Boolean(config.walletId) &&
    /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(token.contract) && /^(0|[1-9][0-9]*)$/.test(token.tokenId) &&
    (network === "mainnet" || token.contract !== WTF_TOKEN.contract) &&
    Number.isSafeInteger(config.minimalBlockDelaySeconds) && Number(config.minimalBlockDelaySeconds) > 0;
  config.enabled = env.WTFIAP_FUNDED_ENABLED === "1" && configured && Boolean(config.refundPolicy && config.feeQuantumAtomic);
  if (!config.enabled) config.reason = "New tournament funding is unavailable until its network, escrow deployment, referee, treasury and currency configuration are verified.";
  return config;
}
export function shadownetXtzFundingConfig(env: NodeJS.ProcessEnv = process.env): FundingConfig {
  const legacy = fundingConfig(env);
  return legacy.network === "shadownet" ? legacy : fundingConfig({ WTFIAP_ESCROW_NETWORK: "shadownet" });
}
// Mainnet admission has its own explicit settings. Never inherit the active
// Shadownet deployment or the process-wide Tezos RPC into this lane.
export function mainnetWtfFundingConfig(env: NodeJS.ProcessEnv = process.env): FundingConfig {
  const config = fundingConfig({
    WTFIAP_ESCROW_NETWORK: "mainnet",
    WTFIAP_FUNDED_ENABLED: env.WTFIAP_MAINNET_FUNDED_ENABLED,
    WTFIAP_ESCROW_RPC_URL: env.WTFIAP_MAINNET_ESCROW_RPC_URL,
    WTFIAP_ESCROW_CONTRACT: env.WTFIAP_MAINNET_ESCROW_CONTRACT,
    WTFIAP_ESCROW_SCRIPT_HASH: env.WTFIAP_MAINNET_ESCROW_SCRIPT_HASH,
    WTFIAP_REFEREE_ADDRESS: env.WTFIAP_MAINNET_REFEREE_ADDRESS,
    WTFIAP_ROOM_CREATOR_ADDRESS: env.WTFIAP_MAINNET_ROOM_CREATOR_ADDRESS,
    WTFIAP_REFEREE_WALLET_ID: env.WTFIAP_MAINNET_REFEREE_WALLET_ID,
    WTFIAP_WTF_TOKEN_CONTRACT: env.WTFIAP_MAINNET_WTF_TOKEN_CONTRACT,
    WTFIAP_WTF_TOKEN_ID: env.WTFIAP_MAINNET_WTF_TOKEN_ID,
    WTFIAP_TREASURY_ADDRESS: env.WTFIAP_MAINNET_TREASURY_ADDRESS,
    WTFIAP_CHAIN_MIN_BLOCK_DELAY_SECONDS: env.WTFIAP_MAINNET_CHAIN_MIN_BLOCK_DELAY_SECONDS,
  });
  config.feeQuantumAtomic = config.currencyQuantaAtomic.WTF;
  return config;
}
export const rpcEndpoints = (config: FundingConfig) => config.rpcUrl.replace(/\/$/, "") === NETWORKS[config.network].rpc.replace(/\/$/, "")
  ? [config.rpcUrl, NETWORKS[config.network].fallback] : [config.rpcUrl];
const nat = (v: any) => String(v?.toFixed ? v.toFixed() : v);
const option = (v: any): string | null => v == null || v.None !== undefined ? null : String(v.Some ?? v);

export function tezosFundingChain(toolkit = (rpc: string): any => new TezosToolkit(rpc)): FundingChain {
  return {
    async read(record) {
      const config = record.config; let lastError: unknown;
      for (const rpc of rpcEndpoints(config)) { try {
      const tezos = toolkit(rpc);
      demand(await tezos.rpc.getChainId() === config.chainId, "Escrow RPC is on a different chain.");
      // Tenderbake finality: two additional blocks finalize a block. Resolve
      // once and pin script, storage and every big-map read to that hash.
      // https://octez.tezos.com/docs/alpha/consensus.html
      const blockHash = await tezos.rpc.getBlockHash({ block: "head~2" });
      const [header, script] = await Promise.all([
        tezos.rpc.getBlockHeader({ block: blockHash }), tezos.rpc.getScript(config.escrowContract, { block: blockHash }),
      ]);
      demand(hashTypedScript(script.code) === config.scriptHash, "Escrow script fingerprint differs from the approved deployment.");
      const storage: any = await tezos.contract.getStorage(config.escrowContract, script, blockHash);
      demand(String(storage.room_creator) === config.creatorAddress && String(storage.wtf_token_address) === config.wtfToken.contract &&
        nat(storage.wtf_token_id) === config.wtfToken.tokenId && String(storage.treasury_address) === config.treasuryAddress &&
        nat(storage.xtz_quantum) === config.currencyQuantaAtomic.XTZ && nat(storage.wtf_quantum) === config.currencyQuantaAtomic.WTF,
        "Escrow creator, token, treasury or precision differs from configuration.");
      const room: any = await storage.rooms.get(record.roomId, blockHash);
      if (!room) return null;
      const status = ["funding", "active", "settled", "voided"][Number(nat(room.status))] as ChainRoom["status"];
      demand(status, "Unknown escrow lifecycle state.");
      const claims: ChainRoom["claims"] = {};
      for (const player of record.bindings.map(b => b.walletAddress)) {
        const claim: any = await storage.claims.get({ 0: record.roomId, 1: player }, blockHash);
        if (claim) claims[player] = { amount: nat(claim.amount), claimed: claim.claimed === true };
      }
      return { blockHash, level: header.level, termsHash: String(room.terms_hash), rulesHash: String(room.rules_hash),
        seedCommitment: String(room.seed_commitment), referee: String(room.referee), currency: nat(room.currency), entryAtomic: nat(room.entry_amount),
        entrants: [...room.entrants].map(String), paid: [...room.paid].map(String), held: nat(room.held), paidOut: nat(room.paid_out), status,
        deposited: nat(room.deposited), refunded: nat(room.refunded), quantum: nat(room.quantum),
        treasuryAmount: nat(room.treasury_amount), treasuryClaimed: room.treasury_claimed === true,
        voidReasonHash: option(room.void_reason_hash), voidEvidenceHash: option(room.void_evidence_hash),
        matchId: option(room.match_id), resultHash: option(room.result_hash), transcriptHash: option(room.transcript_hash), claims };
      } catch (error) { lastError = error; } }
      throw lastError;
    },
    async submit(record, intent) {
      const result = await callSigner({ intent: "wtfiap_escrow", requestId: intent.id, walletId: record.config.walletId,
        counterpartyContract: record.config.escrowContract, chainId: record.config.chainId as "NetXdQprcVkpaWU" | "NetXsqzbfFenSTS",
        entrypoint: intent.kind, params: intent.params, runId: record.roomId });
      demand(result.opHash, "Signer did not provide a submission checkpoint.");
      return { operationHash: result.opHash };
    },
    async failedObservations(record, observed) {
      const pending = record.observations.filter(o => o.status === "pending" && !observationApplied(record, observed, o));
      if (!pending.length) return [];
      const config = record.config;
      let lastError: unknown;
      // Carry the successful storage read's final block through every fallback.
      // An indexer result can only locate a candidate on that exact branch.
      let finalizedHash = observed?.blockHash;
      for (const rpc of rpcEndpoints(config)) { try {
      const failures: Awaited<ReturnType<NonNullable<FundingChain["failedObservations"]>>> = [];
      const tezos = toolkit(rpc);
      demand(await tezos.rpc.getChainId() === config.chainId, "Operation verification chain mismatch.");
      finalizedHash ||= await tezos.rpc.getBlockHash({ block: "head~2" });
      const finalizedLevel = observed?.level ?? (await tezos.rpc.getBlockHeader({ block: finalizedHash })).level;
      const entrypoints = await tezos.rpc.getEntrypoints(config.escrowContract, { block: finalizedHash });
      const base = config.indexerUrl || (config.network === "mainnet" ? "https://api.tzkt.io/v1" : "https://api.shadownet.tzkt.io/v1");
      for (const observation of pending) {
        const binding = record.bindings.find(b => b.playerId === observation.playerId); demand(binding, "Observation has no funded seat.");
        const entrypoint = observation.action === "deposit" ? "join_room" : observation.action === "claim" ? "claim" : observation.action === "refund" ? "refund" : null;
        if (!entrypoint || !entrypoints.entrypoints[entrypoint]) continue;
        const params = observation.action === "deposit" ? { room_id: record.roomId, expected_terms_hash: record.termsHash } : record.roomId;
        const amount = observation.action === "deposit" && record.terms.currency === "XTZ" ? record.terms.entryAtomic : "0";
        const encoded = new ParameterSchema(entrypoints.entrypoints[entrypoint]).EncodeObject(params);
        // TzKT locates a possible inclusion only. It cannot establish failure:
        // the finalized RPC branch and exact manager contents decide that.
        let located: any;
        try { const response = await fetch(base.replace(/\/$/, "") + "/operations/transactions/" + observation.operationHash); if (!response.ok) continue; located = await response.json(); }
        catch { continue; }
        if (!Array.isArray(located)) continue;
        const candidate = located.find((tx: any) => tx.sender?.address === binding.walletAddress && tx.target?.address === config.escrowContract &&
          tx.parameter?.entrypoint === entrypoint && Number.isSafeInteger(tx.level) && tx.level > 0 && tx.level <= finalizedLevel);
        if (!candidate) continue;
        const includedHash = await tezos.rpc.getBlockHash({ block: finalizedHash + "~" + (finalizedLevel - candidate.level) });
        if (candidate.block !== includedHash) continue;
        const block = await tezos.rpc.getBlock({ block: includedHash });
        const operation = block.operations.flat().find((op: any) => op.hash === observation.operationHash);
        if (!operation) continue;
        const exact = operation.contents.filter((content: any) => content.kind === "transaction" && content.source === binding.walletAddress &&
          content.destination === config.escrowContract && String(content.amount) === amount && content.parameters?.entrypoint === entrypoint &&
          commitment(content.parameters.value) === commitment(encoded));
        if (exact.length > 0 && exact.every((content: any) => ["failed", "backtracked", "skipped"].includes(content.metadata?.operation_result?.status)))
          failures.push({ playerId: observation.playerId, action: observation.action, operationHash: observation.operationHash, blockHash: includedHash, level: candidate.level });
      }
      return failures;
      } catch (error) { lastError = error; } }
      throw lastError;
    },
  };
}

export function fundingMonitorConfigs(current: FundingConfig | FundingConfig[], records: FundingRecord[]): FundingConfig[] {
  const configurations = [...(Array.isArray(current) ? current : [current]).filter(c => c.enabled), ...records.filter(r => r.lock).map(r => r.config)];
  return [...new Map(configurations.map(c => [commitment({ chainId: c.chainId, rpcUrl: c.rpcUrl }), c])).values()];
}

// Native head events wake reconciliation; no new polling cadence. After a
// stream disconnect, reconnection waits the chain's own minimal block delay.
export function monitorFundingHeads(config: FundingConfig, onHead: () => void, health: { headStreamConnected: boolean; error: string | null }) {
  const controller = new AbortController();
  const done = (async () => {
    // The caller chooses configured current or saved-room networks; saved
    // claims remain monitored even when new room admission is disabled.
    // The deployment preflight records this chain constant, so an initial RPC
    // outage can recover without inventing a polling/retry default.
    let reconnectMs = Number(config.minimalBlockDelaySeconds) * 1000;
    demand(Number.isSafeInteger(reconnectMs) && reconnectMs > 0, "Verified chain block delay is required for head-stream recovery.");
    while (!controller.signal.aborted) {
      for (const rpc of rpcEndpoints(config)) {
        if (controller.signal.aborted) break;
        try {
          const base = rpc.replace(/\/$/, "");
          const json = async (suffix: string) => {
            const response = await fetch(base + suffix, { signal: controller.signal });
            demand(response.ok, "Funding chain probe unavailable."); return response.json();
          };
          demand(await json("/chains/main/chain_id") === config.chainId, "Funding head stream chain mismatch.");
          const constants: any = await json("/chains/main/blocks/head/context/constants");
          const observedDelay = Number(constants.minimal_block_delay) * 1000;
          demand(Number.isSafeInteger(observedDelay) && observedDelay > 0, "Chain block delay is unavailable.");
          reconnectMs = observedDelay;
          const response = await fetch(base + "/monitor/heads/main", { signal: controller.signal });
          demand(response.ok && response.body, "Funding head stream unavailable.");
          health.headStreamConnected = true;
          let buffer = "";
          for await (const bytes of response.body as any) {
            buffer += Buffer.from(bytes).toString("utf8");
            let newline: number;
            while ((newline = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
              if (line.trim()) { JSON.parse(line); onHead(); }
            }
          }
        } catch { if (!controller.signal.aborted) health.error = "Funding chain-head monitoring is disconnected; reconciliation will resume when the chain is available."; }
        finally { health.headStreamConnected = false; }
      }
      if (controller.signal.aborted) break;
      await new Promise<void>(resolve => {
        const finish = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolve(); };
        const timer = setTimeout(finish, reconnectMs); controller.signal.addEventListener("abort", finish, { once: true });
      });
    }
  })();
  return { close: async () => { controller.abort(); await done; } };
}
