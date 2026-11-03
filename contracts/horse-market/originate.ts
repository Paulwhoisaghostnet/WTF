import plan from "./plan/origination.json";
import codeText from "./artifacts/contract.json?raw";
import contractTzText from "./artifacts/contract.tz?raw";
import fixtureText from "./artifacts/storage.fixture.json?raw";
import sourceText from "./HorseMarket.py?raw";
import manifest from "./artifacts/build-manifest.json";
import { assertNetworkReadyForSend } from "../../client/src/lib/tezos/preflight";
import { connectWallet, getTezos } from "../../client/src/lib/tezos/wallet";

const MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
const ADMIN = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const STABLES_ORACLE = "edpkvZL5ek6Njb9RWQVtnUMkV2HJQtNFsycFdrgDjTnshrsXmzEzVy";
const HORSE_CONTRACT = "KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM";
const RPC = `${window.location.origin}/horf-mainnet-rpc`;
const connectButton = document.getElementById("connect") as HTMLButtonElement;
const originateButton = document.getElementById("originate") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;
const codeHash = document.getElementById("code-hash") as HTMLElement;
const oracleKey = document.getElementById("oracle-key") as HTMLElement;
const horseContract = document.getElementById("horse-contract") as HTMLElement;
const HASH_KEY = "horf:horse-market-origination-hash";
const ADDRESS_KEY = "horf:horse-market-contract-address";
const previousHash = sessionStorage.getItem(HASH_KEY);
if (previousHash && !/^o[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(previousHash)) {
  sessionStorage.removeItem(HASH_KEY);
}
const storedHash = sessionStorage.getItem(HASH_KEY);
let submitted = Boolean(storedHash);
let connected = false;

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function findStorageField(type: any, value: any, annotation: string): string | null {
  if (type?.annots?.includes(annotation)) return value?.string ?? null;
  if (type?.prim !== "pair" || !Array.isArray(type.args) || !Array.isArray(value?.args)) return null;
  for (let i = 0; i < type.args.length; i++) {
    const found = findStorageField(type.args[i], value.args[i], annotation);
    if (found !== null) return found;
  }
  return null;
}

function replaceStorageFields(type: any, value: any, found: Record<string, number>) {
  for (const [annotation, replacement] of [
    ["%admin", ADMIN],
    ["%oracle_key", STABLES_ORACLE],
    ["%horse_contract", HORSE_CONTRACT],
  ] as const) {
    if (type?.annots?.includes(annotation)) {
      value.string = replacement;
      found[annotation] += 1;
    }
  }
  if (type?.prim === "pair") {
    if (!Array.isArray(type.args) || !Array.isArray(value?.args) || type.args.length !== value.args.length) {
      throw new Error("Compiled storage and fixture layout differ.");
    }
    type.args.forEach((child: any, index: number) => replaceStorageFields(child, value.args[index], found));
  }
}

async function verifyPlan() {
  if (plan.network !== "tezos-mainnet" || plan.chainId !== MAINNET_CHAIN_ID ||
      plan.admin !== ADMIN || plan.oraclePublicKey !== STABLES_ORACLE ||
      plan.horseContract !== HORSE_CONTRACT || plan.horseTokenId !== 0 ||
      plan.source !== "artifacts/contract.json" ||
      manifest.network !== "mainnet" || manifest.chainId !== MAINNET_CHAIN_ID ||
      manifest.protocol !== "tallinn" ||
      plan.contractJsonSha256 !== manifest.contractJsonSha256 ||
      plan.contractTzSha256 !== manifest.contractTzSha256 ||
      plan.sourceSha256 !== manifest.sourceSha256 ||
      plan.storageFixtureSha256 !== manifest.storageFixtureSha256) {
    throw new Error("The Market plan differs from the reviewed Mainnet admin, oracle, HORSE token, or build.");
  }
  const encoder = new TextEncoder();
  if (await sha256(encoder.encode(codeText)) !== manifest.contractJsonSha256 ||
      await sha256(encoder.encode(contractTzText)) !== manifest.contractTzSha256 ||
      await sha256(encoder.encode(fixtureText)) !== manifest.storageFixtureSha256 ||
      await sha256(encoder.encode(sourceText)) !== manifest.sourceSha256) {
    throw new Error("Market source or compiled artifact differs from the reviewed build manifest.");
  }
  const code = JSON.parse(codeText);
  const storageType = code.find((section: any) => section.prim === "storage")?.args?.[0];
  if (!storageType) throw new Error("Market storage type is missing.");
  const expectedStorage = JSON.parse(fixtureText);
  const found = { "%admin": 0, "%oracle_key": 0, "%horse_contract": 0 };
  replaceStorageFields(storageType, expectedStorage, found);
  if (Object.values(found).some((count) => count !== 1) ||
      findStorageField(storageType, plan.storage, "%admin") !== ADMIN ||
      findStorageField(storageType, plan.storage, "%oracle_key") !== STABLES_ORACLE ||
      findStorageField(storageType, plan.storage, "%horse_contract") !== HORSE_CONTRACT ||
      JSON.stringify(expectedStorage) !== JSON.stringify(plan.storage)) {
    throw new Error("Market initial storage does not match the reviewed admin, oracle, and HORSE currency.");
  }
  const tezos = await getTezos({ network: "mainnet", rpcUrl: RPC });
  if (await tezos.rpc.getChainId() !== MAINNET_CHAIN_ID) throw new Error("RPC is not Tezos Mainnet.");
  return { tezos, code };
}

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  setStatus("Checking Market code and connecting Kukai…");
  try {
    await verifyPlan();
    const wallet = await connectWallet({ network: "mainnet", rpcUrl: RPC });
    if (wallet.address !== ADMIN) throw new Error(`Selected ${wallet.address}; choose wtf.tez ${ADMIN}.`);
    await assertNetworkReadyForSend(ADMIN, { network: "mainnet", rpcUrl: RPC });
    connected = true;
    originateButton.disabled = submitted;
    setStatus(submitted
      ? `A Market operation was already submitted: ${storedHash}. Check it on TzKT before trying again.`
      : "wtf.tez is connected on Mainnet. Review the contract and request the Kukai signature when ready.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    connectButton.disabled = false;
  }
});

originateButton.addEventListener("click", async () => {
  if (!connected || submitted) return;
  originateButton.disabled = true;
  setStatus("Rechecking Tezos Mainnet before opening Kukai…");
  try {
    const { tezos, code } = await verifyPlan();
    await assertNetworkReadyForSend(ADMIN, { network: "mainnet", rpcUrl: RPC });
    const operation = await tezos.wallet.originate({ code, init: plan.storage } as never).send();
    if (!/^o[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(operation.opHash)) {
      throw new Error("Wallet returned no valid Tezos operation hash. Check Kukai before retrying.");
    }
    submitted = true;
    sessionStorage.setItem(HASH_KEY, operation.opHash);
    setStatus(`Kukai submitted ${operation.opHash}. Waiting for confirmation…`);
    await operation.confirmation(1);
    const contract = await operation.contract();
    if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(contract.address)) {
      throw new Error("Confirmed operation returned no valid contract address. Check the operation on TzKT.");
    }
    sessionStorage.setItem(ADDRESS_KEY, contract.address);
    setStatus(`Horf HORSE Market originated: ${contract.address}. Operation ${operation.opHash}. Verify code, admin, oracle, and HORSE currency on TzKT before enabling paid listings.`);
  } catch (error) {
    setStatus(`${error instanceof Error ? error.message : String(error)}${submitted ? " A transaction was submitted; check TzKT before retrying." : ""}`, true);
    if (!submitted) originateButton.disabled = false;
  }
});

codeHash.textContent = plan.contractJsonSha256;
oracleKey.textContent = plan.oraclePublicKey;
horseContract.textContent = plan.horseContract;
void verifyPlan().then(() => setStatus(submitted
  ? `A Market operation was already submitted: ${storedHash}. Check it on TzKT before trying again.`
  : "Compiled code, initial storage, and Mainnet RPC verified. Connect wtf.tez in Kukai."
)).catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
