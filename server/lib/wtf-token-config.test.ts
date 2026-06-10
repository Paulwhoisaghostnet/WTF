import assert from "node:assert/strict";
import test from "node:test";
import { WTF_TOKEN } from "@shared/types";
import { getServerWtfToken } from "./wtf-token-config";

const SHADOWNET_WTF = "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj";

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

test("server WTF token config defaults to the mainnet WTF token", () => {
  const previousContract = process.env.WTF_TOKEN_CONTRACT;
  const previousViteContract = process.env.VITE_WTF_TOKEN_CONTRACT;
  const previousTokenId = process.env.WTF_TOKEN_ID;
  const previousViteTokenId = process.env.VITE_WTF_TOKEN_ID;
  try {
    delete process.env.WTF_TOKEN_CONTRACT;
    delete process.env.VITE_WTF_TOKEN_CONTRACT;
    delete process.env.WTF_TOKEN_ID;
    delete process.env.VITE_WTF_TOKEN_ID;

    const token = getServerWtfToken();
    assert.equal(token.contract, WTF_TOKEN.contract);
    assert.equal(token.tokenId, WTF_TOKEN.tokenId);
  } finally {
    restoreEnv("WTF_TOKEN_CONTRACT", previousContract);
    restoreEnv("VITE_WTF_TOKEN_CONTRACT", previousViteContract);
    restoreEnv("WTF_TOKEN_ID", previousTokenId);
    restoreEnv("VITE_WTF_TOKEN_ID", previousViteTokenId);
  }
});

test("server WTF token config can point local app flows at Shadownet WTF", () => {
  const previousContract = process.env.WTF_TOKEN_CONTRACT;
  const previousTokenId = process.env.WTF_TOKEN_ID;
  try {
    process.env.WTF_TOKEN_CONTRACT = SHADOWNET_WTF;
    process.env.WTF_TOKEN_ID = "0";

    const token = getServerWtfToken();
    assert.equal(token.contract, SHADOWNET_WTF);
    assert.equal(token.tokenId, 0);
    assert.equal(token.symbol, WTF_TOKEN.symbol);
  } finally {
    restoreEnv("WTF_TOKEN_CONTRACT", previousContract);
    restoreEnv("WTF_TOKEN_ID", previousTokenId);
  }
});
