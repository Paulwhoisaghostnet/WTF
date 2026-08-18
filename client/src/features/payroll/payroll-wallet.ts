import { ValidationResult, validateAddress } from "@taquito/utils";
import { WTF_TOKEN } from "@shared/types";
import { loadOctezConnect, loadTaquito } from "../../lib/tezos/loaders";
import { OctezConnectTaquitoWalletProvider } from "../../lib/tezos/wallet";

export const PAYROLL_NETWORK = "mainnet";
export const PAYROLL_RPC_URL = "https://tezos-mainnet.octez.io/";
export const PAYROLL_CHAIN_ID = "NetXdQprcVkpaWU";
export const PAYROLL_STORAGE_PREFIX = "wtf-payroll";

const FEATURED_WALLETS = ["kukai", "temple", "umami"];
const CONNECT_TIMEOUT_MS = 35_000;

export type PayrollAsset = "WTF" | "XTZ";

export type PayrollBalances = {
  xtzMutez: string;
  wtfAtomic: string;
};

export type PayrollTransferRequest = {
  asset: PayrollAsset;
  from: string;
  recipient: string;
  atomicAmount: string;
};

export interface PayrollWalletController {
  connect(): Promise<string>;
  disconnect(): Promise<void>;
  getActiveAddress(): Promise<string | null>;
  getBalances(expectedAddress: string): Promise<PayrollBalances>;
  transfer(request: PayrollTransferRequest): Promise<string>;
}

declare global {
  interface Window {
    __WTF_PAYROLL_WALLET_HARNESS__?: PayrollWalletController;
  }
}

function withTimeout<T>(task: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    task,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), CONNECT_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function parseDecimalToAtomic(value: string, decimals: number): string {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) {
    throw new Error("Enter a positive decimal amount.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Use no more than ${decimals} decimal places.`);
  }
  const atomic = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction || "").padEnd(decimals, "0") || "0");
  if (atomic <= 0n) throw new Error("Amount must be greater than zero.");
  return atomic.toString();
}

export function formatAtomic(value: string, decimals: number, maxFractionDigits = decimals): string {
  const atomic = BigInt(value || "0");
  const divisor = 10n ** BigInt(decimals);
  const whole = atomic / divisor;
  const fraction = (atomic % divisor).toString().padStart(decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function assertPayrollRecipient(recipient: string): string {
  const normalized = recipient.trim();
  if (validateAddress(normalized) !== ValidationResult.VALID) {
    throw new Error("Enter a valid Tezos wallet or contract address.");
  }
  return normalized;
}

function sameAddress(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

export function assertPayrollWalletNetwork(network: unknown): void {
  if (network !== PAYROLL_NETWORK) {
    throw new Error(
      `Payroll requires a Tezos mainnet wallet; the active wallet reported ${String(network || "no network")}.`,
    );
  }
}

export class PayrollWalletSession implements PayrollWalletController {
  private client: any = null;
  private tezos: any = null;
  private connectedAddress: string | null = null;
  private connectPromise: Promise<string> | null = null;

  private async ensureClient() {
    if (this.client && this.tezos) return;
    const [{ DAppClient, BeaconEvent, LocalStorage }, { TezosToolkit }] = await Promise.all([
      loadOctezConnect() as Promise<any>,
      loadTaquito() as Promise<any>,
    ]);
    this.client = new DAppClient({
      name: "wtfOS Payroll",
      description: "Isolated strict-admin funding wallet for WTF and XTZ transfers.",
      storage: new LocalStorage(PAYROLL_STORAGE_PREFIX),
      network: { type: PAYROLL_NETWORK, rpcUrl: PAYROLL_RPC_URL },
      preferredNetwork: PAYROLL_NETWORK,
      enableMetrics: false,
      featuredWallets: FEATURED_WALLETS,
      requestTimeoutMs: 30_000,
    });
    await this.client.subscribeToEvent(
      BeaconEvent?.ACTIVE_ACCOUNT_SET ?? "ACTIVE_ACCOUNT_SET",
      async () => {},
    );
    this.tezos = new TezosToolkit(PAYROLL_RPC_URL);
    this.tezos.setWalletProvider(new OctezConnectTaquitoWalletProvider(this.client));
  }

  async connect(): Promise<string> {
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = withTimeout(
      (async () => {
        await this.ensureClient();
        await this.client.clearActiveAccount();
        if (typeof this.client.removeAllAccounts === "function") {
          await this.client.removeAllAccounts();
        }
        const permissions = await this.client.requestPermissions({
          network: { type: PAYROLL_NETWORK, rpcUrl: PAYROLL_RPC_URL },
        });
        const active = await this.client.getActiveAccount();
        assertPayrollWalletNetwork(active?.network?.type);
        const address = permissions?.address || active?.address || "";
        if (!address) throw new Error("Wallet permissions completed without an active address.");
        const chainId = await this.tezos.rpc.getChainId();
        if (chainId !== PAYROLL_CHAIN_ID) {
          throw new Error(`Payroll requires Tezos mainnet (${PAYROLL_CHAIN_ID}); wallet RPC returned ${chainId}.`);
        }
        this.connectedAddress = address;
        return address;
      })(),
      "Payroll wallet connection timed out. Close stale wallet prompts and try Connect funding wallet again.",
    ).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.clearActiveAccount().catch(() => undefined);
      if (typeof this.client.removeAllAccounts === "function") {
        await this.client.removeAllAccounts().catch(() => undefined);
      }
      if (typeof this.client.removeAllPeers === "function") {
        await this.client.removeAllPeers(false).catch(() => undefined);
      }
    }
    this.client = null;
    this.tezos = null;
    this.connectedAddress = null;
    this.connectPromise = null;
  }

  async getActiveAddress(): Promise<string | null> {
    if (!this.client) return null;
    const active = await this.client.getActiveAccount();
    return active?.address || null;
  }

  private async assertReadyForSend(expectedAddress: string) {
    if (!this.client || !this.tezos || !this.connectedAddress) {
      throw new Error("Connect a Payroll funding wallet before preparing a transfer.");
    }
    const active = await this.client.getActiveAccount();
    const activeAddress = active?.address || null;
    assertPayrollWalletNetwork(active?.network?.type);
    if (!activeAddress || !sameAddress(activeAddress, expectedAddress) || !sameAddress(activeAddress, this.connectedAddress)) {
      throw new Error(
        `Payroll prepared this transfer for ${expectedAddress}, but the active signing wallet is ${activeAddress || "not connected"}. Reconnect the intended funding wallet.`,
      );
    }
    const chainId = await this.tezos.rpc.getChainId();
    if (chainId !== PAYROLL_CHAIN_ID) {
      throw new Error(`Payroll blocked the transfer because the active RPC is ${chainId}, not Tezos mainnet.`);
    }
  }

  async getBalances(expectedAddress: string): Promise<PayrollBalances> {
    await this.assertReadyForSend(expectedAddress);
    const [xtzBalance, contract] = await Promise.all([
      this.tezos.tz.getBalance(expectedAddress),
      this.tezos.wallet.at(WTF_TOKEN.contract),
    ]);
    const storage: any = await contract.storage();
    const wtfBalance = await storage.ledger.get({
      0: expectedAddress,
      1: WTF_TOKEN.tokenId,
    });
    return {
      xtzMutez: xtzBalance.toFixed(0),
      wtfAtomic: wtfBalance?.toString() || "0",
    };
  }

  async transfer(request: PayrollTransferRequest): Promise<string> {
    await this.assertReadyForSend(request.from);
    const recipient = assertPayrollRecipient(request.recipient);
    if (request.asset === "XTZ") {
      const mutez = BigInt(request.atomicAmount);
      if (mutez > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("XTZ amount exceeds the browser wallet's safe transaction range.");
      }
      const operation = await this.tezos.wallet
        .transfer({ to: recipient, amount: Number(mutez), mutez: true })
        .send();
      await operation.confirmation(1);
      return operation.opHash;
    }

    const contract = await this.tezos.wallet.at(WTF_TOKEN.contract);
    const operation = await contract.methodsObject
      .transfer([
        {
          from_: request.from,
          txs: [
            {
              to_: recipient,
              token_id: String(WTF_TOKEN.tokenId),
              amount: request.atomicAmount,
            },
          ],
        },
      ])
      .send();
    await operation.confirmation(1);
    return operation.opHash;
  }
}

export function getPayrollWalletController(): PayrollWalletController {
  if (typeof window !== "undefined" && window.__WTF_PAYROLL_WALLET_HARNESS__) {
    return window.__WTF_PAYROLL_WALLET_HARNESS__;
  }
  return new PayrollWalletSession();
}
