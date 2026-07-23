import { trackContractActivity } from "./activity-ledger";
import { toNatString } from "./nat";
import { assertNetworkReadyForSend } from "./preflight";
import { getTezos } from "./wallet";

export type RewardRedemptionClaim = {
  contract: string;
  redemptionId: string;
  claimant: string;
  amountWtfRaw: string;
  itemRef: string;
  expiresAt: string;
  expectedWtfTokenAddress: string;
  expectedWtfTokenId: number;
};

export async function claimRewardRedemption(
  walletAddress: string,
  redemption: RewardRedemptionClaim
): Promise<string> {
  if (walletAddress !== redemption.claimant) {
    throw new Error(
      `Connect the cashout wallet ${redemption.claimant} before claiming this reward.`
    );
  }

  return trackContractActivity(
    {
      module: "rewards",
      action: "claim_reward_redemption",
      contractAddress: redemption.contract,
      entrypoint: "claim_redemption",
      walletAddress,
      params: {
        redemptionId: redemption.redemptionId,
        amountWtfRaw: redemption.amountWtfRaw,
        itemRef: redemption.itemRef,
      },
    },
    async () => {
      await assertNetworkReadyForSend(walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(redemption.contract);
      const operation = await contract.methodsObject
        .claim_redemption({
          redemption_id: toNatString(redemption.redemptionId),
          expected_claimant: redemption.claimant,
          expected_amount_wtf_units: toNatString(redemption.amountWtfRaw),
          expected_item_ref: redemption.itemRef,
          expected_wtf_token_address: redemption.expectedWtfTokenAddress,
          expected_wtf_token_id: toNatString(redemption.expectedWtfTokenId),
        })
        .send();
      await operation.confirmation(1);
      return operation.opHash;
    }
  );
}
