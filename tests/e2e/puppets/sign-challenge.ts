import "dotenv/config";
import keyringModule from "../../../extensions/wtf-operator-signer/src/keyring";
import { buildPuppetKeyringEnv, packedUtf8StringBody } from "./runtime.mjs";

const { PlatformWalletKeyring } = keyringModule as any;

function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const walletId = String(flags["wallet-id"] || "").trim();
  const messageBase64 = String(flags["message-base64"] || "").trim();
  if (!walletId) throw new Error("Missing --wallet-id");
  if (!messageBase64) throw new Error("Missing --message-base64");

  const message = Buffer.from(messageBase64, "base64").toString("utf8");
  const keyring = new PlatformWalletKeyring(await buildPuppetKeyringEnv());
  const { wallet, signer } = await keyring.getSigner(walletId);
  const signed = await signer.sign(packedUtf8StringBody(message), new Uint8Array([0x05]));
  console.log(
    JSON.stringify({
      walletId,
      walletAddress: wallet.address,
      publicKey: wallet.publicKey || (await signer.publicKey()),
      signature: signed.prefixSig || signed.sig,
    })
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
