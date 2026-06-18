import keyringModule from "../../extensions/wtf-operator-signer/src/keyring";
import {
  buildPuppetKeyringEnv,
  packedUtf8StringBody,
} from "../e2e/puppets/runtime.mjs";

const { PlatformWalletKeyring } = keyringModule;

function parseSetCookie(headers, jar) {
  const anyHeaders = headers;
  const cookies =
    typeof anyHeaders.getSetCookie === "function" ? anyHeaders.getSetCookie() : [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) {
      jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function jarToPlaywrightCookies(jar, baseUrl) {
  const { hostname, protocol } = new URL(baseUrl);
  const secure = protocol === "https:";
  return [...jar.entries()].map(([name, value]) => ({
    name,
    value,
    domain: hostname,
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
  }));
}

/**
 * Wallet-challenge login for prod puppet actors. Returns cookie jar data
 * compatible with Playwright request/browser contexts.
 */
export async function loginWalletActor(baseUrl, actor) {
  const jar = new Map();
  const chRes = await fetch(`${baseUrl}/api/auth/wallet/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: actor.walletAddress }),
  });
  parseSetCookie(chRes.headers, jar);
  const challenge = await chRes.json();
  if (!challenge?.nonce) {
    throw new Error(`wallet challenge failed for ${actor.username}: HTTP ${chRes.status}`);
  }

  const message = `WTF OS Login\n\nNonce: ${challenge.nonce}`;
  const keyring = new PlatformWalletKeyring(await buildPuppetKeyringEnv());
  const { wallet, signer } = await keyring.getSigner(actor.walletId);
  const signed = await signer.sign(packedUtf8StringBody(message), new Uint8Array([0x05]));
  const publicKey = wallet.publicKey || (await signer.publicKey());
  const signature = signed.prefixSig || signed.sig;

  const verRes = await fetch(`${baseUrl}/api/auth/wallet/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(jar) },
    body: JSON.stringify({
      walletAddress: actor.walletAddress,
      publicKey,
      signature,
      nonce: challenge.nonce,
    }),
  });
  parseSetCookie(verRes.headers, jar);
  if (!verRes.ok) {
    throw new Error(`wallet verify failed for ${actor.username}: HTTP ${verRes.status}`);
  }

  return {
    actor,
    cookieHeader: cookieHeader(jar),
    cookies: jarToPlaywrightCookies(jar, baseUrl),
  };
}
