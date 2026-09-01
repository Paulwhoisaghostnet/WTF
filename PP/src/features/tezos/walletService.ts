import {
  BeaconEvent,
  DAppClient,
  NetworkType,
  PermissionScope,
  SigningType,
  type AccountInfo,
} from "@tezos-x/octez.connect-sdk";
import { TezosToolkit } from "@taquito/taquito";

// Use mainnet for production
const RPC_URL = "https://tezos-mainnet.octez.io/";
const NETWORK_TYPE = NetworkType.MAINNET;

// Debug logging - only enabled in development mode
const DEBUG = typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';

// Stabilization delay for Octez Connect transport layer initialization.
// Wallet transports can still need a short settle period immediately after
// requestPermissions() completes, before follow-up signing operations are stable.
const CONNECTION_STABILIZATION_DELAY_MS = 500;

const walletConnectProjectId =
  typeof import.meta !== "undefined" && typeof (import.meta as any).env?.VITE_WALLETCONNECT_PROJECT_ID === "string"
    ? (import.meta as any).env.VITE_WALLETCONNECT_PROJECT_ID.trim()
    : "";

const log = (message: string, data?: unknown) => {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    if (data !== undefined) {
      console.log(`[WalletService ${timestamp}] ${message}`, data);
    } else {
      console.log(`[WalletService ${timestamp}] ${message}`);
    }
  }
};

type WalletParamsWithLimits = {
  fee?: number | string;
  gasLimit?: number | string;
  storageLimit?: number | string;
  [key: string]: unknown;
};

type RpcOperationWithLimits = {
  fee?: string | number;
  gas_limit?: string | number;
  storage_limit?: string | number;
  [key: string]: unknown;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const signingTypeForWatermark = (watermark?: Uint8Array): SigningType => {
  if (!watermark?.length) return SigningType.RAW;
  if (watermark[0] === 3) return SigningType.OPERATION;
  if (watermark[0] === 5) return SigningType.MICHELINE;
  return SigningType.RAW;
};

const payloadWithWatermark = (bytes: string, watermark?: Uint8Array): string =>
  watermark?.length ? `${bytesToHex(watermark)}${bytes}` : bytes;

class OctezTaquitoWalletProvider {
  readonly client: DAppClient;

  constructor() {
    this.client = new DAppClient({
      name: "Particle Painter",
      preferredNetwork: NETWORK_TYPE,
      network: {
        type: NETWORK_TYPE,
      },
      enableMetrics: false,
      featuredWallets: ["kukai", "temple", "umami"],
      ...(walletConnectProjectId ? { walletConnectOptions: { projectId: walletConnectProjectId } } : {}),
    } as any);
  }

  async requestPermissions(): Promise<string> {
    const permissions = await this.client.requestPermissions({
      scopes: [PermissionScope.SIGN, PermissionScope.OPERATION_REQUEST],
    });
    return permissions.address;
  }

  async clearActiveAccount(): Promise<void> {
    await this.client.clearActiveAccount();
    if (typeof (this.client as any).removeAllAccounts === "function") {
      await (this.client as any).removeAllAccounts();
    }
    if (typeof (this.client as any).removeAllPeers === "function") {
      await (this.client as any).removeAllPeers();
    }
  }

  private async getRequiredAccount(): Promise<AccountInfo> {
    const account = await this.client.getActiveAccount();
    if (!account?.address) {
      throw new Error("Octez Connect needs wallet permissions before signing.");
    }
    return account;
  }

  async getPKH(): Promise<string> {
    const account = await this.getRequiredAccount();
    return account.address;
  }

  async getPK(): Promise<string> {
    const account = await this.getRequiredAccount();
    return account.publicKey || "";
  }

  private formatParameters<T extends WalletParamsWithLimits>(params: T): T {
    return {
      ...params,
      ...(params.fee !== undefined ? { fee: params.fee.toString() } : {}),
      ...(params.gasLimit !== undefined ? { gasLimit: params.gasLimit.toString() } : {}),
      ...(params.storageLimit !== undefined ? { storageLimit: params.storageLimit.toString() } : {}),
    };
  }

  private removeDefaultParams<T extends RpcOperationWithLimits>(
    params: WalletParamsWithLimits,
    operatedParams: T,
  ): T {
    const cleaned = { ...operatedParams };
    if (params.fee === undefined) delete cleaned.fee;
    if (params.gasLimit === undefined) delete cleaned.gas_limit;
    if (params.storageLimit === undefined) delete cleaned.storage_limit;
    return cleaned;
  }

  private async mapParams<T extends WalletParamsWithLimits>(
    params: () => Promise<T>,
    createOperation: (params: T) => Promise<RpcOperationWithLimits>,
  ) {
    const walletParams = await params();
    return this.removeDefaultParams(
      walletParams,
      await createOperation(this.formatParameters(walletParams)),
    );
  }

  async mapTransferParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createTransferOperation } = (await import("@taquito/taquito")) as any;
    return this.mapParams(params, createTransferOperation);
  }

  async mapTransferTicketParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createTransferTicketOperation } = (await import("@taquito/taquito")) as any;
    return this.mapParams(params, createTransferTicketOperation);
  }

  async mapOriginateParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createOriginationOperation } = (await import("@taquito/taquito")) as any;
    return this.mapParams(params, createOriginationOperation);
  }

  async mapDelegateParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createSetDelegateOperation } = (await import("@taquito/taquito")) as any;
    return this.mapParams(params, createSetDelegateOperation);
  }

  async mapIncreasePaidStorageWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createIncreasePaidStorageOperation } = (await import("@taquito/taquito")) as any;
    return this.mapParams(params, createIncreasePaidStorageOperation);
  }

  async mapRegisterGlobalConstantWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createRegisterGlobalConstantOperation } = (await import("@taquito/taquito")) as any;
    return this.mapParams(params, createRegisterGlobalConstantOperation);
  }

  async mapStakeParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createTransferOperation } = (await import("@taquito/taquito")) as any;
    return this.mapParams(params, createTransferOperation);
  }

  async mapUnstakeParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createTransferOperation } = (await import("@taquito/taquito")) as any;
    return this.mapParams(params, createTransferOperation);
  }

  async mapFinalizeUnstakeParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createTransferOperation } = (await import("@taquito/taquito")) as any;
    return this.mapParams(params, createTransferOperation);
  }

  async sendOperations(params: any[]): Promise<string> {
    await this.getRequiredAccount();
    const result = await this.client.requestOperation({ operationDetails: params });
    if (!result?.transactionHash) {
      throw new Error("Octez Connect did not return an operation hash.");
    }
    return result.transactionHash;
  }

  async sign(bytes: string, watermark?: Uint8Array): Promise<string> {
    await this.getRequiredAccount();
    const result = await this.client.requestSignPayload({
      signingType: signingTypeForWatermark(watermark),
      payload: payloadWithWatermark(bytes, watermark),
    });
    if (!result?.signature) {
      throw new Error("Octez Connect did not return a signature.");
    }
    return result.signature;
  }
}

class WalletService {
  private wallet: OctezTaquitoWalletProvider | null = null;
  private tezos: TezosToolkit | null = null;
  private userAddress: string | null = null;
  private initialized: boolean = false;
  private activeAccountResolver: ((account: AccountInfo) => void) | null = null;
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // Track connection readiness for signing operations
  private connectionReady: boolean = false;
  private connectionReadyPromise: Promise<void> | null = null;
  private connectionReadyResolver: (() => void) | null = null;

  private async initialize() {
    if (this.initialized) return;
    
    log("Initializing wallet...");
    
    try {
      this.wallet = new OctezTaquitoWalletProvider();
      
      log("Octez Connect wallet provider created");

      // Subscribe to ACTIVE_ACCOUNT_SET event before requesting permissions
      // This is required by Octez Connect v4.x for proper account management.
      await this.wallet.client.subscribeToEvent(
        BeaconEvent.ACTIVE_ACCOUNT_SET,
        (account) => {
          log("ACTIVE_ACCOUNT_SET event received", account);
          if (account) {
            this.userAddress = account.address;
            // Resolve any pending connection promise and clear the timeout
            if (this.activeAccountResolver) {
              if (this.connectionTimeoutId) {
                clearTimeout(this.connectionTimeoutId);
                this.connectionTimeoutId = null;
              }
              this.activeAccountResolver(account);
              this.activeAccountResolver = null;
            }
          }
        }
      );
      
      log("Subscribed to ACTIVE_ACCOUNT_SET event");

      this.initialized = true;
      log("Wallet initialization complete");
    } catch (error) {
      console.error("Failed to initialize wallet:", error);
      log("Wallet initialization failed", error);
      throw error;
    }
  }

  async connectWallet(): Promise<{ address: string; balance: number }> {
    log("connectWallet called");
    
    try {
      // Initialize wallet on first use
      await this.initialize();
      
      if (!this.wallet) {
        throw new Error("Failed to initialize wallet");
      }
      
      log("Wallet initialized, creating connection promise...");

      // Reset connection ready state
      this.connectionReady = false;
      this.connectionReadyPromise = new Promise<void>((resolve) => {
        this.connectionReadyResolver = resolve;
      });

      // Create a promise to wait for the active account from the subscription
      const activeAccountPromise = new Promise<AccountInfo>((resolve, reject) => {
        this.activeAccountResolver = resolve;
        // Set a timeout in case the account is never set
        this.connectionTimeoutId = setTimeout(() => {
          if (this.activeAccountResolver) {
            this.activeAccountResolver = null;
            this.connectionTimeoutId = null;
            log("Timeout waiting for active account after 60 seconds");
            reject(new Error("Timeout waiting for active account"));
          }
        }, 60000); // 60 second timeout
      });
      
      log("Requesting permissions...");

      // Request permissions - this will trigger ACTIVE_ACCOUNT_SET event
      // Network is already configured in the Octez provider constructor.
      await this.wallet.requestPermissions();
      
      log("Permissions request completed, waiting for active account...");
      
      // Wait for the active account from the subscription
      const activeAccount = await activeAccountPromise;
      
      log("Active account received", { address: activeAccount.address });
      
      this.userAddress = activeAccount.address;

      // Initialize Tezos toolkit
      this.tezos = new TezosToolkit(RPC_URL);
      this.tezos.setWalletProvider(this.wallet as any);
      
      log("Tezos toolkit initialized");

      // Get balance
      const balance = await this.tezos.tz.getBalance(this.userAddress);
      const balanceInTez = balance.toNumber() / 1000000;
      
      log("Balance retrieved", { balanceInTez });

      // Mark connection as ready for signing operations after a brief stabilization delay
      // This helps ensure the Octez Connect transport layer is fully initialized.
      setTimeout(() => {
        this.connectionReady = true;
        if (this.connectionReadyResolver) {
          this.connectionReadyResolver();
          this.connectionReadyResolver = null;
        }
        log("Connection marked as ready for signing");
      }, CONNECTION_STABILIZATION_DELAY_MS);

      return {
        address: this.userAddress,
        balance: balanceInTez,
      };
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      log("connectWallet failed", error);
      throw error;
    }
  }

  async disconnectWallet(): Promise<void> {
    log("disconnectWallet called");
    
    try {
      if (this.wallet) {
        await this.wallet.clearActiveAccount();
        this.wallet = null;
        this.tezos = null;
        this.userAddress = null;
        // Reset initialized flag to allow full reinitialization on next connect
        // This ensures the ACTIVE_ACCOUNT_SET subscription is set up again
        this.initialized = false;
        // Reset connection ready state
        this.connectionReady = false;
        this.connectionReadyPromise = null;
        this.connectionReadyResolver = null;
        
        log("Wallet disconnected successfully");
      }
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
      log("disconnectWallet failed", error);
      throw error;
    }
  }

  async signMessage(message: string): Promise<string> {
    log("signMessage called", { message });
    
    if (!this.wallet) {
      log("signMessage failed: wallet not connected");
      throw new Error("Wallet not connected");
    }

    try {
      // Wait for connection to be ready before signing
      // This prevents race conditions where signing is attempted before
      // the Octez Connect transport layer is fully initialized.
      if (!this.connectionReady && this.connectionReadyPromise) {
        log("Waiting for connection to be ready before signing...");
        await this.connectionReadyPromise;
        log("Connection is now ready");
      }

      // Verify active account exists before signing.
      const activeAccount = await this.wallet.client.getActiveAccount();
      log("Active account check", { hasActiveAccount: !!activeAccount, address: activeAccount?.address });
      
      if (!activeAccount) {
        log("signMessage failed: no active account found");
        throw new Error("No active account. Please reconnect your wallet.");
      }

      log("Requesting sign payload...");
      
      const result = await this.wallet.client.requestSignPayload({
        signingType: SigningType.RAW,
        payload: message,
      });
      
      log("Sign payload successful");
      
      return result.signature;
    } catch (error) {
      console.error("Failed to sign message:", error);
      log("signMessage failed with error", {
        error,
        errorType: (error as { errorType?: string })?.errorType,
        errorMessage: (error as { message?: string })?.message,
      });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.userAddress !== null;
  }

  getUserAddress(): string | null {
    return this.userAddress;
  }

  getTezos(): TezosToolkit | null {
    return this.tezos;
  }

  getWallet(): OctezTaquitoWalletProvider | null {
    return this.wallet;
  }
}

// Export a singleton instance
export const walletService = new WalletService();
