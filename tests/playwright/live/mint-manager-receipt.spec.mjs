import "dotenv/config";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { actorById, readPuppetCredentials } from "../../e2e/puppets/runtime.mjs";

const { Pool } = pg;
const SHADOWNET_MINT = {
  opHash: "oomCgp54okowgvWTc8fD4AkbaVYnj2Kch6NtxmknWz4UQjXA3NL",
  wallet: "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM",
  contract: "KT1Ww8CpKRS5ffVd51vWNxJ6EBxEhCj7BhtN",
  tokenId: "0",
  amount: "2",
  artifactUri: "ipfs://bafkreigcitl2l4j6wfi5f3gkmqfixplp3s477p6so4b3tu46ipidxtdchm",
};

async function login(baseURL, playwright, actor) {
  const request = await playwright.request.newContext({ baseURL });
  const response = await request.post("/api/auth/login", {
    data: { username: actor.username, password: actor.password },
  });
  expect(response.ok(), `login ${actor.username}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return request;
}

async function csrfHeaders(request) {
  const response = await request.get("/api/auth/csrf-token");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.csrfToken).toBeTruthy();
  return { "X-CSRF-Token": payload.csrfToken };
}

test("linked creator persists and privately recovers an idempotent Shadownet mint receipt", async ({ playwright, baseURL }) => {
  test.setTimeout(120_000);
  const credentials = await readPuppetCredentials();
  const creator = actorById(credentials, "cookiemonster");
  const outsider = actorById(credentials, "bert");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let mediaItemId;
  let receiptId;
  let priorWalletOwner = null;
  let creatorRequest;
  let outsiderRequest;

  try {
    const existingWallet = await pool.query(
      "SELECT id, user_id FROM user_wallets WHERE wallet_address = $1",
      [SHADOWNET_MINT.wallet],
    );
    if (existingWallet.rows[0]) {
      priorWalletOwner = existingWallet.rows[0].user_id;
      await pool.query("UPDATE user_wallets SET user_id = $1 WHERE id = $2", [creator.userId, existingWallet.rows[0].id]);
    } else {
      await pool.query(
        "INSERT INTO user_wallets (user_id, wallet_address, is_primary) VALUES ($1, $2, false)",
        [creator.userId, SHADOWNET_MINT.wallet],
      );
    }

    const media = await pool.query(
      `INSERT INTO user_media_library
        (owner_user_id, owner_wallet, title, description, source_type, source_url, mime_type, media_category, status)
       VALUES ($1, $2, $3, $4, 'ipfs', $5, 'image/png', 'image', 'ready')
       RETURNING id`,
      [creator.userId, SHADOWNET_MINT.wallet, "Fresh Spaghetti Shadownet receipt proof", "Commission presentation mint verified from the UI-LIVE proof", SHADOWNET_MINT.artifactUri],
    );
    mediaItemId = media.rows[0].id;

    creatorRequest = await login(baseURL, playwright, creator);
    outsiderRequest = await login(baseURL, playwright, outsider);
    const verifyPayload = {
      mediaItemId,
      opHash: SHADOWNET_MINT.opHash,
      contract: SHADOWNET_MINT.contract,
      tokenId: SHADOWNET_MINT.tokenId,
      network: "shadownet",
      artifactUri: SHADOWNET_MINT.artifactUri,
    };
    const creatorHeaders = await csrfHeaders(creatorRequest);

    const first = await creatorRequest.post("/api/mint-manager/receipt", { data: verifyPayload, headers: creatorHeaders });
    const firstReceipt = await first.json();
    expect(first.status(), JSON.stringify(firstReceipt)).toBe(200);
    expect(firstReceipt).toMatchObject({
      mediaItemId,
      status: "applied",
      network: "shadownet",
      opHash: SHADOWNET_MINT.opHash,
      minterWallet: SHADOWNET_MINT.wallet,
      contract: SHADOWNET_MINT.contract,
      tokenId: SHADOWNET_MINT.tokenId,
      amount: SHADOWNET_MINT.amount,
      artifactUri: SHADOWNET_MINT.artifactUri,
    });
    expect(firstReceipt.explorerUrl).toBe(`https://shadownet.tzkt.io/${SHADOWNET_MINT.opHash}`);
    expect(firstReceipt.objktUrl).toBeUndefined();
    receiptId = firstReceipt.id;

    const repeated = await creatorRequest.post("/api/mint-manager/receipt", { data: verifyPayload, headers: creatorHeaders });
    expect(repeated.status()).toBe(200);
    expect((await repeated.json()).id).toBe(receiptId);

    const recovered = await creatorRequest.get(`/api/mint-manager/receipts/${mediaItemId}`);
    expect(recovered.status()).toBe(200);
    const recoveredReceipts = await recovered.json();
    expect(recoveredReceipts).toHaveLength(1);
    expect(recoveredReceipts[0]).toMatchObject({ id: receiptId, status: "applied", network: "shadownet" });

    const denied = await outsiderRequest.get(`/api/mint-manager/receipts/${mediaItemId}`);
    expect(denied.status()).toBe(404);

    const persisted = await pool.query(
      `SELECT media_item_id, owner_user_id, network, op_hash, minter_wallet, contract,
              token_id, amount, artifact_uri, status, verified_at
         FROM media_mint_receipts WHERE id = $1`,
      [receiptId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({
      media_item_id: mediaItemId,
      owner_user_id: creator.userId,
      network: "shadownet",
      op_hash: SHADOWNET_MINT.opHash,
      minter_wallet: SHADOWNET_MINT.wallet,
      contract: SHADOWNET_MINT.contract,
      token_id: SHADOWNET_MINT.tokenId,
      amount: SHADOWNET_MINT.amount,
      artifact_uri: SHADOWNET_MINT.artifactUri,
      status: "applied",
    });
    expect(persisted.rows[0].verified_at).toBeTruthy();

    const event = await pool.query(
      "SELECT event_type, user_id, wallet_address, metadata FROM challenge_system_events WHERE event_id = $1",
      [`media.mint_manager.receipt_verified:${receiptId}`],
    );
    expect(event.rows).toHaveLength(1);
    expect(event.rows[0]).toMatchObject({
      event_type: "media.mint_manager.receipt_verified",
      user_id: creator.userId,
      wallet_address: SHADOWNET_MINT.wallet,
    });
    expect(event.rows[0].metadata).toMatchObject({ mediaItemId, network: "shadownet", contract: SHADOWNET_MINT.contract, tokenId: SHADOWNET_MINT.tokenId });
  } finally {
    await creatorRequest?.dispose();
    await outsiderRequest?.dispose();
    if (receiptId) {
      await pool.query("DELETE FROM challenge_system_events WHERE event_id = $1", [`media.mint_manager.receipt_verified:${receiptId}`]);
    }
    if (mediaItemId) await pool.query("DELETE FROM user_media_library WHERE id = $1", [mediaItemId]);
    if (priorWalletOwner === null) {
      await pool.query("DELETE FROM user_wallets WHERE wallet_address = $1 AND user_id = $2", [SHADOWNET_MINT.wallet, creator.userId]);
    } else {
      await pool.query("UPDATE user_wallets SET user_id = $1 WHERE wallet_address = $2", [priorWalletOwner, SHADOWNET_MINT.wallet]);
    }
    await pool.end();
  }
});
