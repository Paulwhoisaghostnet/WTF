import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTelegramUpdate,
  normalizeWalletAddress,
} from "./normalization";

test("normalizes a FART NOISES channel post into a public digest message", () => {
  const normalized = normalizeTelegramUpdate({
    update_id: 100,
    channel_post: {
      message_id: 4242,
      date: 1_775_000_000,
      chat: {
        id: -1001234567890,
        type: "channel",
        title: "FART NOISES",
        username: "fart_noises",
      },
      text: "tz1abc sold an NFT and the room made a noise.",
    },
  });

  assert.ok(normalized);
  assert.equal(normalized.externalRef, "-1001234567890:4242");
  assert.equal(normalized.sourceKey, "fart_noises");
  assert.equal(normalized.kind, "fart_noise");
  assert.equal(normalized.publicLink, "https://t.me/fart_noises/4242");
  assert.equal(normalized.summary, "tz1abc sold an NFT and the room made a noise.");
});

test("normalizes group messages with caption text and stable source keys", () => {
  const normalized = normalizeTelegramUpdate({
    update_id: 101,
    message: {
      message_id: 9,
      date: 1_775_000_100,
      chat: {
        id: -1009876543210,
        type: "supergroup",
        title: "Tezos Art Chat",
      },
      from: {
        id: 77,
        is_bot: false,
        first_name: "Objkt",
        last_name: "Watcher",
        username: "objktwatcher",
      },
      caption: "  New drop   spotted on Tezos.  ",
    },
  });

  assert.ok(normalized);
  assert.equal(normalized.externalRef, "-1009876543210:9");
  assert.equal(normalized.sourceKey, "tezos_art_chat");
  assert.equal(normalized.authorName, "Objkt Watcher");
  assert.equal(normalized.authorUsername, "objktwatcher");
  assert.equal(normalized.summary, "New drop spotted on Tezos.");
});

test("rejects empty updates and normalizes Tezos wallet addresses", () => {
  assert.equal(normalizeTelegramUpdate({ update_id: 102 }), null);
  assert.equal(
    normalizeWalletAddress(" tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU "),
    "tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU"
  );
  assert.equal(normalizeWalletAddress("not a wallet"), null);
});
