import { WTF_TOKEN } from "@shared/types";
import { trackContractActivity } from "./activity-ledger";
import { assertNetworkReadyForSend } from "./preflight";
import { getTezos } from "./wallet";
import { toNatString, type NatInput } from "./nat";

const IN_APP_MARKET_CONTRACT = (
  import.meta.env.VITE_IN_APP_MARKET_CONTRACT_ADDRESS || ""
).trim();

interface Fa2OperatorUpdate {
  add_operator: {
    owner: string;
    operator: string;
    token_id: string;
  };
}

function requireInAppMarketContract(): string {
  if (!IN_APP_MARKET_CONTRACT) {
    throw new Error(
      "VITE_IN_APP_MARKET_CONTRACT_ADDRESS is not configured. Set it before buying in-app items."
    );
  }
  return IN_APP_MARKET_CONTRACT;
}

if (!IN_APP_MARKET_CONTRACT) {
  console.warn(
    "[WTF] Missing VITE_IN_APP_MARKET_CONTRACT_ADDRESS; in-app item purchases are disabled until configured"
  );
}

async function setFa2Operator(
  fa2Contract: string,
  owner: string,
  operator: string,
  tokenId: NatInput
) {
  await assertNetworkReadyForSend();
  const tezos = await getTezos();
  const contract = await tezos.wallet.at(fa2Contract);
  const update: Fa2OperatorUpdate[] = [
    {
      add_operator: {
        owner,
        operator,
        token_id: toNatString(tokenId),
      },
    },
  ];
  const op = await contract.methodsObject.update_operators(update).send();
  await op.confirmation(1);
  return op.opHash;
}

export async function approveInAppMarketForWtf(owner: string): Promise<string> {
  const contractAddress = requireInAppMarketContract();
  return trackContractActivity(
    {
      module: "in_app_market",
      action: "approve_wtf",
      contractAddress: WTF_TOKEN.contract,
      entrypoint: "update_operators",
      walletAddress: owner,
      params: {
        owner,
        operator: contractAddress,
        tokenContract: WTF_TOKEN.contract,
        tokenId: WTF_TOKEN.tokenId,
      },
    },
    () => setFa2Operator(WTF_TOKEN.contract, owner, contractAddress, WTF_TOKEN.tokenId)
  );
}

export async function purchaseInAppMarketListing(params: {
  walletAddress: string;
  listingId: NatInput;
  amountWtfUnits: NatInput;
  purchaseRef?: string;
}): Promise<string> {
  const contractAddress = requireInAppMarketContract();
  const purchaseRef =
    params.purchaseRef ??
    `desktop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return trackContractActivity(
    {
      module: "in_app_market",
      action: "purchase",
      contractAddress,
      entrypoint: "purchase",
      walletAddress: params.walletAddress,
      params: {
        listingId: String(params.listingId),
        amountWtfUnits: String(params.amountWtfUnits),
        purchaseRef,
      },
    },
    async () => {
      await assertNetworkReadyForSend();
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const op = await contract.methodsObject
        .purchase({
          listing_id: toNatString(params.listingId),
          amount_wtf_units: toNatString(params.amountWtfUnits),
          purchase_ref: purchaseRef.slice(0, 128),
        })
        .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}
