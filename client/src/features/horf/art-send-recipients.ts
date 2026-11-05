import { toNatString } from "../../lib/tezos/nat";
import { assertTraderAddress } from "./recipient-input";

export type ArtSendRecipient = { address: string; amount: string };

/** Keep the displayed edition allocation and the FA2 batch identical. */
export function validateArtSendRecipients(
  rows: ArtSendRecipient[],
  sender: string,
  ownedBalance: string,
): { recipients: Array<{ address: string; amountRaw: string }>; total: string } {
  if (!rows.length) throw new Error("Add at least one trader.");
  const from = assertTraderAddress(sender);
  const seen = new Set<string>();
  let total = 0n;
  const recipients = rows.map((row) => {
    const address = assertTraderAddress(row.address);
    if (address === from) throw new Error("Choose another trader’s wallet for this horse.");
    if (seen.has(address)) throw new Error(`Rider ${address} appears more than once.`);
    seen.add(address);
    const amountRaw = toNatString(row.amount);
    if (amountRaw === "0") throw new Error("Give every rider at least one horse edition.");
    total += BigInt(amountRaw);
    return { address, amountRaw };
  });
  const owned = BigInt(toNatString(ownedBalance));
  if (total > owned) {
    throw new Error(`You assigned ${total} editions but this wallet owns ${owned}. Reduce the send before signing.`);
  }
  return { recipients, total: total.toString() };
}
