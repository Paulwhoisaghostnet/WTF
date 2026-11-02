import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { TezosToolkit } from "@taquito/taquito";
import { WTF_TOKEN } from "@shared/types";
import { hashTypedScript } from "../../../contracts/wtfiap-escrow/script-identity";
import { callSigner } from "../operator-signer/client";
import { demand } from "./funding";
import { NETWORKS } from "./funding-contract";
import type { SponsorChain, SponsorChainRoom, SponsorConfig, SponsorRecord } from "./sponsor-funding";
import { verifySponsorLotCustody } from "./sponsor-fa2-custody";

type Network = "mainnet" | "shadownet";
const artifactPath = path.resolve("contracts/wtfiap-sponsor-escrow/artifacts/contract.json");
const address = (s: string) => /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(s);
const contractAddress = (s: string) => /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(s);
const nat = (v: any) => String(v?.toFixed ? v.toFixed() : v);
const option = (v: any): string | null => v == null || v.None !== undefined ? null : String(v.Some ?? v);
const iterable = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [...value];

export function sponsorArtifactScriptHash(): string {
  try { return hashTypedScript(JSON.parse(readFileSync(artifactPath, "utf8"))); }
  catch { return ""; }
}

/** New sponsor lanes never inherit a process-wide RPC or legacy escrow KT1. */
export function sponsorFundingConfig(network: Network, env: NodeJS.ProcessEnv = process.env): SponsorConfig {
  const prefix = network === "mainnet" ? "WTFIAP_SPONSOR_MAINNET_" : "WTFIAP_SPONSOR_SHADOWNET_";
  const get = (name: string) => (env[prefix + name] || "").trim();
  const token = { contract: get("WTF_TOKEN_CONTRACT") ||
    (network === "mainnet" ? WTF_TOKEN.contract : ""), tokenId: get("WTF_TOKEN_ID") || "0" };
  let rulesHash = "";
  try { rulesHash = createRequire(path.resolve("package.json"))(
    path.resolve("server/features/wtfiap/rules.cjs")).getRuntimeRulesHash(); }
  catch { /* Sponsor funding remains disabled until the packaged rules exist. */ }
  const artifactHash = sponsorArtifactScriptHash();
  const config: SponsorConfig = {
    enabled: false, network, chainId: NETWORKS[network].chainId,
    rpcUrl: get("RPC_URL") || NETWORKS[network].rpc,
    escrowContract: get("ESCROW_CONTRACT"), scriptHash: get("ESCROW_SCRIPT_HASH"),
    roomCreator: get("ROOM_CREATOR_ADDRESS"), referee: get("REFEREE_ADDRESS"),
    walletId: get("REFEREE_WALLET_ID"), treasury: get("TREASURY_ADDRESS"),
    wtfToken: token, houseFeeAtomic: network === "mainnet" ? "500000" : "0",
    rulesHash,
  };
  const configured = get("ENABLED") === "1" && contractAddress(config.escrowContract) &&
    /^[a-f0-9]{64}$/.test(config.scriptHash) && config.scriptHash === artifactHash &&
    /^[a-f0-9]{64}$/.test(config.rulesHash) && address(config.roomCreator) &&
    address(config.referee) && config.roomCreator === config.referee &&
    address(config.treasury) && Boolean(config.walletId) &&
    contractAddress(token.contract) && /^(0|[1-9][0-9]*)$/.test(token.tokenId) &&
    (network === "mainnet" || token.contract !== WTF_TOKEN.contract);
  config.enabled = configured;
  if (!configured) config.reason = "Sponsor escrow is unavailable until its contract, signer, token, network, and compiled script are verified.";
  return config;
}

export const sponsorRpcEndpoints = (config: SponsorConfig) =>
  config.rpcUrl.replace(/\/$/, "") === NETWORKS[config.network].rpc.replace(/\/$/, "")
    ? [config.rpcUrl, NETWORKS[config.network].fallback] : [config.rpcUrl];

export function tezosSponsorChain(toolkit = (rpc: string): any => new TezosToolkit(rpc)): SponsorChain {
  return {
    async read(record: SponsorRecord) {
      const config = record.config;
      let lastError: unknown;
      for (const rpc of sponsorRpcEndpoints(config)) {
        try {
          const tezos = toolkit(rpc);
          demand(await tezos.rpc.getChainId() === config.chainId,
            "Sponsor escrow RPC is on a different chain.");
          const blockHash = await tezos.rpc.getBlockHash({ block: "head~2" });
          const [header, script] = await Promise.all([
            tezos.rpc.getBlockHeader({ block: blockHash }),
            tezos.rpc.getScript(config.escrowContract, { block: blockHash }),
          ]);
          demand(hashTypedScript(script.code) === config.scriptHash &&
            config.scriptHash === sponsorArtifactScriptHash(),
          "Sponsor escrow script differs from the approved compiled artifact.");
          const storage: any = await tezos.contract.getStorage(config.escrowContract, script, blockHash);
          demand(String(storage.room_creator) === config.roomCreator &&
            String(storage.wtf_token_address) === config.wtfToken.contract &&
            nat(storage.wtf_token_id) === config.wtfToken.tokenId &&
            String(storage.treasury_address) === config.treasury &&
            nat(storage.xtz_paid_room_house_fee) === config.houseFeeAtomic &&
            nat(storage.xtz_quantum) === "10000" && nat(storage.wtf_quantum) === "1000000",
          "Sponsor escrow storage differs from its approved owner, token, fee, or precision.");
          const room: any = await storage.rooms.get(record.roomId, blockHash);
          if (!room) return null;
          const status = ["funding", "active", "settled", "voided"][Number(nat(room.status))] as SponsorChainRoom["status"];
          demand(status, "Unknown sponsor escrow lifecycle state.");
          const cashClaims: SponsorChainRoom["cashClaims"] = {};
          if (status === "settled") {
            const wallets = [...new Set([
              record.sponsor.walletAddress, config.treasury,
              record.plan.entry.designatedWallet || config.treasury,
              ...record.bindings.map(b => b.walletAddress),
            ])];
            for (const wallet of wallets) for (const [currency, index] of [["XTZ", 0], ["WTF", 1]] as const) {
              // Taquito flattens nested pair keys into one positional array.
              const claim: any = await storage.cash_claims.get(
                [record.roomId, wallet, index], blockHash);
              if (claim) cashClaims[wallet + ":" + currency] = {
                amount: nat(claim.amount), claimed: claim.claimed === true };
            }
          }
          const lotClaims: SponsorChainRoom["lotClaims"] = {};
          if (status === "settled") for (const index of record.plan.tokens.keys()) {
            const claim: any = await storage.lot_claims.get(
              [record.roomId, index], blockHash);
            if (claim) lotClaims[index] = { recipient: String(claim.recipient),
              claimed: claim.claimed === true };
          }
          const fundedLots = iterable(room.funded_lots).map(n => Number(nat(n)));
          const lotChecks = await Promise.allSettled(fundedLots.map(index =>
            verifySponsorLotCustody(record, index, fundedLots, Number(header.level))));
          const lotEvidence: SponsorChainRoom["lotEvidence"] = {};
          fundedLots.forEach((index, position) => {
            const result = lotChecks[position];
            if (result.status === "fulfilled" && result.value) lotEvidence[index] = result.value;
          });
          return { blockHash, level: Number(header.level), status,
            termsHash: String(room.terms_hash), rulesHash: String(room.rules_hash),
            seedCommitment: String(room.seed_commitment), sponsor: String(room.sponsor),
            referee: String(room.referee), entryCurrency: Number(nat(room.entry_currency)),
            entryAtomic: nat(room.entry_amount), minimumHumans: Number(nat(room.minimum_humans)),
            mode: Number(nat(room.mode)), poolNumerator: nat(room.pool_numerator),
            poolDenominator: nat(room.pool_denominator), designatedWallet: String(room.designated_wallet),
            places: iterable(room.places).map(p => ({ xtz: nat(p.xtz), wtf: nat(p.wtf),
              poolWeight: nat(p.pool_weight) })),
            lots: iterable(room.lots).map(lot => ({ tokenAddress: String(lot.token_address),
              tokenId: nat(lot.token_id), amount: nat(lot.amount),
              fixedPlace: Number(nat(lot.fixed_place)) })),
            pickCounts: iterable(room.pick_counts).map(n => Number(nat(n))),
            entrants: iterable(room.entrants).map(String),
            paid: iterable(room.paid).map(String),
            sponsorXtzFunded: room.sponsor_xtz_funded === true,
            sponsorWtfFunded: room.sponsor_wtf_funded === true,
            fundedLots, verifiedLots: Object.keys(lotEvidence).map(Number), lotEvidence,
            prizeXtz: nat(room.prize_xtz), prizeWtf: nat(room.prize_wtf),
            houseFee: nat(room.house_fee), heldXtz: nat(room.held_xtz),
            heldWtf: nat(room.held_wtf), matchId: option(room.match_id),
            resultHash: option(room.result_hash), transcriptHash: option(room.transcript_hash),
            voidReasonHash: option(room.void_reason_hash),
            voidEvidenceHash: option(room.void_evidence_hash), cashClaims, lotClaims };
        } catch (error) { lastError = error; }
      }
      throw lastError;
    },
    async submit(record, intent) {
      const result = await callSigner({ intent: "wtfiap_sponsor_escrow", requestId: intent.id,
        walletId: record.config.walletId, counterpartyContract: record.config.escrowContract,
        chainId: record.config.chainId as "NetXdQprcVkpaWU" | "NetXsqzbfFenSTS",
        entrypoint: intent.kind, params: intent.params, runId: record.roomId });
      demand(result.opHash, "Sponsor signer did not return a submission checkpoint.");
      return { operationHash: result.opHash };
    },
  };
}
