import plan from "./plan/origination.json";
import codeText from "./artifacts/contract.json?raw";
import fixtureText from "./artifacts/storage.fixture.json?raw";
import manifest from "./artifacts/build-manifest.json";
import { assertNetworkReadyForSend } from "../../client/src/lib/tezos/preflight";
import { connectWallet, getTezos } from "../../client/src/lib/tezos/wallet";

const MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
const ADMIN = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const EXPECTED_ORACLE_PUBLIC_KEY = "edpkvZL5ek6Njb9RWQVtnUMkV2HJQtNFsycFdrgDjTnshrsXmzEzVy";
const RPC = `${window.location.origin}/horf-mainnet-rpc`;
const connectButton = document.getElementById("connect") as HTMLButtonElement;
const originateButton = document.getElementById("originate") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;
const codeHash = document.getElementById("code-hash") as HTMLElement;
const oracleKey = document.getElementById("oracle-key") as HTMLElement;
const previousHash = sessionStorage.getItem("horf:stables-origination-hash");
if (previousHash && !/^o[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(previousHash)) {
  sessionStorage.removeItem("horf:stables-origination-hash");
}
const storedHash = sessionStorage.getItem("horf:stables-origination-hash");
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

function replaceStorageFields(type: any, value: any) {
  if (type?.annots?.includes("%admin")) value.string = ADMIN;
  if (type?.annots?.includes("%oracle_key")) value.string = EXPECTED_ORACLE_PUBLIC_KEY;
  if (type?.prim === "pair") {
    if (!Array.isArray(type.args) || !Array.isArray(value?.args) || type.args.length !== value.args.length) {
      throw new Error("Compiled storage and fixture layout differ.");
    }
    type.args.forEach((child: any, index: number) => replaceStorageFields(child, value.args[index]));
  }
}

async function verifyPlan() {
  if (plan.network !== "tezos-mainnet" || plan.chainId !== MAINNET_CHAIN_ID ||
      plan.admin !== ADMIN || plan.source !== "artifacts/contract.json" ||
      plan.oraclePublicKey !== EXPECTED_ORACLE_PUBLIC_KEY ||
      manifest.network !== "mainnet" || manifest.protocol !== "tallinn" ||
      plan.contractJsonSha256 !== manifest.contractJsonSha256) {
    throw new Error("The Stables origination plan does not match the reviewed Mainnet admin and oracle key.");
  }
  if (await sha256(new TextEncoder().encode(codeText)) !== plan.contractJsonSha256) {
    throw new Error("Compiled Stables contract code differs from the reviewed build manifest.");
  }
  if (await sha256(new TextEncoder().encode(fixtureText)) !== manifest.storageFixtureSha256) {
    throw new Error("Stables fixture differs from the reviewed build manifest.");
  }
  const code = JSON.parse(codeText);
  const storageType = code.find((section: any) => section.prim === "storage")?.args?.[0];
  const expectedStorage = JSON.parse(fixtureText);
  replaceStorageFields(storageType, expectedStorage);
  if (!storageType || findStorageField(storageType, plan.storage, "%admin") !== ADMIN ||
      findStorageField(storageType, plan.storage, "%oracle_key") !== plan.oraclePublicKey ||
      JSON.stringify(expectedStorage) !== JSON.stringify(plan.storage)) {
    throw new Error("Stables storage does not contain the reviewed admin and oracle key.");
  }
  const tezos = await getTezos({ network: "mainnet", rpcUrl: RPC });
  if (await tezos.rpc.getChainId() !== MAINNET_CHAIN_ID) throw new Error("RPC is not Tezos Mainnet.");
  return { tezos, code };
}

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  setStatus("Checking Stables code and connecting Kukai…");
  try {
    await verifyPlan();
    const wallet = await connectWallet({ network: "mainnet", rpcUrl: RPC });
    if (wallet.address !== ADMIN) throw new Error(`Selected ${wallet.address}; choose wtf.tez ${ADMIN}.`);
    await assertNetworkReadyForSend(ADMIN, { network: "mainnet", rpcUrl: RPC });
    connected = true;
    originateButton.disabled = submitted;
    setStatus(submitted
      ? `A Stables operation was already submitted: ${storedHash}. Check it on TzKT before trying again.`
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
    sessionStorage.setItem("horf:stables-origination-hash", operation.opHash);
    setStatus(`Kukai submitted ${operation.opHash}. Waiting for confirmation…`);
    await operation.confirmation(1);
    const contract = await operation.contract();
    sessionStorage.setItem("horf:stables-contract-address", contract.address);
    setStatus(`Horf Stables originated: ${contract.address}. Operation ${operation.opHash}. Verify code, admin, and oracle on TzKT before enabling deposits.`);
  } catch (error) {
    setStatus(`${error instanceof Error ? error.message : String(error)}${submitted ? " A transaction was submitted; check TzKT before retrying." : ""}`, true);
    if (!submitted) originateButton.disabled = false;
  }
});

codeHash.textContent = plan.contractJsonSha256;
oracleKey.textContent = plan.oraclePublicKey;
void verifyPlan().then(() => setStatus(submitted
  ? `A Stables operation was already submitted: ${storedHash}. Check it on TzKT before trying again.`
  : "Compiled code, initial storage, and Mainnet RPC verified. Connect wtf.tez in Kukai."
)).catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
