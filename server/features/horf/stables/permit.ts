import { randomBytes } from "node:crypto";
import { packDataBytes } from "@taquito/michel-codec";
import { InMemorySigner } from "@taquito/signer";
import { b58DecodeAddress, b58DecodeAndCheckPrefix, PrefixV2 } from "@taquito/utils";
import { horfMainnetIndex } from "../mainnet-index";
import { isTezosWallet } from "../model";
import { inspectHorseToken, type TokenLoader } from "./eligibility";
import {
  HORF_MAINNET_CHAIN_ID,
  HorfStablesUnconfiguredError,
  requireHorfOracleSecret,
  requireHorfStablesContractAddress,
} from "./config";
import { assertHorfStablesMainnet, readHorfStablesStorage, type ChainReader } from "./chain";
import { assertHorfCustodyTrusted } from "./custody";

type MichelsonNode = { prim?: string; args?: MichelsonNode[]; bytes?: string; int?: string };

function pair(values: MichelsonNode[]): MichelsonNode {
  if (values.length < 2) throw new Error("Horf deposit permit requires a pair");
  return values.length === 2
    ? { prim: "Pair", args: values }
    : { prim: "Pair", args: [values[0]!, pair(values.slice(1))] };
}

function nat(value: string | number, label: string): string {
  const text = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) throw new Error(`Invalid ${label}`);
  return BigInt(text).toString();
}

export interface HorfDepositPermitInput {
  chainId: string;
  contractAddress: string;
  address: string;
  mode: 0 | 1 | 2;
  tokenContract: string;
  tokenId: string;
  amount: string;
  nonce: string;
  oracleEpoch: string;
}

/** Matches SmartPy `sp.pack((chain_id, (self, (sender, ...))))` exactly. */
export function packHorfDepositPermit(input: HorfDepositPermitInput): string {
  const nonce = input.nonce.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(nonce)) throw new Error("Horf permit nonce must be 32 bytes");
  const chainIdBytes = Buffer.from(
    b58DecodeAndCheckPrefix(input.chainId, [PrefixV2.ChainID])[0],
  ).toString("hex");
  const values: MichelsonNode[] = [
    { bytes: chainIdBytes },
    { bytes: b58DecodeAddress(input.contractAddress) },
    { bytes: b58DecodeAddress(input.address) },
    { int: nat(input.mode, "stable mode") },
    { bytes: b58DecodeAddress(input.tokenContract) },
    { int: nat(input.tokenId, "token ID") },
    { int: nat(input.amount, "amount") },
    { bytes: nonce },
    { int: nat(input.oracleEpoch, "oracle epoch") },
  ];
  const types = ["chain_id", "address", "address", "nat", "address", "nat", "nat", "bytes", "nat"];
  return packDataBytes(pair(values) as never, pair(types.map((prim) => ({ prim }))) as never).bytes;
}

export interface HorfPermitSigner {
  publicKey(): Promise<string>;
  sign(bytes: string): Promise<{ sig: string; prefixSig: string }>;
}

export interface HorfPermitRequest {
  address: string;
  mode: 0 | 1 | 2;
  tokenContract: string;
  tokenId: string;
  amount: string;
}

export interface HorfDepositPermitResponse extends HorfPermitRequest {
  contractAddress: string;
  chainId: typeof HORF_MAINNET_CHAIN_ID;
  nonce: string;
  signature: string;
  oracleEpoch: string;
  token: Awaited<ReturnType<typeof inspectHorseToken>>;
}

export async function issueHorfDepositPermit(
  request: HorfPermitRequest,
  options: {
    reader?: ChainReader;
    loadToken?: TokenLoader;
    signer?: HorfPermitSigner;
    env?: NodeJS.ProcessEnv;
    nonce?: string;
    approvalCheck?: typeof assertHorfCustodyTrusted;
  } = {},
): Promise<HorfDepositPermitResponse> {
  const env = options.env ?? process.env;
  if (!isTezosWallet(request.address)) throw new Error("Invalid Tezos wallet address");
  if (request.mode !== 0 && request.mode !== 1 && request.mode !== 2) {
    throw new Error("Invalid Horf stable mode");
  }
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(request.tokenContract)) {
    throw new Error("Invalid Tezos FA2 contract address");
  }
  const tokenId = nat(request.tokenId, "token ID");
  const amount = nat(request.amount, "amount");
  if (amount === "0") throw new Error("Deposit amount must be positive");
  await (options.approvalCheck ?? assertHorfCustodyTrusted)(request.mode, request.tokenContract, tokenId);
  const contractAddress = requireHorfStablesContractAddress(env);
  const reader = options.reader ?? horfMainnetIndex;
  await assertHorfStablesMainnet(reader);
  const storage = await readHorfStablesStorage(contractAddress, reader);
  let signer: HorfPermitSigner;
  try {
    signer = options.signer ?? await InMemorySigner.fromSecretKey(requireHorfOracleSecret(env));
  } catch {
    throw new HorfStablesUnconfiguredError("Horf stable eligibility signing is not configured");
  }
  let signerKey: string;
  try {
    signerKey = await signer.publicKey();
  } catch {
    throw new HorfStablesUnconfiguredError("Horf stable oracle public key could not be read");
  }
  if (signerKey !== storage.oracle_key) {
    throw new HorfStablesUnconfiguredError("Horf stable oracle key does not match deployed contract");
  }
  const token = await inspectHorseToken(request.tokenContract, tokenId, options.loadToken);
  const nonce = (options.nonce ?? randomBytes(32).toString("hex"))
    .replace(/^0x/i, "").toLowerCase();
  const oracleEpoch = nat(storage.oracle_epoch, "oracle epoch");
  const packed = packHorfDepositPermit({
    chainId: HORF_MAINNET_CHAIN_ID,
    contractAddress,
    address: request.address,
    mode: request.mode,
    tokenContract: request.tokenContract,
    tokenId,
    amount,
    nonce: `0x${nonce}`,
    oracleEpoch,
  });
  let signature: string;
  try {
    signature = (await signer.sign(packed)).prefixSig;
  } catch {
    throw new Error("Horf stable eligibility signature could not be produced");
  }
  return {
    contractAddress,
    chainId: HORF_MAINNET_CHAIN_ID,
    address: request.address,
    mode: request.mode,
    tokenContract: request.tokenContract,
    tokenId,
    amount,
    nonce: `0x${nonce}`,
    signature,
    oracleEpoch,
    token,
  };
}
