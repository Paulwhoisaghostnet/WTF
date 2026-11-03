export type HorfMintSeason = {
  key: string;
  label: string;
  startsAt: string;
  endsAt: string | null;
};

export function findHorfMintSeason(
  token: { mintedAt?: string | null },
  seasons: HorfMintSeason[],
): HorfMintSeason | null {
  if (!token.mintedAt) return null;
  const minted = Date.parse(token.mintedAt);
  if (!Number.isFinite(minted)) return null;
  return seasons.find((season) => {
    if (season.key === "all-time" || season.key === "all-seasons" || season.key === "all-horse-search") return false;
    const start = Date.parse(season.startsAt);
    const end = season.endsAt ? Date.parse(season.endsAt) : Infinity;
    return Number.isFinite(start) && minted >= start && minted < end;
  }) ?? null;
}
