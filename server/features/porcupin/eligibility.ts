import { WTF_TOKEN } from "@shared/types";
import {
  LEGACY_AUTOPIN_SKU,
  PIN_COLLECTOR_ROLE,
  PIN_COLLECTOR_SKU,
} from "../ipfs-pinning/constants";

export type PorcupinEligibilityResult = {
  wtfBalanceOk: boolean;
  membershipCardOk: boolean;
  duesActiveOk: boolean;
  eligible: boolean;
  wtfBalance: number;
  notes: string[];
};

const WTF_BALANCE_THRESHOLD = 10_000;
export async function checkPorcupinPremiumEligibility(input: {
  walletAddress: string | null;
  hasActiveDues: boolean;
  inventorySkus: string[];
  roles?: string[];
  fetchWtfBalance: (address: string) => Promise<number>;
}): Promise<PorcupinEligibilityResult> {
  const notes: string[] = [];
  let wtfBalanceOk = false;
  let membershipCardOk =
    input.inventorySkus.includes(LEGACY_AUTOPIN_SKU) ||
    input.inventorySkus.includes(PIN_COLLECTOR_SKU) ||
    Boolean(input.roles?.includes(PIN_COLLECTOR_ROLE));
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
    notes.push("WTF Pin Collector Pass required (legacy AutoPin membership still counts).");
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
