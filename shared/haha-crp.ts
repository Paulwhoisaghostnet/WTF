/** HAHA's horse-trading community awards, separate from official Tezos Commons CRP. */
export type HahaCrpCategory = { id: string; label: string; description: string };

export const HAHA_CRP_CATEGORIES: readonly HahaCrpCategory[] = [
  { id: "trailblazer-trader", label: "Trailblazer Trader", description: "A rider who makes generous, memorable horse trades." },
  { id: "horse-artist", label: "Horse Artist", description: "An artist whose equine mints give the trading trail its character." },
  { id: "gift-horse", label: "Gift Horse Giver", description: "Someone who shares horse art without asking for a return ride." },
  { id: "return-ride", label: "Return Ride Champion", description: "A trader who reliably returns the favor and keeps the circle moving." },
  { id: "stable-steward", label: "Stable Steward", description: "A trustworthy keeper of horses, listings, and fair exchanges." },
  { id: "marshal-eye", label: "Marshal’s Eye", description: "A careful inspector who helps other riders judge a horse's papers." },
  { id: "posse-wrangler", label: "Posse Wrangler", description: "A connector who brings traders together and welcomes new partners." },
  { id: "first-saddle", label: "First Saddle Guide", description: "A patient guide who helps a new trader make their first ride." },
  { id: "neighvember-storyteller", label: "Neighvember Storyteller", description: "A voice that shares horse art and the trading season with Tezos." },
  { id: "haha-heart", label: "Heart of HAHA", description: "Someone whose steady work keeps the Horse Art Horsetrading Association together." },
] as const;

export const HAHA_CRP_CURRENT_SEASON = {
  key: "current-2026",
  label: "Neighvember 2026",
  startsAt: "2026-11-01T00:00:00.000Z",
  endsAt: null as string | null,
  status: "open" as const,
};

export const HAHA_CRP_PRIZES = {
  first: { horse: 300, xtz: 9 },
  runnerUp: { horse: 150, xtz: 3 },
} as const;
