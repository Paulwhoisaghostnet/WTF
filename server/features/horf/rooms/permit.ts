import { randomBytes } from "node:crypto";
import { packDataBytes } from "@taquito/michel-codec";
import { InMemorySigner } from "@taquito/signer";
import { b58DecodeAddress, b58DecodeAndCheckPrefix, PrefixV2 } from "@taquito/utils";
import { horfMainnetIndex } from "../mainnet-index";
import { isTezosWallet } from "../model";
import { isExcludedHorseToken } from "../nonhorse-reports";
import { assertHorfCustodyTrusted } from "../stables/custody";
import { inspectHorseToken, type TokenLoader } from "../stables/eligibility";
import { assertHorfRoomsMainnet, readHorfRoomsStorage, type HorfRoomMode, type RoomChainReader } from "./chain";
import { HORF_MAINNET_CHAIN_ID, HorfRoomsUnconfiguredError,
  requireHorfRoomsContractAddress, requireHorfRoomsOracleSecret } from "./config";

type MichelsonNode = { prim?: string; args?: MichelsonNode[]; bytes?: string; int?: string };

function pair(values: MichelsonNode[]): MichelsonNode {
  if (values.length < 2) throw new Error("Horf room permit requires a pair");
  return values.length === 2 ? { prim: "Pair", args: values }
    : { prim: "Pair", args: [values[0]!, pair(values.slice(1))] };
}

function nat(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  if (!/^\d+$/.test(text)) throw new Error(`Invalid ${label}`);
  return BigInt(text).toString();
}

export interface HorfRoomPermitInput {
  chainId: string;
  contractAddress: string;
  address: string;
  action: 0 | 1 | 2;
  mode: HorfRoomMode;
  listingId: string;
  tokenContract: string;
  tokenId: string;
  amount: string;
  nonce: string;
  oracleEpoch: string;
}

/** SmartPy right-nested PACK: chain, self, caller, action, mode, listing, FA2, token, amount, nonce, epoch. */
export function packHorfRoomPermit(input: HorfRoomPermitInput): string {
  const nonce = input.nonce.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(nonce)) throw new Error("Horf room permit nonce must be 32 bytes");
  const chainIdBytes = Buffer.from(
    b58DecodeAndCheckPrefix(input.chainId, [PrefixV2.ChainID])[0],
  ).toString("hex");
  const values: MichelsonNode[] = [
    { bytes: chainIdBytes },
    { bytes: b58DecodeAddress(input.contractAddress) },
    { bytes: b58DecodeAddress(input.address) },
    { int: nat(input.action, "permit action") },
    { int: nat(input.mode, "room mode") },
    { int: nat(input.listingId, "listing ID") },
    { bytes: b58DecodeAddress(input.tokenContract) },
    { int: nat(input.tokenId, "token ID") },
    { int: nat(input.amount, "edition amount") },
    { bytes: nonce },
    { int: nat(input.oracleEpoch, "oracle epoch") },
  ];
  const types = ["chain_id", "address", "address", "nat", "nat", "nat", "address", "nat", "nat", "bytes", "nat"];
  return packDataBytes(pair(values) as never, pair(types.map((prim) => ({ prim }))) as never).bytes;
}

export interface HorfRoomPermitRequest {
  address: string;
  action: 0 | 1 | 2;
  mode: HorfRoomMode;
  listingId: string;
  tokenContract: string;
  tokenId: string;
  amount: string;
}

export interface HorfRoomPermitResponse extends HorfRoomPermitRequest {
  contractAddress: string;
  chainId: typeof HORF_MAINNET_CHAIN_ID;
  nonce: string;
  signature: string;
  oracleEpoch: string;
  token: Awaited<ReturnType<typeof inspectHorseToken>>;
}

export interface HorfRoomPermitSigner {
  publicKey(): Promise<string>;
  sign(bytes: string): Promise<{ sig: string; prefixSig: string }>;
}

export async function issueHorfRoomPermit(
  request: HorfRoomPermitRequest,
  options: {
    reader?: RoomChainReader;
    loadToken?: TokenLoader;
    signer?: HorfRoomPermitSigner;
    env?: NodeJS.ProcessEnv;
    nonce?: string;
    approvalCheck?: typeof assertHorfCustodyTrusted;
    exclusionCheck?: typeof isExcludedHorseToken;
  } = {},
): Promise<HorfRoomPermitResponse> {
  const env = options.env ?? process.env;
  if (!isTezosWallet(request.address)) throw new Error("Invalid Tezos wallet address");
  if (request.action !== 0 && request.action !== 1 && request.action !== 2) throw new Error("Invalid room permit action");
  if (request.mode !== 0 && request.mode !== 1 && request.mode !== 2 && request.mode !== 3) throw new Error("Invalid room mode");
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(request.tokenContract)) {
    throw new Error("Invalid FA2 token contract address");
  }
  const listingId = nat(request.listingId, "listing ID");
  const tokenId = nat(request.tokenId, "token ID");
  const amount = nat(request.amount, "edition amount");
  if (amount === "0") throw new Error("Choose at least one edition");
  if (request.action === 0 && listingId !== "0") throw new Error("A room deposit does not target a listing");
  if (request.action === 1 && (request.mode !== 2 || amount !== "1")) {
    throw new Error("An Outlaw swap must offer exactly one edition");
  }
  if (request.action === 2 && (request.mode !== 3 || amount !== "1")) {
    throw new Error("A private offer must exchange exactly one edition");
  }
  if (request.action === 0 && request.mode === 3 && amount !== "1") {
    throw new Error("A private offer must escrow exactly one edition");
  }
  if (request.action === 0 && (request.mode === 0 || request.mode === 1)) {
    await (options.approvalCheck ?? assertHorfCustodyTrusted)(request.mode, request.tokenContract, tokenId);
  }
  const contractAddress = requireHorfRoomsContractAddress(env);
  const reader = options.reader ?? horfMainnetIndex;
  await assertHorfRoomsMainnet(reader);
  const storage = await readHorfRoomsStorage(contractAddress, reader);
  let signer: HorfRoomPermitSigner;
  try {
    signer = options.signer ?? await InMemorySigner.fromSecretKey(requireHorfRoomsOracleSecret(env));
  } catch { throw new HorfRoomsUnconfiguredError("Horf room eligibility signing is not configured"); }
  if (await signer.publicKey() !== storage.oracle_key) {
    throw new HorfRoomsUnconfiguredError("Horf room oracle key does not match deployed contract");
  }
  const token = await inspectHorseToken(request.tokenContract, tokenId, options.loadToken,
    { exclusionCheck: options.exclusionCheck });
  const nonce = (options.nonce ?? randomBytes(32).toString("hex")).replace(/^0x/i, "").toLowerCase();
  const oracleEpoch = nat(storage.oracle_epoch, "oracle epoch");
  const packed = packHorfRoomPermit({
    chainId: HORF_MAINNET_CHAIN_ID, contractAddress, address: request.address,
    action: request.action, mode: request.mode, listingId,
    tokenContract: request.tokenContract, tokenId, amount, nonce: `0x${nonce}`, oracleEpoch,
  });
  let signature: string;
  try { signature = (await signer.sign(packed)).prefixSig; }
  catch { throw new Error("Horf room eligibility signature could not be produced"); }
  return {
    contractAddress, chainId: HORF_MAINNET_CHAIN_ID, address: request.address,
    action: request.action, mode: request.mode, listingId, tokenContract: request.tokenContract,
    tokenId, amount, nonce: `0x${nonce}`, signature, oracleEpoch, token,
  };
}
