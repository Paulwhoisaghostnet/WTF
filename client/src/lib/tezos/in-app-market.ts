import {
  WTF_IN_APP_MARKET_CONTRACT,
  WTF_IN_APP_MARKET_CONTRACT_VERSION,
} from "@shared/types";
import { trackContractActivity } from "./activity-ledger";
import { assertNetworkReadyForSend } from "./preflight";
import { getTezos } from "./wallet";
import { toNatString, type NatInput } from "./nat";
import { getClientWtfToken } from "./wtf-token";

const IN_APP_MARKET_CONTRACT = (
  import.meta.env.VITE_IN_APP_MARKET_CONTRACT_ADDRESS ||
  (import.meta.env.VITE_TEZOS_NETWORK === "shadownet"
    ? "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC"
    : "") ||
  WTF_IN_APP_MARKET_CONTRACT ||
  ""
).trim();
const DEFAULT_IN_APP_MARKET_CONTRACT_VERSION =
  import.meta.env.VITE_TEZOS_NETWORK === "shadownet" ||
  IN_APP_MARKET_CONTRACT === WTF_IN_APP_MARKET_CONTRACT
    ? WTF_IN_APP_MARKET_CONTRACT_VERSION
    : "v1";
const IN_APP_MARKET_CONTRACT_VERSION = (
  import.meta.env.VITE_IN_APP_MARKET_CONTRACT_VERSION ||
  DEFAULT_IN_APP_MARKET_CONTRACT_VERSION
).trim().toLowerCase();

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
  await assertNetworkReadyForSend(owner);
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
  const wtfToken = getClientWtfToken();
  return trackContractActivity(
    {
      module: "in_app_market",
      action: "approve_wtf",
      contractAddress: wtfToken.contract,
      entrypoint: "update_operators",
      walletAddress: owner,
      params: {
        owner,
        operator: contractAddress,
        tokenContract: wtfToken.contract,
        tokenId: wtfToken.tokenId,
      },
    },
    () => setFa2Operator(wtfToken.contract, owner, contractAddress, wtfToken.tokenId)
  );
}

export async function purchaseInAppMarketListing(params: {
  walletAddress: string;
  listingId: NatInput;
  amountWtfUnits: NatInput;
  purchaseRef?: string;
  contractVersion?: "v1" | "v2" | string | null;
  cartHash?: string | null;
  expectedTreasuryAddress?: string | null;
  expectedWtfTokenContract?: string | null;
  expectedWtfTokenId?: NatInput | null;
}): Promise<string> {
  const contractAddress = requireInAppMarketContract();
  const contractVersion = (params.contractVersion || IN_APP_MARKET_CONTRACT_VERSION).toLowerCase();
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
        contractVersion,
        cartHash: params.cartHash ?? null,
        expectedTreasuryAddress: params.expectedTreasuryAddress ?? null,
        expectedWtfTokenContract: params.expectedWtfTokenContract ?? null,
        expectedWtfTokenId:
          params.expectedWtfTokenId == null ? null : String(params.expectedWtfTokenId),
      },
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const purchasePayload =
        contractVersion === "v2"
          ? {
              listing_id: toNatString(params.listingId),
              amount_wtf_units: toNatString(params.amountWtfUnits),
              purchase_ref: purchaseRef.slice(0, 128),
              cart_hash: requireV2String(params.cartHash, "cartHash", 64),
              expected_treasury: requireV2String(
                params.expectedTreasuryAddress,
                "expectedTreasuryAddress"
              ),
              expected_wtf_token_address: requireV2String(
                params.expectedWtfTokenContract,
                "expectedWtfTokenContract"
              ),
              expected_wtf_token_id: toNatString(params.expectedWtfTokenId ?? 0),
            }
          : {
              listing_id: toNatString(params.listingId),
              amount_wtf_units: toNatString(params.amountWtfUnits),
              purchase_ref: purchaseRef.slice(0, 128),
            };
      const op = await contract.methodsObject.purchase(purchasePayload).send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

function requireV2String(
  value: string | null | undefined,
  label: string,
  exactLength?: number
): string {
  const raw = (value ?? "").trim();
  if (!raw) throw new Error(`Missing ${label} for in-app market V2 purchase.`);
  if (exactLength != null && raw.length !== exactLength) {
    throw new Error(`${label} must be exactly ${exactLength} characters.`);
  }
  return raw;
}
