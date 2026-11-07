import { findHorfMintSeason, type HorfMintSeason } from "./mint-season";

type OwnedHorseOption = {
  contract: string;
  tokenId: string;
  name?: string | null;
  balance: string;
  creatorAddress?: string | null;
  mintedAt?: string | null;
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
export function HorfOwnedHorseOptions({ horses, address, prioritySeasonKey, priorityReceivedHorseKeys = [], seasons = [] }: {
  horses: readonly OwnedHorseOption[];
  address: string | null;
  prioritySeasonKey?: string | null;
  priorityReceivedHorseKeys?: readonly string[];
  seasons?: HorfMintSeason[];
}) {
  const groups = groupHorfOwnedHorseOptions(horses, address);
  const requestedSeason = seasons.find((season) => season.key === prioritySeasonKey &&
    !["all-time", "all-seasons", "all-horse-search"].includes(season.key));
  const now = Date.now();
  const requestedStart = requestedSeason ? Date.parse(requestedSeason.startsAt) : Number.NaN;
  const nextSeasonStart = requestedSeason ? seasons.reduce<number | null>((earliest, season) => {
    const start = Date.parse(season.startsAt);
    return Number.isFinite(start) && start > requestedStart && (earliest == null || start < earliest) ? start : earliest;
  }, null) : null;
  const requestedEnd = requestedSeason?.endsAt ? Date.parse(requestedSeason.endsAt) : nextSeasonStart;
  const selectedSeason = requestedSeason && Number.isFinite(requestedStart) && requestedStart <= now &&
    Number.isFinite(requestedEnd) && requestedEnd! <= now ? requestedSeason : null;
  const inSelectedSeason = (horse: OwnedHorseOption) => Boolean(selectedSeason &&
    findHorfMintSeason(horse, seasons)?.key === selectedSeason.key);
  const receivedInSelectedSeason = new Set(priorityReceivedHorseKeys);
  const selectedReceived = [
    ...groups.received.filter((horse) => inSelectedSeason(horse) || receivedInSelectedSeason.has(`${horse.contract}:${horse.tokenId}`)),
    ...groups.unknown.filter((horse) => receivedInSelectedSeason.has(`${horse.contract}:${horse.tokenId}`)),
  ];
  const selectedReceivedKeys = new Set(selectedReceived.map((horse) => `${horse.contract}:${horse.tokenId}`));
  const render = (label: string, items: OwnedHorseOption[]) => items.length > 0 && <optgroup key={label} label={label}>
    {items.map((horse) => {
      const mintSeason = findHorfMintSeason(horse, seasons);
      return <option key={`${horse.contract}:${horse.tokenId}`} value={`${horse.contract}:${horse.tokenId}`}>
        {horse.name || "Horse token"} · #{horse.tokenId} · {horse.balance} owned{mintSeason ? ` · ${mintSeason.label}` : ""}
      </option>;
    })}
  </optgroup>;
  return <>
    {selectedSeason && <>
      {render(`Created in ${selectedSeason.label}`, groups.created.filter(inSelectedSeason))}
      {render(`Received in ${selectedSeason.label}`, selectedReceived)}
      {render(`Creator unknown · ${selectedSeason.label}`, groups.unknown.filter((horse) =>
        inSelectedSeason(horse) && !receivedInSelectedSeason.has(`${horse.contract}:${horse.tokenId}`)))}
    </>}
    {render(selectedSeason ? "Created in other seasons" : "Created by you", selectedSeason ? groups.created.filter((horse) => !inSelectedSeason(horse)) : groups.created)}
    {render(selectedSeason ? "Received in other seasons" : "Received horses", selectedSeason ? groups.received.filter((horse) =>
      !selectedReceivedKeys.has(`${horse.contract}:${horse.tokenId}`)) : groups.received)}
    {render("Creator not listed", selectedSeason ? groups.unknown.filter((horse) =>
      !inSelectedSeason(horse) && !selectedReceivedKeys.has(`${horse.contract}:${horse.tokenId}`)) : groups.unknown)}
  </>;
}
