import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readConfig, verifyNetwork, readChainConfiguration } from "./config.mts";

dotenv.config({ path: process.env.WTF_ALEATORY_ENV_FILE, quiet: true });
const config = await verifyNetwork(readConfig());
const chain = await readChainConfiguration(config);
const provider = await import("../vendor/provider/provider.mts");
const generators = config.provider ? await provider.generatorsServed() : [];
const pending = [];
for (const generator of generators) {
  pending.push({ generator, sampledPending: (await provider.pendingIn(generator)).map((piece) => piece.tokenId) });
}
let daemon = null;
try { daemon = JSON.parse(await readFile(join(config.stateDir, "health.json"), "utf8")); } catch {}
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  network: config.network,
  chainId: config.chainId,
  rpcUrl: config.rpcUrl,
  router: config.router,
  registry: config.registry,
  provider: config.provider,
  registered: chain.registered,
  onchainProvider: chain.provider,
  factories: chain.router.factories,
  pending,
  daemon,
  note: "Read-only chain and queue check. Pending arrays follow upstream batch sampling; this does not render, pin, sign, or prove completed delivery.",
}, null, 2));
