import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCADE_PLAY_TICKET_SKU,
  getArcadePaymentConfig,
  getArcadePlayFeeWtfUnits,
} from "./payment";

test("arcade play fee defaults to one WTF in raw units", () => {
  const previousUnits = process.env.WTF_ARCADE_PLAY_FEE_UNITS;
  const previousAmount = process.env.WTF_ARCADE_PLAY_FEE_WTF;
  delete process.env.WTF_ARCADE_PLAY_FEE_UNITS;
  delete process.env.WTF_ARCADE_PLAY_FEE_WTF;
  try {
    assert.equal(getArcadePlayFeeWtfUnits(), "100000000");
    const config = getArcadePaymentConfig();
    assert.equal(config.sku, ARCADE_PLAY_TICKET_SKU);
    assert.equal(config.routerListingId, 0);
  } finally {
    if (previousUnits === undefined) delete process.env.WTF_ARCADE_PLAY_FEE_UNITS;
    else process.env.WTF_ARCADE_PLAY_FEE_UNITS = previousUnits;
    if (previousAmount === undefined) delete process.env.WTF_ARCADE_PLAY_FEE_WTF;
    else process.env.WTF_ARCADE_PLAY_FEE_WTF = previousAmount;
  }
});
