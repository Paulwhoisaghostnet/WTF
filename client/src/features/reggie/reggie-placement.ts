export const REGGIE_SPRITE_WIDTH = 72;
export const REGGIE_SPRITE_HEIGHT = 50;
export const REGGIE_BUBBLE_WIDTH = 300;
export const REGGIE_BUBBLE_MAX_HEIGHT = 320;

const EDGE_GAP = 12;
const GUIDE_GAP = 16;

export type ReggieBubbleSide = "left" | "right";

export type ReggieViewport = {
  width: number;
  height: number;
};

export type ReggieAnchorRect = {
  left: number;
  right: number;
  top: number;
  height: number;
};

export type ReggiePlacement = {
  x: number;
  y: number;
  bubbleSide: ReggieBubbleSide;
};

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function fitsBubbleOnSide(side: ReggieBubbleSide, spriteX: number, viewport: ReggieViewport) {
  return side === "right"
    ? spriteX + REGGIE_SPRITE_WIDTH + GUIDE_GAP + REGGIE_BUBBLE_WIDTH <= viewport.width - EDGE_GAP
    : spriteX - GUIDE_GAP - REGGIE_BUBBLE_WIDTH >= EDGE_GAP;
}

/**
 * Keep the sprite beside the guided control and point the speech bubble away
 * from it. The vertical clamp reserves room for the whole bubble, so a tour
 * target at a screen edge cannot clip its instructions.
 */
export function placementForAnchor(
  anchor: ReggieAnchorRect,
  viewport: ReggieViewport
): ReggiePlacement {
  const preferRight = anchor.left + (anchor.right - anchor.left) / 2 < viewport.width / 2;
  let bubbleSide: ReggieBubbleSide = preferRight ? "right" : "left";
  let x = bubbleSide === "right"
    ? anchor.right + GUIDE_GAP
    : anchor.left - REGGIE_SPRITE_WIDTH - GUIDE_GAP;

  if (!fitsBubbleOnSide(bubbleSide, x, viewport)) {
    bubbleSide = bubbleSide === "right" ? "left" : "right";
    x = bubbleSide === "right"
      ? anchor.right + GUIDE_GAP
      : anchor.left - REGGIE_SPRITE_WIDTH - GUIDE_GAP;
  }

  const centeredY = anchor.top + anchor.height / 2 - REGGIE_SPRITE_HEIGHT / 2;
  return {
    x: clamp(x, EDGE_GAP, viewport.width - REGGIE_SPRITE_WIDTH - EDGE_GAP),
    y: clamp(
      centeredY,
      EDGE_GAP + REGGIE_BUBBLE_MAX_HEIGHT / 2 - REGGIE_SPRITE_HEIGHT / 2,
      viewport.height - EDGE_GAP - REGGIE_BUBBLE_MAX_HEIGHT / 2 - REGGIE_SPRITE_HEIGHT / 2
    ),
    bubbleSide,
  };
}

export function homePlacement(viewport: ReggieViewport): ReggiePlacement {
  return {
    x: viewport.width - REGGIE_SPRITE_WIDTH - 28,
    y: clamp(
      viewport.height - REGGIE_SPRITE_HEIGHT - 72,
      EDGE_GAP + REGGIE_BUBBLE_MAX_HEIGHT / 2 - REGGIE_SPRITE_HEIGHT / 2,
      viewport.height - EDGE_GAP - REGGIE_BUBBLE_MAX_HEIGHT / 2 - REGGIE_SPRITE_HEIGHT / 2
    ),
    bubbleSide: "left",
  };
}
