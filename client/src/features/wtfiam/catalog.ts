import type {
  InAppMarketItem,
  WtfIamCategory,
  WtfIamCategoryKey,
  WtfIamListing,
} from "./types";

export const WTFIAM_CATEGORIES: WtfIamCategory[] = [
  {
    key: "desktop_pet",
    label: "Desktop Pet",
    shortLabel: "Pet",
    monogram: "PET",
    accent: "#18a8a2",
    shadow: "#0b5f62",
  },
  {
    key: "desktop_fun",
    label: "Desktop Items",
    shortLabel: "Desktop",
    monogram: "DSK",
    accent: "#6d8f2f",
    shadow: "#304710",
  },
  {
    key: "system_appearance",
    label: "System Appearance",
    shortLabel: "System",
    monogram: "SYS",
    accent: "#d85f3d",
    shadow: "#7a231a",
  },
  {
    key: "tv",
    label: "WTF TV",
    shortLabel: "TV",
    monogram: "TV",
    accent: "#2f6fdd",
    shadow: "#162f71",
  },
  {
    key: "studio",
    label: "Studio",
    shortLabel: "Studio",
    monogram: "ART",
    accent: "#e0aa2f",
    shadow: "#765012",
  },
  {
    key: "preservation",
    label: "Preservation",
    shortLabel: "Archive",
    monogram: "ARC",
    accent: "#4b9f6a",
    shadow: "#1f5a35",
  },
];

const STAGED_LISTINGS: Record<WtfIamCategoryKey, WtfIamListing[]> = {
  desktop_pet: [
    {
      sku: "pet-signal-biscuit",
      name: "Signal Biscuit",
      description: "A weird little snack for future pet routines.",
      kind: "food",
      category: "desktop_pet",
      source: "staged",
      priceWtfUnits: "1500000000",
      priceWtfFormatted: "15.00",
      priceExp: 150,
      stockQuantity: 0,
      quantityOwned: 0,
      accent: "#18a8a2",
      monogram: "BIS",
    },
  ],
  desktop_fun: [],
  system_appearance: [
    {
      sku: "cursor-aubergine-deluxe",
      name: "Aubergine Cursor Kit",
      description: "A sharper system cursor bundle for desktop appearance.",
      kind: "cursor",
      category: "system_appearance",
      source: "staged",
      priceWtfUnits: "3500000000",
      priceWtfFormatted: "35.00",
      priceExp: 350,
      stockQuantity: 0,
      quantityOwned: 0,
      accent: "#7b3fa1",
      monogram: "CUR",
    },
    {
      sku: "scheme-hotdog-stand",
      name: "Hotdog Stand Scheme",
      description: "A loud system palette for the brave and accountable.",
      kind: "theme",
      category: "system_appearance",
      source: "staged",
      priceWtfUnits: "5000000000",
      priceWtfFormatted: "50.00",
      priceExp: 500,
      stockQuantity: 0,
      quantityOwned: 0,
      accent: "#d85f3d",
      monogram: "HOT",
    },
    {
      sku: "wallpaper-tv-static",
      name: "TV Static Wallpaper",
      description: "A desktop background cut from late-night signal noise.",
      kind: "wallpaper",
      category: "system_appearance",
      source: "staged",
      priceWtfUnits: "2500000000",
      priceWtfFormatted: "25.00",
      priceExp: 250,
      stockQuantity: 0,
      quantityOwned: 0,
      accent: "#2f6fdd",
      monogram: "WAL",
    },
  ],
  tv: [
    {
      sku: "bumper-ticket",
      name: "Bumper Ticket",
      description: "A future unlock for channel bumper placement.",
      kind: "tv",
      category: "tv",
      source: "staged",
      priceWtfUnits: "10000000000",
      priceWtfFormatted: "100.00",
      priceExp: 1000,
      stockQuantity: 0,
      quantityOwned: 0,
      accent: "#2f6fdd",
      monogram: "BUMP",
    },
  ],
  studio: [
    {
      sku: "studio-render-chip",
      name: "Render Chip",
      description: "A staged Studio utility item for heavier exports.",
      kind: "studio",
      category: "studio",
      source: "staged",
      priceWtfUnits: "7500000000",
      priceWtfFormatted: "75.00",
      priceExp: 750,
      stockQuantity: 0,
      quantityOwned: 0,
      accent: "#e0aa2f",
      monogram: "CHIP",
    },
  ],
  preservation: [
    {
      sku: "artifact-archiver-pass",
      name: "Artifact Archiver Pass",
      description: "Queue owned Tezos token artifacts for preservation through the WTF archive worker.",
      kind: "archive-pass",
      category: "preservation",
      source: "staged",
      priceWtfUnits: "25000000000",
      priceWtfFormatted: "250.00",
      priceExp: 2500,
      stockQuantity: 25,
      quantityOwned: 0,
      accent: "#4b9f6a",
      monogram: "ARC",
      metadata: {
        kind: "archive-pass",
        tool: "wayback-ipfs",
        opens: "/my-gallery",
        entitlement: "token-archive",
      },
    },
  ],
};

export function categoryForKey(key: WtfIamCategoryKey): WtfIamCategory {
  return WTFIAM_CATEGORIES.find((category) => category.key === key) ?? WTFIAM_CATEGORIES[0];
}

export function decorateLiveItem(
  item: InAppMarketItem,
  categoryKey: WtfIamCategoryKey
): WtfIamListing {
  const category = categoryForKey(categoryKey);
  return {
    sku: item.sku,
    name: item.name,
    description: item.description,
    kind: item.kind,
    category: categoryKey,
    source: "live",
    priceWtfUnits: item.priceWtfUnits,
    priceWtfFormatted: item.priceWtfFormatted,
    priceExp: item.priceExp,
    stockQuantity: item.stockQuantity,
    quantityOwned: item.quantityOwned,
    accent: category.accent,
    monogram: String(item.kind || item.sku).slice(0, 4).toUpperCase(),
    metadata: item.metadata,
  };
}

export function buildWtfIamListings(
  categoryKey: WtfIamCategoryKey,
  liveItems: InAppMarketItem[]
): WtfIamListing[] {
  const live = liveItems.map((item) => decorateLiveItem(item, categoryKey));
  const liveSkus = new Set(live.map((item) => item.sku));
  const staged = STAGED_LISTINGS[categoryKey].filter((item) => !liveSkus.has(item.sku));
  return [...live, ...staged];
}
