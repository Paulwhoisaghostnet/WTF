import { randomBytes } from "node:crypto";
import { packDataBytes } from "@taquito/michel-codec";
import { InMemorySigner } from "@taquito/signer";
import { b58DecodeAddress, b58DecodeAndCheckPrefix, PrefixV2 } from "@taquito/utils";
import { horfMainnetIndex } from "../mainnet-index";
import { assertCurrentOwner, HorfTokenNotOwnedError } from "../inspections";
import { horseContractAddress, getHorfHorseConfig, HORF_HORSE_ORIGINATOR } from "../horse-config";
import { HorseTokenIneligibleError, HorseTokenNotFoundError, inspectHorseTokenCached } from "../stables/eligibility";
import { assertHorfCustodyTrusted, HorfCustodyUntrustedError } from "../stables/custody";
import { requireHorfOracleSecret, HORF_MAINNET_CHAIN_ID } from "../stables/config";
import { assertHorfStablesMainnet, type ChainReader } from "../stables/chain";
import { isTezosWallet } from "../model";

const CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
/** Confirmed Mainnet origination opYPCJ88MJrq5npwVYqwwGh4ff4Yo3pvpYEL3qUARrCZGicabwN. */
export const HORF_HORSE_MARKET_MAINNET_CONTRACT = "KT1ADh24ePBiqNJB1FuN1KgJREFUzNuxd6Uf";
export const HORF_HORSE_MARKET_CODE_HASH = -2032818447;
type MichelsonNode = { prim?: string; args?: MichelsonNode[]; bytes?: string; int?: string };
type Key = { id?: number; key?: unknown; value?: unknown; active?: boolean };

function nat(value: unknown, label: string): string {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value)
    : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) throw new Error(`Invalid ${label}`);
  return BigInt(text).toString();
}

function pair(nodes: MichelsonNode[]): MichelsonNode {
  if (nodes.length < 2) throw new Error("Market permit pair is incomplete");
  return { prim: "Pair", args: [nodes[0]!, nodes.length === 2 ? nodes[1]! : pair(nodes.slice(1))] };
}

export function packHorseMarketPermit(input: {
  chainId: string; marketAddress: string; seller: string; tokenContract: string;
  tokenId: string; quantity: string; unitPriceHorseRaw: string; nonce: string; oracleEpoch: string;
}): string {
  const nonce = input.nonce.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(nonce)) throw new Error("Market permit nonce must be 32 bytes");
  const chainIdBytes = Buffer.from(b58DecodeAndCheckPrefix(input.chainId, [PrefixV2.ChainID])[0]).toString("hex");
  const values: MichelsonNode[] = [
    { bytes: chainIdBytes }, { bytes: b58DecodeAddress(input.marketAddress) },
    { bytes: b58DecodeAddress(input.seller) }, { bytes: b58DecodeAddress(input.tokenContract) },
    { int: nat(input.tokenId, "token ID") }, { int: nat(input.quantity, "quantity") },
    { int: nat(input.unitPriceHorseRaw, "HORSE price") }, { bytes: nonce },
    { int: nat(input.oracleEpoch, "oracle epoch") },
  ];
  const types = ["chain_id", "address", "address", "address", "nat", "nat", "nat", "bytes", "nat"];
  return packDataBytes(pair(values) as never, pair(types.map((prim) => ({ prim }))) as never).bytes;
}

export function horseMarketAddress(env: NodeJS.ProcessEnv = process.env): string | null {
  // Horf's reader and wallet calls select Mainnet explicitly. The desktop's
  // general TEZOS_NETWORK setting may independently point at Shadownet.
  const value = (env.HORF_HORSE_MARKET_CONTRACT_ADDRESS === undefined
    ? HORF_HORSE_MARKET_MAINNET_CONTRACT : env.HORF_HORSE_MARKET_CONTRACT_ADDRESS).trim();
  return CONTRACT_RE.test(value) ? value : null;
}

export interface HorseMarketStorage {
  admin: string; oracle_key: string; oracle_epoch: string | number;
  horse_contract: string; next_listing_id: string | number;
}

async function readyMarket(reader: ChainReader, env: NodeJS.ProcessEnv) {
  const address = horseMarketAddress(env);
  if (!address) return null;
  await assertHorfStablesMainnet(reader);
  const [indexed, storage, horse] = await Promise.all([
    reader.getJson<{ codeHash?: number; creator?: { address?: string } }>(`/contracts/${address}`),
    reader.getJson<HorseMarketStorage>(`/contracts/${address}/storage`),
    getHorfHorseConfig(null, reader, env),
  ]);
  if (indexed?.codeHash !== HORF_HORSE_MARKET_CODE_HASH ||
      indexed?.creator?.address !== HORF_HORSE_ORIGINATOR ||
      storage?.admin !== HORF_HORSE_ORIGINATOR || typeof storage.oracle_key !== "string" ||
      storage.horse_contract !== horseContractAddress(env) || horse.status !== "ready" ||
      !storage.oracle_key) {
    throw new Error("HORSE market Mainnet contract configuration does not match Horf");
  }
  nat(storage.oracle_epoch, "oracle epoch");
  nat(storage.next_listing_id, "next listing ID");
  return { address, storage, horseContractAddress: horse.token!.contract };
}

export async function horseMarketConfig(
  reader: ChainReader = horfMainnetIndex, env: NodeJS.ProcessEnv = process.env,
) {
  const market = await readyMarket(reader, env);
  if (!market) return { status: "unconfigured" as const, network: "mainnet" as const,
    chainId: HORF_MAINNET_CHAIN_ID, contractAddress: null, horseContractAddress: null, permitReady: false };
  let permitReady = false;
  try {
    const signer = await InMemorySigner.fromSecretKey(requireHorfOracleSecret(env));
    permitReady = (await signer.publicKey()) === market.storage.oracle_key;
  } catch { /* The read-only market remains visible without an oracle key. */ }
  return { status: "ready" as const, network: "mainnet" as const,
    chainId: HORF_MAINNET_CHAIN_ID, contractAddress: market.address,
    horseContractAddress: market.horseContractAddress, permitReady };
}

export function readHorseMarketListing(row: Key) {
  if (row.active === false) return null;
  if (!row.value || typeof row.value !== "object" || Array.isArray(row.value)) throw new Error("Invalid HORSE listing");
  const value = row.value as Record<string, unknown>;
  const sellerAddress = String(value.seller || "");
  const tokenContract = String(value.token_contract || "");
  const tokenId = nat(value.token_id, "listing token ID");
  const remaining = nat(value.remaining, "listing remainder");
  const unitPriceHorseRaw = nat(value.unit_price_horse, "listing price");
  if (!isTezosWallet(sellerAddress) || !CONTRACT_RE.test(tokenContract) ||
      BigInt(remaining) === 0n || BigInt(unitPriceHorseRaw) === 0n) return null;
  return { id: nat(row.key, "listing ID"), sellerAddress, tokenContract, tokenId,
    remaining, unitPriceHorseRaw,
    unitPriceHorse: `${BigInt(unitPriceHorseRaw) / 100000000n}${BigInt(unitPriceHorseRaw) % 100000000n === 0n ? "" : `.${(BigInt(unitPriceHorseRaw) % 100000000n).toString().padStart(8, "0").replace(/0+$/, "")}`}` };
}

export async function horseMarketListings(reader: ChainReader = horfMainnetIndex, env: NodeJS.ProcessEnv = process.env) {
  const market = await readyMarket(reader, env);
  if (!market) return { listings: [] };
  const listings: Array<NonNullable<ReturnType<typeof readHorseMarketListing>>> = [];
  let cursor = 0;
  // TzKT documents 100 as its default page size; cursor paging has no total cap.
  const pageSize = 100;
  while (true) {
    const rows = await reader.getJson<Key[]>(`/contracts/${market.address}/bigmaps/listings/keys`,
      { active: true, "sort.asc": "id", "offset.cr": cursor, limit: pageSize });
    if (!Array.isArray(rows)) throw new Error("Invalid HORSE listing page");
    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id <= cursor) throw new Error("HORSE listing cursor did not advance");
      cursor = id;
      const listing = readHorseMarketListing(row);
      if (listing) listings.push(listing);
    }
    if (rows.length < pageSize) break;
  }
  const withTokens = (await Promise.all(listings.map(async (listing) => {
    try {
      const [token] = await Promise.all([
        inspectHorseTokenCached(listing.tokenContract, listing.tokenId),
        assertHorfCustodyTrusted(0, listing.tokenContract, listing.tokenId),
      ]);
      return { ...listing, token };
    } catch (error) {
      // A revoked approval removes the buy button immediately, ahead of the
      // admin's corresponding on-chain blocked-token transaction.
      if (error instanceof HorfCustodyUntrustedError || error instanceof HorseTokenIneligibleError || error instanceof HorseTokenNotFoundError) return null;
      throw error;
    }
  }))).filter((listing): listing is NonNullable<typeof listing> => listing !== null);
  return { listings: withTokens.sort((a, b) => BigInt(a.id) === BigInt(b.id) ? 0 : BigInt(a.id) > BigInt(b.id) ? -1 : 1) };
}

export class HorseMarketPermitError extends Error {}

export async function issueHorseMarketPermit(input: {
  address: string; tokenContract: string; tokenId: string;
  quantity: string; unitPriceHorseRaw: string;
}, options: { reader?: ChainReader; env?: NodeJS.ProcessEnv; nonce?: string;
  signer?: { publicKey(): Promise<string>; sign(bytes: string): Promise<{ prefixSig: string }> };
  approvalCheck?: (mode: 0 | 1 | 2, contract: string, tokenId: string) => Promise<void>;
  ownerCheck?: typeof assertCurrentOwner;
  tokenCheck?: typeof inspectHorseTokenCached;
} = {}) {
  const env = options.env ?? process.env;
  const reader = options.reader ?? horfMainnetIndex;
  if (!isTezosWallet(input.address) || !CONTRACT_RE.test(input.tokenContract)) throw new HorseMarketPermitError("A valid seller and horse contract are required");
  const tokenId = nat(input.tokenId, "token ID");
  const quantity = nat(input.quantity, "quantity");
  const unitPriceHorseRaw = nat(input.unitPriceHorseRaw, "HORSE price");
  if (BigInt(quantity) === 0n || BigInt(unitPriceHorseRaw) === 0n) throw new HorseMarketPermitError("Quantity and HORSE price must be positive");
  const market = await readyMarket(reader, env);
  if (!market) throw new HorseMarketPermitError("HORSE market is not configured for Tezos Mainnet");
  if (input.tokenContract === market.horseContractAddress) throw new HorseMarketPermitError("HORSE is the payment token, not a horse for sale");
  const [balance, token] = await Promise.all([
    (options.ownerCheck ?? assertCurrentOwner)(input.address, input.tokenContract, tokenId),
    (options.tokenCheck ?? inspectHorseTokenCached)(input.tokenContract, tokenId),
    (options.approvalCheck ?? assertHorfCustodyTrusted)(0, input.tokenContract, tokenId),
  ]);
  if (BigInt(balance) < BigInt(quantity)) throw new HorfTokenNotOwnedError("This wallet does not hold enough editions to list");
  const signer = options.signer ?? await InMemorySigner.fromSecretKey(requireHorfOracleSecret(env));
  if (await signer.publicKey() !== market.storage.oracle_key) throw new HorseMarketPermitError("HORSE market oracle key does not match the deployed contract");
  const nonce = `0x${(options.nonce ?? randomBytes(32).toString("hex")).replace(/^0x/i, "")}`;
  const oracleEpoch = nat(market.storage.oracle_epoch, "oracle epoch");
  const signature = (await signer.sign(packHorseMarketPermit({ chainId: HORF_MAINNET_CHAIN_ID,
    marketAddress: market.address, seller: input.address, tokenContract: input.tokenContract,
    tokenId, quantity, unitPriceHorseRaw, nonce, oracleEpoch }))).prefixSig;
  return { contractAddress: market.address, chainId: HORF_MAINNET_CHAIN_ID, address: input.address,
    tokenContract: input.tokenContract, tokenId, quantity, unitPriceHorseRaw,
    nonce, signature, oracleEpoch, token };
}
