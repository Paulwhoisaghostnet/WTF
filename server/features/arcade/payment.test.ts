import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCADE_PLAY_CARD_SKU,
  ARCADE_PLAY_TICKET_SKU,
  getDefaultArcadePlayFeeWtfUnits,
} from "./payment";

test("arcade play scale has locked tier-one anchors", () => {
  const previousUnits = process.env.WTF_ARCADE_PLAY_FEE_UNITS;
  const previousAmount = process.env.WTF_ARCADE_PLAY_FEE_WTF;
  delete process.env.WTF_ARCADE_PLAY_FEE_UNITS;
  delete process.env.WTF_ARCADE_PLAY_FEE_WTF;
  try {
    assert.equal(ARCADE_PLAY_CARD_SKU, "arcade-play-card");
    assert.equal(ARCADE_PLAY_TICKET_SKU, "arcade-play-ticket");
    assert.equal(getDefaultArcadePlayFeeWtfUnits(), "1000000000");
  } finally {
    if (previousUnits === undefined) delete process.env.WTF_ARCADE_PLAY_FEE_UNITS;
    else process.env.WTF_ARCADE_PLAY_FEE_UNITS = previousUnits;
    if (previousAmount === undefined) delete process.env.WTF_ARCADE_PLAY_FEE_WTF;
    else process.env.WTF_ARCADE_PLAY_FEE_WTF = previousAmount;
  }
});
