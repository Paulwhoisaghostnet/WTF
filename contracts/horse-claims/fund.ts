import funding from "./plan/funding.json";
import codeText from "./artifacts/contract.json?raw";
import manifest from "./artifacts/build-manifest.json";
import { assertNetworkReadyForSend } from "../../client/src/lib/tezos/preflight";
import { connectWallet, getTezos } from "../../client/src/lib/tezos/wallet";

const MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
const ADMIN = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const HORSE_CONTRACT = "KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM";
const ORACLE_PUBLIC_KEY = "edpkv5vGcno1bQEwzPNpUqg3eLBi7j23WrfSjfi7X9DGdBsLXiVThL";
const RPC = `${window.location.origin}/horf-mainnet-rpc`;
const connectButton = document.getElementById("connect") as HTMLButtonElement;
const fundButton = document.getElementById("fund") as HTMLButtonElement;
const amountInput = document.getElementById("amount") as HTMLInputElement;
const preview = document.getElementById("amount-preview") as HTMLElement;
const status = document.getElementById("status") as HTMLElement;
const vaultAddress = document.getElementById("vault-address") as HTMLElement;
const vault = String(funding.vaultAddress || "");
const submittedKey = `horf:horse-claims-funding-hash:${vault}`;
const existingHash = sessionStorage.getItem(submittedKey);
let submitted = !!existingHash;
let connected = false;

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalSections(code: unknown): Array<[string, string]> {
  if (!Array.isArray(code)) throw new Error("Vault Michelson sections are missing.");
  const sections = code.map((section: any) => {
    const key = section.prim === "view"
      ? `view:${section.args?.[0]?.string ?? ""}`
      : String(section.prim ?? "");
    if (!key || key === "view:") throw new Error("Vault Michelson has an unknown section.");
    return [key, JSON.stringify(section)] as [string, string];
  });
  sections.sort(([left], [right]) => left.localeCompare(right));
  if (sections.some(([key], index) => index > 0 && key === sections[index - 1]![0])) {
    throw new Error("Vault Michelson has duplicate sections.");
  }
  return sections;
}

function amountRaw(): string | null {
  const value = amountInput.value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(value);
  if (!match) return null;
  const raw = BigInt(match[1]!) * 100_000_000n + BigInt((match[2] || "").padEnd(8, "0") || "0");
  return raw > 0n ? raw.toString() : null;
}

function refreshAmount() {
  const raw = amountRaw();
  preview.textContent = raw
    ? `${amountInput.value.trim()} HORSE = ${raw} raw units. Verify this exact amount in Kukai.`
    : "Enter a positive HORSE amount with up to eight decimal places.";
  fundButton.disabled = !connected || submitted || !raw;
}

async function verifyVault() {
  if (funding.network !== "tezos-mainnet" || funding.chainId !== MAINNET_CHAIN_ID ||
      funding.admin !== ADMIN || funding.horseContract !== HORSE_CONTRACT ||
      funding.horseTokenId !== 0 || funding.oraclePublicKey !== ORACLE_PUBLIC_KEY ||
      funding.vaultContractJsonSha256 !== manifest.contractJsonSha256 ||
      !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(vault)) {
    throw new Error("The verified Claim Vault funding plan is not configured.");
  }
  if (await sha256(codeText) !== manifest.contractJsonSha256) {
    throw new Error("Compiled Claim Vault code differs from the reviewed build.");
  }
  const tezos = await getTezos({ network: "mainnet", rpcUrl: RPC });
  if (await tezos.rpc.getChainId() !== MAINNET_CHAIN_ID) {
    throw new Error("RPC is not Tezos Mainnet.");
  }
  const script = await tezos.rpc.getScript(vault);
  const expectedCode = JSON.parse(codeText);
  if (JSON.stringify(canonicalSections(script.code)) !== JSON.stringify(canonicalSections(expectedCode))) {
    throw new Error("On-chain vault code differs from the reviewed HORSE Claim Vault.");
  }
  // RPC returns optimized flat storage bytes; Taquito decodes annotations and
  // addresses against the verified on-chain storage type.
  const decodedStorage = await (await tezos.contract.at(vault)).storage() as any;
  if (decodedStorage.admin !== ADMIN || decodedStorage.horse_contract !== HORSE_CONTRACT ||
      decodedStorage.horse_token_id?.toString() !== "0" ||
      decodedStorage.oracle_key !== ORACLE_PUBLIC_KEY) {
    throw new Error("On-chain vault storage differs from the reviewed admin, token, or oracle.");
  }
  return tezos;
}

vaultAddress.textContent = vault || "Awaiting verified origination…";
amountInput.addEventListener("input", refreshAmount);
connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  setStatus("Checking the on-chain vault and connecting wtf.tez…");
  try {
    await verifyVault();
    const wallet = await connectWallet({ network: "mainnet", rpcUrl: RPC });
    if (wallet.address !== ADMIN) throw new Error(`Selected ${wallet.address}; choose wtf.tez ${ADMIN}.`);
    await assertNetworkReadyForSend(ADMIN, { network: "mainnet", rpcUrl: RPC });
    connected = true;
    refreshAmount();
    setStatus(submitted
      ? `Funding operation ${existingHash} was already submitted in this tab. Check TzKT before another transfer.`
      : "wtf.tez and the verified Mainnet vault are ready. Enter the HORSE amount to fund.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    connectButton.disabled = false;
  }
});

fundButton.addEventListener("click", async () => {
  const raw = amountRaw();
  if (!connected || submitted || !raw) return;
  fundButton.disabled = true;
  setStatus("Rechecking the vault and HORSE amount before opening Kukai…");
  try {
    const tezos = await verifyVault();
    await assertNetworkReadyForSend(ADMIN, { network: "mainnet", rpcUrl: RPC });
    const horse = await tezos.wallet.at(HORSE_CONTRACT);
    if (!horse.methodsObject.transfer) throw new Error("HORSE has no FA2 transfer entrypoint.");
    const operation = await horse.methodsObject.transfer([{
      from_: ADMIN,
      txs: [{ to_: vault, token_id: "0", amount: raw }],
    }]).send();
    if (!/^o[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(operation.opHash)) {
      throw new Error("Wallet returned no valid operation hash. Check Kukai before retrying.");
    }
    submitted = true;
    sessionStorage.setItem(submittedKey, operation.opHash);
    setStatus(`Kukai submitted funding operation ${operation.opHash}. Waiting for confirmation…`);
    await operation.confirmation(1);
    setStatus(`HORSE funding confirmed: ${amountInput.value.trim()} HORSE to ${vault}. Operation ${operation.opHash}.`);
  } catch (error) {
    setStatus(`${error instanceof Error ? error.message : String(error)}${submitted ? " A transaction was submitted; check TzKT before retrying." : ""}`, true);
    if (!submitted) refreshAmount();
  }
});

refreshAmount();
void verifyVault().then(() => setStatus(submitted
  ? `Funding operation ${existingHash} was already submitted in this tab. Check TzKT before another transfer.`
  : "On-chain Claim Vault code, storage, HORSE token, and Mainnet RPC verified. Connect wtf.tez."
)).catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
