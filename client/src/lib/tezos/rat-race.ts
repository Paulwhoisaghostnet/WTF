import type { RatRacePurchaseIntent } from "@shared/tezos-intel";
import { externalMarketplaceInfo } from "@shared/external-marketplaces";
import { trackContractActivity } from "./activity-ledger";
import { assertNetworkReadyForSend } from "./preflight";
import { getTezos } from "./wallet";

function assertNat(value: string | null, label: string): string {
  const raw = String(value ?? "").trim();
  if (!/^[0-9]+$/.test(raw)) throw new Error(`Invalid ${label}`);
  return raw;
}

function assertSupportedIntent(intent: RatRacePurchaseIntent): asserts intent is RatRacePurchaseIntent & {
  supported: true;
  marketplaceContract: string;
  entrypoint: "fulfill_ask" | "buy" | "collect";
  listingId: string;
  totalMutez: string;
} {
  if (!intent.supported || !intent.marketplaceContract || !intent.entrypoint || !intent.listingId || !intent.totalMutez) {
    throw new Error(intent.reason || "This listing is not supported for direct contract purchase yet");
  }
}

function purchaseParams(intent: RatRacePurchaseIntent & {
  supported: true;
  marketplaceContract: string;
  entrypoint: "fulfill_ask" | "buy" | "collect";
  listingId: string;
}) {
  const listingId = assertNat(intent.listingId, "listing id");
  const amount = Math.max(1, Math.floor(Number(intent.amount || 1)));
  const info = externalMarketplaceInfo(intent.marketplaceContract);
  if (intent.entrypoint === "collect") return listingId;
  if (intent.entrypoint === "buy") {
    return { sale_id: listingId, amount: String(amount), split: new Map<string, string>() };
  }
  if (info?.version === "v1") return listingId;
  if (info?.version === "v4") {
    return { ask_id: listingId, proxy: null };
  }
  return {
    ask_id: listingId,
    amount: String(amount),
    proxy_for: null,
    condition_extra: null,
    referrers: new Map<string, string>(),
  };
}

export async function purchaseRatRaceListing(params: {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  intent: RatRacePurchaseIntent;
}): Promise<string> {
  assertSupportedIntent(params.intent);
  const intent = params.intent;
  const totalMutez = Number(assertNat(intent.totalMutez, "price"));
  if (!Number.isSafeInteger(totalMutez) || totalMutez <= 0) {
    throw new Error("Invalid listing price");
  }

  return trackContractActivity(
    {
      module: "rat_race",
      action: "purchase_listing",
      contractAddress: intent.marketplaceContract,
      entrypoint: intent.entrypoint,
      walletAddress: params.walletAddress,
      params: {
        tokenContract: params.tokenContract,
        tokenId: params.tokenId,
        listingId: intent.listingId,
        amount: intent.amount,
        totalMutez: intent.totalMutez,
      },
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(intent.marketplaceContract);
      const op = await contract.methodsObject[intent.entrypoint](purchaseParams(intent)).send({
        amount: totalMutez,
        mutez: true,
      });
      await op.confirmation(1);
      return op.opHash;
    }
  );
}
