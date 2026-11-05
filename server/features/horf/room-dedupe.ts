export interface RoomHorseLeg {
  operationHash?: string | null;
  from: string;
  to: string;
  amount: string | number;
  tokenContract: string;
  tokenId: string;
}

function legKey(leg: RoomHorseLeg): string | null {
  if (!leg.operationHash || String(leg.amount) !== "1") return null;
  return [leg.operationHash, leg.from, leg.to, leg.tokenContract, leg.tokenId].join("\u0000");
}

/** An Objkt wallet-to-wallet input transfer and its V3 swap event are one send. */
export function withoutRoomSwapInputDuplicates<T>(
  direct: readonly T[], roomInputs: readonly RoomHorseLeg[], readLeg: (row: T) => RoomHorseLeg,
): T[] {
  const remaining = new Map<string, number>();
  for (const input of roomInputs) {
    const key = legKey(input);
    if (key) remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return direct.filter((row) => {
    const key = legKey(readLeg(row));
    if (!key) return true;
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
}
