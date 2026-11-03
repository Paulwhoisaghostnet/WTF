import plan from "./plan/preflight.json";
import origination from "./plan/origination.json";
import { assertNetworkReadyForSend } from "../../client/src/lib/tezos/preflight";
import { connectWallet, getTezos } from "../../client/src/lib/tezos/wallet";

const ADMIN = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const WTF_CONTRACT = "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";
const MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
const RPC = `${window.location.origin}/horf-mainnet-rpc`;
const connectButton = document.getElementById("connect") as HTMLButtonElement;
const originateButton = document.getElementById("originate") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;
const estimate = document.getElementById("estimate") as HTMLElement;
const codeHash = document.getElementById("code-hash") as HTMLElement;
let connected = false;
const priorHash = sessionStorage.getItem("horf:horse-origination-hash");
if (priorHash && !/^o[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(priorHash)) {
  sessionStorage.removeItem("horf:horse-origination-hash");
}
let submitted = Boolean(sessionStorage.getItem("horf:horse-origination-hash"));

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyPlan() {
  if (plan.network !== "mainnet" || plan.chainId !== MAINNET_CHAIN_ID ||
      plan.sourceWallet !== ADMIN || plan.sourceWtfContract !== WTF_CONTRACT ||
      plan.token.symbol !== "HORSE" || plan.token.tokenId !== "0" || plan.token.decimals !== 8) {
    throw new Error("HORSE origination plan does not match the requested wallet, token, and Mainnet.");
  }
  if (await digest(origination.code) !== plan.sourceWtfCodeSha256 ||
      await digest(origination.init) !== plan.initSha256) {
    throw new Error("The HORSE code or initial storage differs from the reviewed preflight.");
  }
  const tezos = await getTezos({ network: "mainnet", rpcUrl: RPC });
  if (await tezos.rpc.getChainId() !== MAINNET_CHAIN_ID) throw new Error("RPC is not Tezos Mainnet.");
  const live = await tezos.rpc.getScript(WTF_CONTRACT);
  if (await digest(live.code) !== plan.sourceWtfCodeSha256) {
    throw new Error("The live $WTF code differs from the exact code copy in this plan.");
  }
  return tezos;
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

estimate.textContent = `${(Number(plan.estimate.requiredMutez) / 1_000_000).toFixed(6)} XTZ total estimated fee + burn (refreshes at wallet signing)`;
codeHash.textContent = plan.sourceWtfCodeSha256;

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  setStatus("Checking the exact WTF code and connecting Kukai…");
  try {
    await verifyPlan();
    const wallet = await connectWallet({ network: "mainnet", rpcUrl: RPC });
    if (wallet.address !== ADMIN) {
      throw new Error(`Selected ${wallet.address}; choose the wtf.tez wallet ${ADMIN}.`);
    }
    await assertNetworkReadyForSend(ADMIN, { network: "mainnet", rpcUrl: RPC });
    connected = true;
    originateButton.disabled = submitted;
    setStatus(submitted
      ? `A prior HORSE origination operation was submitted: ${sessionStorage.getItem("horf:horse-origination-hash")}. Check it on TzKT before another request.`
      : "wtf.tez is connected on Mainnet. Review the plan above, then request the signature in Kukai.");
  } catch (error) {
    setStatus(friendlyError(error), true);
  } finally {
    connectButton.disabled = false;
  }
});

originateButton.addEventListener("click", async () => {
  if (!connected || submitted) return;
  originateButton.disabled = true;
  setStatus("Verifying Mainnet and the wtf.tez account before opening the Kukai signing request…");
  try {
    const tezos = await verifyPlan();
    await assertNetworkReadyForSend(ADMIN, { network: "mainnet", rpcUrl: RPC });
    const operation = await tezos.wallet.originate({
      code: origination.code,
      init: origination.init,
    } as never).send();
    if (!/^o[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(operation.opHash)) {
      throw new Error("The wallet returned no valid Tezos operation hash. Check Kukai before retrying.");
    }
    submitted = true;
    sessionStorage.setItem("horf:horse-origination-hash", operation.opHash);
    setStatus(`Kukai submitted operation ${operation.opHash}. Waiting for Tezos confirmation…`);
    await operation.confirmation(1);
    const contract = await operation.contract();
    sessionStorage.setItem("horf:horse-contract-address", contract.address);
    setStatus(`HORSE originated: ${contract.address}. Operation ${operation.opHash}. Verify the code and admin on TzKT before configuring Horf.`);
  } catch (error) {
    setStatus(`${friendlyError(error)}${submitted ? " A transaction was submitted; check the operation before retrying." : ""}`, true);
    if (!submitted) originateButton.disabled = false;
  }
});

void verifyPlan().then(() => {
  setStatus(submitted
    ? `A HORSE origination operation was submitted: ${sessionStorage.getItem("horf:horse-origination-hash")}. Check it on TzKT before another request.`
    : "Exact $WTF code and HORSE storage hashes verified against Tezos Mainnet. Connect wtf.tez in Kukai.");
}).catch((error) => setStatus(friendlyError(error), true));
