import { toNatString } from "./nat";
import { assertNetworkReadyForSend } from "./preflight";
import { ensureWalletProviderForSend, withTezosRpcFallback } from "./wallet";

export const HORF_MARKET_CHAIN_ID = "NetXdQprcVkpaWU";
const HORSE_SCALE = 100_000_000n;
type Stage = "preflight" | "preparing" | "wallet" | "confirming";
type Progress = { onStage?: (stage: Stage) => void; onSubmitted?: (opHash: string) => void };

export type HorfHorseMarketContract = {
  contractAddress: string;
  chainId: string;
  horseContractAddress: string;
};

export type HorfHorseMarketPermit = Pick<HorfHorseMarketContract, "contractAddress" | "chainId"> & {
  address: string;
  tokenContract: string;
  tokenId: string;
  quantity: string;
  unitPriceHorseRaw: string;
  nonce: string;
  signature: string;
  oracleEpoch: string;
};

export function assertHorseMarketPermitMatchesReview(
  permit: HorfHorseMarketPermit,
  review: Pick<HorfHorseMarketPermit, "address" | "tokenContract" | "tokenId" | "quantity" | "unitPriceHorseRaw">,
): void {
  if (permit.address !== review.address || permit.tokenContract !== review.tokenContract ||
      toNatString(permit.tokenId) !== toNatString(review.tokenId) ||
      toNatString(permit.quantity) !== toNatString(review.quantity) ||
      toNatString(permit.unitPriceHorseRaw) !== toNatString(review.unitPriceHorseRaw)) {
    throw new Error("The listing permit changed the reviewed horse, edition count, or HORSE price. Review the listing again.");
  }
}

export type HorfHorseMarketListing = {
  id: string;
  sellerAddress: string;
  tokenContract: string;
  tokenId: string;
  remaining: string;
  unitPriceHorseRaw: string;
  token?: {
    name?: string;
    image?: string | null;
    displayUri?: string | null;
    artifactUri?: string | null;
    mime?: string | null;
  };
};

export type HorfObjktPurchase = {
  listingId?: string;
  askId: string;
  marketplaceContract: string;
  version: string;
  entrypoint: "fulfill_ask" | "buy";
  sellerAddress: string;
  priceMutez: string;
  amountLeft: string;
  tokenContract: string;
  tokenId: string;
  amount?: "1";
  network?: "mainnet";
  chainId?: string;
};

function positiveNat(value: string, label: string): string {
  const nat = toNatString(value);
  if (nat === "0") throw new Error(`${label} must be greater than zero.`);
  return nat;
}

function assertContract(config: HorfHorseMarketContract): void {
  if (config.chainId !== HORF_MARKET_CHAIN_ID || !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.contractAddress) ||
      !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.horseContractAddress)) {
    throw new Error("HORSE Market is not configured for Tezos Mainnet.");
  }
}

/** Exact decimal handling keeps prices above 2^53 and eight decimal places intact. */
export function horseAmountToRaw(value: string): string {
  const amount = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(amount);
  if (!match) throw new Error("Enter a HORSE price with at most 8 decimal places.");
  const raw = BigInt(match[1]) * HORSE_SCALE + BigInt((match[2] ?? "").padEnd(8, "0") || "0");
  if (raw === 0n) throw new Error("The HORSE price must be greater than zero.");
  return raw.toString();
}

export function formatHorseRaw(value: string): string {
  const raw = BigInt(toNatString(value));
  const whole = (raw / HORSE_SCALE).toLocaleString();
  const fractional = (raw % HORSE_SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole;
}

async function sendMarketBatch(walletAddress: string, config: HorfHorseMarketContract,
  build: (tezos: any) => Promise<any>, progress: Progress): Promise<string> {
  assertContract(config);
  progress.onStage?.("preflight");
  await assertNetworkReadyForSend(walletAddress, { network: "mainnet", useFallback: true });
  progress.onStage?.("preparing");
  const prepared = await withTezosRpcFallback(async (tezos, { rpcUrl }) => {
    if (await tezos.rpc.getChainId() !== HORF_MARKET_CHAIN_ID) throw new Error("The selected RPC is not Tezos Mainnet.");
    await ensureWalletProviderForSend(walletAddress, { network: "mainnet", rpcUrl });
    return { tezos, rpcUrl, batch: await build(tezos) };
  }, { network: "mainnet" });
  await assertNetworkReadyForSend(walletAddress, { network: "mainnet", rpcUrl: prepared.rpcUrl });
  if (await prepared.tezos.rpc.getChainId() !== HORF_MARKET_CHAIN_ID) throw new Error("The Tezos network changed while preparing this sale.");
  progress.onStage?.("wallet");
  const operation = await prepared.batch.send();
  progress.onSubmitted?.(operation.opHash);
  progress.onStage?.("confirming");
  await operation.confirmation(1);
  return operation.opHash;
}

export async function listHorseForHorse(walletAddress: string, config: HorfHorseMarketContract,
  permit: HorfHorseMarketPermit, progress: Progress = {}): Promise<string> {
  assertContract(config);
  if (permit.contractAddress !== config.contractAddress || permit.chainId !== config.chainId ||
      permit.address !== walletAddress || !/^0x[0-9a-fA-F]{64}$/.test(permit.nonce) || !permit.signature?.trim()) {
    throw new Error("The Marshal listing permit does not match this HORSE Market.");
  }
  const tokenId = toNatString(permit.tokenId);
  const quantity = positiveNat(permit.quantity, "Edition quantity");
  const unitPrice = positiveNat(permit.unitPriceHorseRaw, "HORSE price");
  return sendMarketBatch(walletAddress, config, async (tezos) => {
    const horse = await tezos.wallet.at(permit.tokenContract);
    const market = await tezos.wallet.at(config.contractAddress);
    if (!horse.methodsObject.update_operators || !market.methodsObject.create_listing) throw new Error("The horse token or market lacks the required Tezos entrypoint.");
    const operator = { owner: walletAddress, operator: config.contractAddress, token_id: tokenId };
    return tezos.wallet.batch()
      .withContractCall(horse.methodsObject.update_operators([{ add_operator: operator }]))
      .withContractCall(market.methodsObject.create_listing({
        token_contract: permit.tokenContract, token_id: tokenId, quantity,
        unit_price_horse: unitPrice, nonce: permit.nonce, signature: permit.signature,
      }))
      .withContractCall(horse.methodsObject.update_operators([{ remove_operator: operator }]));
  }, progress);
}

export async function buyHorseWithHorse(walletAddress: string, config: HorfHorseMarketContract,
  listing: HorfHorseMarketListing, quantity: string, progress: Progress = {}): Promise<string> {
  const count = positiveNat(quantity, "Edition quantity");
  if (BigInt(count) > BigInt(positiveNat(listing.remaining, "Remaining editions"))) throw new Error("This listing has fewer editions left.");
  return sendMarketBatch(walletAddress, config, async (tezos) => {
    const horse = await tezos.wallet.at(config.horseContractAddress);
    const market = await tezos.wallet.at(config.contractAddress);
    if (!horse.methodsObject.update_operators || !market.methodsObject.buy_listing) throw new Error("The HORSE token or market lacks the required Tezos entrypoint.");
    const operator = { owner: walletAddress, operator: config.contractAddress, token_id: "0" };
    return tezos.wallet.batch()
      .withContractCall(horse.methodsObject.update_operators([{ add_operator: operator }]))
      .withContractCall(market.methodsObject.buy_listing({
        listing_id: toNatString(listing.id), quantity: count, expected_seller: listing.sellerAddress,
        expected_token: { token_contract: listing.tokenContract, token_id: toNatString(listing.tokenId) },
        expected_unit_price_horse: positiveNat(listing.unitPriceHorseRaw, "HORSE price"),
      }))
      .withContractCall(horse.methodsObject.update_operators([{ remove_operator: operator }]));
  }, progress);
}

export async function cancelHorseMarketListing(walletAddress: string, config: HorfHorseMarketContract,
  listingId: string, progress: Progress = {}): Promise<string> {
  return sendMarketBatch(walletAddress, config, async (tezos) => {
    const market = await tezos.wallet.at(config.contractAddress);
    if (!market.methodsObject.cancel_listing) throw new Error("The HORSE Market does not support listing cancellation.");
    return tezos.wallet.batch().withContractCall(market.methodsObject.cancel_listing(toNatString(listingId)));
  }, progress);
}

const OBJKT_VERSIONS: Record<string, { version: string; entrypoint: HorfObjktPurchase["entrypoint"] }> = {
  KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq: { version: "v1", entrypoint: "fulfill_ask" },
  KT1WvzYHCNBvDSdwafTHv7nJ1dWmZ8GCYuuC: { version: "v4", entrypoint: "fulfill_ask" },
  KT1CePTyk6fk4cFr6fasY5YXPGks6ttjSLp4: { version: "v6", entrypoint: "fulfill_ask" },
  KT1Xjap1TwmDR1d8yEd8ErkraAj2mbdMrPZY: { version: "v6.1", entrypoint: "fulfill_ask" },
  KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X: { version: "v6.2", entrypoint: "fulfill_ask" },
};

export function assertObjktPurchaseMatches(shown: HorfObjktPurchase, fresh: HorfObjktPurchase): void {
  const supported = OBJKT_VERSIONS[shown.marketplaceContract];
  if (!supported || supported.entrypoint !== shown.entrypoint || supported.version !== shown.version ||
      fresh.chainId !== HORF_MARKET_CHAIN_ID || fresh.network !== "mainnet" || fresh.amount !== "1" ||
      ["askId", "marketplaceContract", "sellerAddress", "priceMutez", "tokenContract", "tokenId", "entrypoint", "version"].some(
        (key) => shown[key as keyof HorfObjktPurchase] !== fresh[key as keyof HorfObjktPurchase],
      ) || BigInt(toNatString(fresh.amountLeft)) < 1n) {
    throw new Error("This Objkt ask changed or is unavailable. Refresh its current listing before buying.");
  }
}

/** The caller must fetch an authoritative Mainnet ask immediately before this wallet operation. */
export async function buyHorseOnObjktInHorf(walletAddress: string, shown: HorfObjktPurchase,
  refreshPurchase: () => Promise<HorfObjktPurchase>, progress: Progress = {}): Promise<string> {
  progress.onStage?.("preflight");
  await assertNetworkReadyForSend(walletAddress, { network: "mainnet", useFallback: true });
  progress.onStage?.("preparing");
  const prepared = await withTezosRpcFallback(async (tezos, { rpcUrl }) => {
    if (await tezos.rpc.getChainId() !== HORF_MARKET_CHAIN_ID) throw new Error("The selected RPC is not Tezos Mainnet.");
    await ensureWalletProviderForSend(walletAddress, { network: "mainnet", rpcUrl });
    const contract = await tezos.wallet.at(shown.marketplaceContract);
    return { tezos, rpcUrl, contract };
  }, { network: "mainnet" });
  await assertNetworkReadyForSend(walletAddress, { network: "mainnet", rpcUrl: prepared.rpcUrl });
  const fresh = await refreshPurchase();
  assertObjktPurchaseMatches(shown, fresh);
  if (await prepared.tezos.rpc.getChainId() !== HORF_MARKET_CHAIN_ID) throw new Error("The Tezos network changed before this Objkt purchase.");
  const priceMutez = Number(positiveNat(fresh.priceMutez, "XTZ price"));
  if (!Number.isSafeInteger(priceMutez)) throw new Error("This Objkt price cannot be represented safely by the wallet.");
  const method = prepared.contract.methodsObject[fresh.entrypoint];
  if (!method) throw new Error("The Objkt ask contract no longer supports this purchase.");
  const askId = toNatString(fresh.askId);
  const params = fresh.entrypoint === "buy"
    ? { sale_id: askId, amount: "1", split: new Map<string, string>() }
    : fresh.version === "v1" ? askId
    : fresh.version === "v4" ? { ask_id: askId, proxy: null }
    : { ask_id: askId, amount: "1", proxy_for: null, condition_extra: null, referrers: new Map<string, string>() };
  progress.onStage?.("wallet");
  const operation = await method(params).send({ amount: priceMutez, mutez: true });
  progress.onSubmitted?.(operation.opHash);
  progress.onStage?.("confirming");
  await operation.confirmation(1);
  return operation.opHash;
}
