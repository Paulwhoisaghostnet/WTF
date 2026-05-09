export const GUINEA_PIG_RACEWAY_ASSET_ROOT =
  "/games/casino/guinea-pig-raceway/assets";

export const GUINEA_PIG_RACEWAY_ASSET_MANIFEST_PATH =
  `${GUINEA_PIG_RACEWAY_ASSET_ROOT}/manifest.json`;

export const GUINEA_PIG_RACEWAY_REQUIRED_ANIMATIONS = [
  "idle",
  "take_marks",
  "sprint",
  "stumble",
  "nibble",
  "cheer",
  "victory",
  "loss",
] as const;

export const GUINEA_PIG_RACEWAY_REQUIRED_RIG_NODES = [
  "root",
  "body",
  "head",
  "left_ear",
  "right_ear",
  "left_eye",
  "right_eye",
  "nose",
  "front_left_paw",
  "front_right_paw",
  "back_left_paw",
  "back_right_paw",
] as const;
