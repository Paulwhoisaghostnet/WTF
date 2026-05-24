import { WTF_TOKEN } from "@shared/types";

export type PorcupinEligibilityResult = {
  wtfBalanceOk: boolean;
  membershipCardOk: boolean;
  duesActiveOk: boolean;
  eligible: boolean;
  wtfBalance: number;
  notes: string[];
};

const WTF_BALANCE_THRESHOLD = 10_000;
const AUTOPIN_MEMBERSHIP_SKU = "wtf-autopin-membership";

export async function checkPorcupinPremiumEligibility(input: {
  walletAddress: string | null;
  hasActiveDues: boolean;
  inventorySkus: string[];
  fetchWtfBalance: (address: string) => Promise<number>;
}): Promise<PorcupinEligibilityResult> {
  const notes: string[] = [];
  let wtfBalanceOk = false;
  let membershipCardOk = input.inventorySkus.includes(AUTOPIN_MEMBERSHIP_SKU);
  const duesActiveOk = input.hasActiveDues;

  if (!input.walletAddress) {
    notes.push("Connect a Tezos wallet to verify WTF balance.");
  } else {
    const balance = await input.fetchWtfBalance(input.walletAddress);
    wtfBalanceOk = balance >= WTF_BALANCE_THRESHOLD;
    if (!wtfBalanceOk) {
      notes.push(
        `WTF balance ${balance} is below ${WTF_BALANCE_THRESHOLD} (${WTF_TOKEN.symbol}).`
      );
    }
  }

  if (!membershipCardOk) {
    notes.push("WTF AutoPin Service Membership Card required (in-app marketplace).");
  }
  if (!duesActiveOk) {
    notes.push("Active WTF Club Dues membership required.");
  }

  const eligible = wtfBalanceOk && membershipCardOk && duesActiveOk;

  return {
    wtfBalanceOk,
    membershipCardOk,
    duesActiveOk,
    eligible,
    wtfBalance: input.walletAddress
      ? await input.fetchWtfBalance(input.walletAddress).catch(() => 0)
      : 0,
    notes,
  };
}
