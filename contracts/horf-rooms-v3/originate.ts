import plan from "./plan/origination.json";
import codeText from "./artifacts/contract.json?raw";
import fixtureText from "./artifacts/storage.fixture.json?raw";
import manifest from "./artifacts/build-manifest.json";
import { assertNetworkReadyForSend } from "../../client/src/lib/tezos/preflight";
import { connectWallet, getTezos } from "../../client/src/lib/tezos/wallet";

const CHAIN_ID = "NetXdQprcVkpaWU";
const ADMIN = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const V2_STABLES = "KT1Rg7ippRJGrFgKBDCGUyiFG7jKdcU7Dmsg";
const RPC = `${window.location.origin}/horf-mainnet-rpc`;
const connectButton = document.getElementById("connect") as HTMLButtonElement;
const originateButton = document.getElementById("originate") as HTMLButtonElement;
const retireButton = document.getElementById("retire-v2") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;
const codeHash = document.getElementById("code-hash") as HTMLElement;
const oracleKey = document.getElementById("oracle-key") as HTMLElement;
const OP_KEY = "horf:rooms-v3-origination-hash";
const CONTRACT_KEY = "horf:rooms-v3-contract-address";
const RETIRE_KEY = "horf:rooms-v3-v2-epoch-bump-hash";
let submitted = Boolean(sessionStorage.getItem(OP_KEY));
let connected = false;
let retiring = false;

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function substitute(type: any, value: any) {
  if (type?.annots?.includes("%admin")) value.string = ADMIN;
  if (type?.annots?.includes("%oracle_key")) value.string = plan.oraclePublicKey;
  if (type?.prim === "pair") {
    if (!Array.isArray(type.args) || !Array.isArray(value?.args) || type.args.length !== value.args.length) {
      throw new Error("Compiled contract storage layout does not match its fixture.");
    }
    type.args.forEach((child: any, index: number) => substitute(child, value.args[index]));
  }
}

async function verifiedPlan() {
  if (plan.network !== "tezos-mainnet" || plan.chainId !== CHAIN_ID ||
      plan.admin !== ADMIN || plan.source !== "artifacts/contract.json" ||
      manifest.network !== "mainnet" || manifest.protocol !== "tallinn" ||
      plan.contractJsonSha256 !== manifest.contractJsonSha256) {
    throw new Error("The reviewed V3 Mainnet plan does not match the compiled contract.");
  }
  if (await sha256(codeText) !== plan.contractJsonSha256 ||
      await sha256(fixtureText) !== manifest.storageFixtureSha256) {
    throw new Error("V3 contract or storage fixture hash changed since review.");
  }
  const code = JSON.parse(codeText);
  const fixture = JSON.parse(fixtureText);
  const storageType = code.find((item: any) => item.prim === "storage")?.args?.[0];
  if (!storageType) throw new Error("Compiled Michelson storage type missing.");
  substitute(storageType, fixture);
  if (JSON.stringify(fixture) !== JSON.stringify(plan.storage)) {
    throw new Error("V3 storage does not match the reviewed wtf.tez and oracle values.");
  }
  const tezos = await getTezos({ network: "mainnet", rpcUrl: RPC });
  if (await tezos.rpc.getChainId() !== CHAIN_ID) throw new Error("The connected RPC is not Tezos Mainnet.");
  return { tezos, code };
}

function storageLeaves(type: any): any[] {
  return type?.prim === "pair" && Array.isArray(type.args) ? type.args.flatMap(storageLeaves) : [type];
}

async function v2OracleEpoch(tezos: Awaited<ReturnType<typeof getTezos>>): Promise<bigint> {
  const script = await tezos.rpc.getScript(V2_STABLES);
  const storageType = script.code.find((part: any) => part.prim === "storage")?.args?.[0];
  const index = storageLeaves(storageType).findIndex((field) => field?.annots?.includes("%oracle_epoch"));
  const storage = await tezos.rpc.getStorage(V2_STABLES) as { args?: Array<{ int?: string }> };
  const value = index >= 0 ? storage.args?.[index]?.int : null;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("The old V2 Stable oracle epoch could not be verified on Mainnet.");
  }
  return BigInt(value);
}

async function assertV3Live(): Promise<void> {
  const expected = sessionStorage.getItem(CONTRACT_KEY);
  if (!expected || !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(expected)) {
    throw new Error("Confirm the new V3 contract address before invalidating V2 permits.");
  }
  const response = await fetch(`${window.location.origin}/horf-production-api/api/horf/rooms`,
    { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error("The public Horf V3 status is unavailable; wait for deployment.");
  const live = await response.json() as { contractAddress?: string; status?: string; permitReady?: boolean };
  if (live.contractAddress !== expected || live.status !== "ready" || live.permitReady !== true) {
    throw new Error("The public Horf app has not switched to this V3 contract with a ready oracle.");
  }
}

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  setStatus("Checking V3 code and connecting wtf.tez…");
  try {
    await verifiedPlan();
    const wallet = await connectWallet({ network: "mainnet", rpcUrl: RPC });
    if (wallet.address !== ADMIN) throw new Error(`Selected ${wallet.address}; choose wtf.tez ${ADMIN}.`);
    await assertNetworkReadyForSend(ADMIN, { network: "mainnet", rpcUrl: RPC });
    connected = true;
    originateButton.disabled = submitted;
    retireButton.disabled = !sessionStorage.getItem(CONTRACT_KEY) || Boolean(sessionStorage.getItem(RETIRE_KEY));
    setStatus(submitted ? `Already submitted ${sessionStorage.getItem(OP_KEY)}. Check TzKT before retrying.`
      : "wtf.tez is connected. Review the code hash and request your Kukai signature.");
  } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
  finally { connectButton.disabled = false; }
});

originateButton.addEventListener("click", async () => {
  if (!connected || submitted) return;
  originateButton.disabled = true;
  setStatus("Rechecking Mainnet and preparing Kukai…");
  try {
    const { tezos, code } = await verifiedPlan();
    await assertNetworkReadyForSend(ADMIN, { network: "mainnet", rpcUrl: RPC });
    const operation = await tezos.wallet.originate({ code, init: plan.storage } as never).send();
    if (!/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(operation.opHash)) {
      throw new Error("Wallet returned no valid operation hash. Check Kukai before retrying.");
    }
    submitted = true;
    sessionStorage.setItem(OP_KEY, operation.opHash);
    setStatus(`Kukai submitted ${operation.opHash}. Waiting for confirmation…`);
    await operation.confirmation(1);
    const contract = await operation.contract();
    sessionStorage.setItem(CONTRACT_KEY, contract.address);
    retireButton.disabled = false;
    setStatus(`HORF Rooms V3 originated at ${contract.address}. Operation ${operation.opHash}. Verify on TzKT before enabling deposits.`);
  } catch (error) {
    setStatus(`${error instanceof Error ? error.message : String(error)}${submitted ? " Check TzKT; do not submit a duplicate." : ""}`, true);
    if (!submitted) originateButton.disabled = false;
  }
});

retireButton.addEventListener("click", async () => {
  if (!connected || retiring || !sessionStorage.getItem(CONTRACT_KEY) || sessionStorage.getItem(RETIRE_KEY)) return;
  retiring = true;
  retireButton.disabled = true;
  setStatus("Checking public V3 readiness before invalidating V2 permits…");
  try {
    const { tezos } = await verifiedPlan();
    await assertV3Live();
    await assertNetworkReadyForSend(ADMIN, { network: "mainnet", rpcUrl: RPC });
    const before = await v2OracleEpoch(tezos);
    const v2 = await tezos.wallet.at(V2_STABLES);
    const operation = await v2.methodsObject.bump_oracle_epoch().send();
    if (!/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(operation.opHash)) {
      throw new Error("Wallet returned no valid V2 epoch operation hash. Check Kukai before retrying.");
    }
    sessionStorage.setItem(RETIRE_KEY, operation.opHash);
    setStatus(`Kukai submitted V2 permit invalidation ${operation.opHash}. Waiting for confirmation…`);
    await operation.confirmation(1);
    const after = await v2OracleEpoch(tezos);
    if (after <= before) throw new Error("V2 oracle epoch did not advance. Inspect the operation before continuing.");
    setStatus(`Old V2 deposit permits invalidated. Epoch ${before} → ${after}; operation ${operation.opHash}. Existing claims and cancellations remain open.`);
  } catch (error) {
    setStatus(`${error instanceof Error ? error.message : String(error)}${sessionStorage.getItem(RETIRE_KEY) ? " Inspect the submitted transaction; do not resend." : ""}`, true);
    if (!sessionStorage.getItem(RETIRE_KEY)) retireButton.disabled = false;
  } finally { retiring = false; }
});

codeHash.textContent = plan.contractJsonSha256;
oracleKey.textContent = plan.oraclePublicKey;
void verifiedPlan().then(() => setStatus(submitted
  ? `Already submitted ${sessionStorage.getItem(OP_KEY)}. Check TzKT before retrying.`
  : "Compiled V3 code, storage, and Mainnet RPC verified. Connect wtf.tez in Kukai."
)).catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
