import "dotenv/config";
import keyringModule from "../../extensions/wtf-operator-signer/src/keyring";
import { buildPuppetKeyringEnv, packedUtf8StringBody, readPuppetCredentials } from "../e2e/puppets/runtime.mjs";

const { PlatformWalletKeyring } = keyringModule as any;

const BASE = process.env.PROBE_BASE || "https://wtfos.app";

function parseSetCookie(headers: Headers, jar: Map<string, string>) {
  // Node fetch exposes getSetCookie() in undici
  const anyHeaders = headers as any;
  const cookies: string[] = typeof anyHeaders.getSetCookie === "function" ? anyHeaders.getSetCookie() : [];
  for (const c of cookies) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

function cookieHeader(jar: Map<string, string>) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function loginActor(actor: any) {
  const jar = new Map<string, string>();
  const chRes = await fetch(`${BASE}/api/auth/wallet/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: actor.walletAddress, action: "login" }),
  });
  parseSetCookie(chRes.headers, jar);
  const challenge = await chRes.json();
  const message = challenge.message;
  const keyring = new PlatformWalletKeyring(await buildPuppetKeyringEnv());
  const { wallet, signer } = await keyring.getSigner(actor.walletId);
  const signed = await signer.sign(packedUtf8StringBody(message), new Uint8Array([0x05]));
  const publicKey = wallet.publicKey || (await signer.publicKey());
  const signature = signed.prefixSig || signed.sig;
  const verRes = await fetch(`${BASE}/api/auth/wallet/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(jar) },
    body: JSON.stringify({ walletAddress: actor.walletAddress, publicKey, signature, nonce: challenge.nonce }),
  });
  parseSetCookie(verRes.headers, jar);
  const verJson = await verRes.json().catch(() => ({}));
  const meRes = await fetch(`${BASE}/api/auth/user`, { headers: { Cookie: cookieHeader(jar) } });
  const me = await meRes.json().catch(() => ({}));
  return { action: verJson.action, verHttp: verRes.status, meHttp: meRes.status, username: me.username, role: me.role };
}

async function main() {
  const creds = await readPuppetCredentials();
  if ((process.env.PROBE_ACTOR || "").toUpperCase() === "ALL") {
    for (const a of creds.actors) {
      try {
        const r = await loginActor(a);
        console.log(`${a.id.padEnd(16)} role=${String(a.role).padEnd(16)} action=${String(r.action).padEnd(9)} me=${r.meHttp} ${r.username ?? ""}`);
      } catch (e) {
        console.log(`${a.id.padEnd(16)} ERROR ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return;
  }
  const actorId = process.env.PROBE_ACTOR || "bert";
  const actor = creds.actors.find((a: any) => a.id === actorId);
  if (!actor) throw new Error(`no actor ${actorId}`);
  const jar = new Map<string, string>();

  const chRes = await fetch(`${BASE}/api/auth/wallet/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: actor.walletAddress, action: "login" }),
  });
  parseSetCookie(chRes.headers, jar);
  const challenge = await chRes.json();
  console.log("challenge HTTP", chRes.status, "nonce?", Boolean(challenge.nonce));

  const message = challenge.message;
  const keyring = new PlatformWalletKeyring(await buildPuppetKeyringEnv());
  const { wallet, signer } = await keyring.getSigner(actor.walletId);
  const signed = await signer.sign(packedUtf8StringBody(message), new Uint8Array([0x05]));
  const publicKey = wallet.publicKey || (await signer.publicKey());
  const signature = signed.prefixSig || signed.sig;

  const verRes = await fetch(`${BASE}/api/auth/wallet/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(jar) },
    body: JSON.stringify({ walletAddress: actor.walletAddress, publicKey, signature, nonce: challenge.nonce }),
  });
  parseSetCookie(verRes.headers, jar);
  const verJson = await verRes.json().catch(() => ({}));
  console.log("verify HTTP", verRes.status, "action:", verJson.action, "user:", verJson.user?.username, "role:", verJson.user?.role);

  const meRes = await fetch(`${BASE}/api/auth/user`, { headers: { Cookie: cookieHeader(jar) } });
  const me = await meRes.json().catch(() => ({}));
  console.log("me HTTP", meRes.status, "username:", me.username, "role:", me.role, "id:", me.id);

  const metricsRes = await fetch(`${BASE}/api/metrics`, { headers: { Cookie: cookieHeader(jar) } });
  const metricsText = await metricsRes.text();
  console.log("metrics HTTP", metricsRes.status, "len:", metricsText.length);
  if (metricsRes.ok) {
    try {
      const m = JSON.parse(metricsText);
      console.log("metrics keys:", Object.keys(m));
      console.log("eventLoop:", JSON.stringify(m.eventLoop || m.eventLoopDelay || null));
      console.log("dbPool:", JSON.stringify(m.dbPool || null));
      console.log("websocket:", JSON.stringify(m.websocket || null));
    } catch {
      console.log("metrics body (first 300):", metricsText.slice(0, 300));
    }
  } else {
    console.log("metrics body (first 200):", metricsText.slice(0, 200));
  }
}

main().catch((e) => {
  console.error("PROBE ERROR:", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
