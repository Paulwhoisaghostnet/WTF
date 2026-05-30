/**
 * Hamster-themed emoji / emoticon / sticker set for wtfOS.
 *
 * Each entry has a `char` (Unicode emoji rendered natively) and a `label`
 * shown on hover. Grouped into reactions (message boards / DMs) and
 * stickers (PFP editor canvas stamps).
 */

export interface HamsterEmoji {
  char: string;
  label: string;
}

/** Quick-react hamster emoji for message board reactions and DM inline picker. */
export const HAMSTER_REACTIONS: HamsterEmoji[] = [
  { char: "🐹", label: "Hamster" },
  { char: "🐾", label: "Paw Print" },
  { char: "🧀", label: "Cheese" },
  { char: "🌻", label: "Sunflower" },
  { char: "🌾", label: "Wheat" },
  { char: "🥜", label: "Peanut" },
  { char: "🏃", label: "Hamster Wheel" },
  { char: "🛞", label: "Wheel" },
  { char: "💤", label: "Sleepy Hamster" },
  { char: "🐿️", label: "Chipmunk Cousin" },
  { char: "🥕", label: "Carrot" },
  { char: "🫧", label: "Hamster Bath" },
];

/** Larger sticker set for the PFP canvas editor. Includes reactions + extras. */
export const HAMSTER_STICKERS: HamsterEmoji[] = [
  ...HAMSTER_REACTIONS,
  { char: "🌰", label: "Acorn" },
  { char: "🏠", label: "Hamster House" },
  { char: "🧶", label: "Nesting Yarn" },
  { char: "🎀", label: "Hamster Bow" },
  { char: "🧸", label: "Hamster Plush" },
  { char: "🌈", label: "Rainbow Hamster" },
  { char: "🍎", label: "Apple Treat" },
  { char: "🫘", label: "Seed Stash" },
  { char: "🐁", label: "Tiny Friend" },
  { char: "🧤", label: "Hamster Mitten" },
  { char: "💖", label: "Hamster Love" },
  { char: "🎶", label: "Squeaky Song" },
];

/** Label for the hamster section in picker UIs. */
export const HAMSTER_SECTION_LABEL = "🐹 Hamster Pack";
