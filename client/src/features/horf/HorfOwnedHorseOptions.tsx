type OwnedHorseOption = {
  contract: string;
  tokenId: string;
  name?: string | null;
  balance: string;
  creatorAddress?: string | null;
};

export function groupHorfOwnedHorseOptions<T extends OwnedHorseOption>(horses: readonly T[], address: string | null) {
  const created: T[] = [];
  const received: T[] = [];
  const unknown: T[] = [];
  const seen = new Set<string>();
  for (const horse of horses) {
    const key = `${horse.contract}:${horse.tokenId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (address && horse.creatorAddress === address) created.push(horse);
    else if (horse.creatorAddress) received.push(horse);
    else unknown.push(horse);
  }
  return { created, received, unknown };
}

/** Keep exact-token choices in the same order and format throughout Horf. */
export function HorfOwnedHorseOptions({ horses, address }: {
  horses: readonly OwnedHorseOption[];
  address: string | null;
}) {
  const groups = groupHorfOwnedHorseOptions(horses, address);
  return <>
    {([
      ["Created by you", groups.created],
      ["Received horses", groups.received],
      ["Creator not listed", groups.unknown],
    ] as const).map(([label, items]) => items.length > 0 && <optgroup key={label} label={label}>
      {items.map((horse) => <option key={`${horse.contract}:${horse.tokenId}`} value={`${horse.contract}:${horse.tokenId}`}>
        {horse.name || "Horse token"} · #{horse.tokenId} · {horse.balance} owned
      </option>)}
    </optgroup>)}
  </>;
}
