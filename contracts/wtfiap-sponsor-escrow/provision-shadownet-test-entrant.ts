/** Create or return one dedicated Shadownet test entrant in the hosted keyring.
 * Run only as the existing signer service user; never print private material.
 */
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { loadEnv } from "../../extensions/wtf-operator-signer/src/env";
import { PlatformWalletKeyring } from "../../extensions/wtf-operator-signer/src/keyring";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Provide the signer environment file.");
  Object.assign(process.env, dotenv.parse(readFileSync(file)));
  const keyring = new PlatformWalletKeyring({ ...loadEnv(), WTF_PLATFORM_KEYRING_CREATE_ENABLED: 1 });
  const id = "wtfiap-sponsor-shadownet-entrant";
  const prior = (await keyring.listPublicWallets()).find(wallet => wallet.id === id);
  const wallet = prior || await keyring.createWallet({ id, label: "coLILseum sponsor Shadownet test entrant",
    role: "testing", network: "shadownet" });
  if (wallet.network !== "shadownet" || wallet.chainId !== "NetXsqzbfFenSTS")
    throw new Error("Test entrant is not on Shadownet.");
  console.log(JSON.stringify({ created: !prior, id: wallet.id, address: wallet.address,
    network: wallet.network, chainId: wallet.chainId }));
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
